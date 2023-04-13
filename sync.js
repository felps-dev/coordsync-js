import Diont from "diont";
import { Server as ioServer } from "socket.io";
import { io } from "socket.io-client";
import { client_set_clients } from "./commands/client.js";
import {
  check_valid_server,
  server_get_data,
  server_insert_request,
  server_insert_response,
  set_clients,
  set_clients_everyone,
} from "./commands/server.js";
import { sleep } from "./utils.js";

function simple_log(message, title) {
  console.log(`[${title || "No Title"}] ${message}`);
}

const SERVICE_DISCOVERY_TIMEOUT = 2000;

class SyncService {
  constructor(serviceName, servicePort, syncPort, log_enabled = true) {
    this.diont = Diont();
    this.service = {
      name: serviceName,
      port: servicePort,
    };
    this.syncService = {
      port: syncPort,
    };
    this.serviceFound = false;
    this.serviceOnline = false;
    this.isSyncing = false;
    this.syncInterval = null;
    this.server = null;
    this.client = null;
    this.client_id = null;
    this.clients = [];
    this.dataToSync = [];
    this.current_queue = {
      identifier: null,
      externalId: null,
      done: [],
    };
    this.logger = (message, title) =>
      log_enabled ? simple_log(message, title) : null;
    this.log_enabled = log_enabled;
  }

  defineSync(identifier, options) {
    this.dataToSync.push({
      identifier,
      options,
    });
  }

  async syncInserts(dataSync) {
    const { identifier, options } = dataSync;
    if (!options.fetchInsert) {
      throw new Error("No fetchInsert function defined");
    }
    if (!options.updateLocal) {
      throw new Error("No updateLocal function defined");
    }
    if (!options.getLatestExternalId) {
      throw new Error("No getLatestExternalId function defined");
    }
    const data_to_insert = await options.fetchInsert();
    if (!data_to_insert) {
      return;
    }
    this.logger("Inserting data");
    this.logger(JSON.stringify(data_to_insert));
    const isServer = this.server && this.serviceOnline;
    const socket = isServer ? this.server : this.client;
    //Get the latest external id from this options
    const newExternalId = (await options.getLatestExternalId()) + 1;
    //Emit to all clients and wait until everyone inserted
    this.current_queue = {
      identifier,
      externalId: newExternalId,
      done: [],
    };
    socket.emit("insert_request", {
      identifier,
      data: data_to_insert,
      externalId: newExternalId,
    });
    let allClientsInserted = false;
    this.logger("Waiting for all clients to insert");
    while (!allClientsInserted) {
      await sleep(10);
      if (isServer) {
        for (const client of this.clients) {
          this.logger("Checking client " + client.id);
          const found = this.current_queue.done.find(
            (done) => done.id === client.id
          );
          if (!found) {
            allClientsInserted = false;
            continue;
          }
        }
      } else {
        if (this.current_queue.done.length === 0) {
          allClientsInserted = false;
          continue;
        }
      }
      allClientsInserted = true;
    }
    this.logger("All clients inserted");
    this.logger(JSON.stringify(this.current_queue));
    options.updateLocal(data_to_insert, newExternalId);
  }

  startSyncing() {
    this.syncInterval = setInterval(async () => {
      if (
        ((this.serviceFound && this.client?.connected) ||
          (this.server && this.serviceOnline)) &&
        !this.isSyncing
      ) {
        //Ready to sync
        this.isSyncing = true;
        for (let index = 0; index < this.dataToSync.length; index++) {
          const dataSync = this.dataToSync[index];
          await this.syncInserts(dataSync);
        }
        this.isSyncing = false;
      }
    }, 10);
  }

  listenForServices() {
    this.diont.on("serviceAnnounced", (serviceInfo) => {
      if (serviceInfo.service.name === this.service.name) {
        this.serviceFound = true;
        this.logger(
          "Connecting to client: " +
            serviceInfo.service.host +
            ":" +
            this.syncService.port
        );
        this.connectClient(serviceInfo.service.host, this.syncService.port);
      }
    });
  }

  defineClientCommands(socket) {
    socket.on("valid_server", () => {
      this.logger("Server said it was valid");
      socket.emit("get_clients");
      this.client_id = socket.id;
    });
    socket.on("set_clients", (clients) => {
      client_set_clients(this, socket, clients);
      this.logger("Got clients from server");
      this.logger("Clients: " + JSON.stringify(this.clients));
    });
    socket.on("insert_request", (data) => {
      this.logger("Got insert request from server");
      this.logger("Data: " + JSON.stringify(data));
      const found = this.dataToSync.find(
        (dataSync) => dataSync.identifier === data.identifier
      );
      if (found) {
        const { options } = found;
        options.insert(data.data, data.externalId);
        socket.emit("insert_response", {
          identifier: data.identifier,
          externalId: data.externalId,
        });
      }
    });
    socket.on("insert_response", (data) => {
      this.logger("Got insert response from server");
      this.logger("Data: " + JSON.stringify(data));
      if (this.current_queue.identifier === data.identifier) {
        this.current_queue.done.push({
          id: socket.id,
          externalId: data.externalId,
        });
      }
    });
    socket.on("set_data", async (identifier, data) => {
      this.logger("Got set data from server");
      this.logger("Data: " + JSON.stringify(data));
      const found = this.dataToSync.find(
        (dataSync) => dataSync.identifier === identifier
      );
      if (found) {
        const { options } = found;
        for (const item of data) {
          await options.insert(item, item.externalId);
        }
      }
    });

    socket.on("disconnect", async () => {
      this.logger("Disconnected from server");

      if (await this.connectNextClient()) {
        return;
      }

      this.stop();
      this.start();
    });
  }

  async connectNextClient() {
    await sleep(10);
    this.logger("Client count: " + this.clients.length);
    if (this.clients.length > 0) {
      if (this.clients[0].id === this.client_id) {
        this.logger("First client is this client");
        return false;
      }
      let successFullConnection = false;
      let tries = 0;
      while (!successFullConnection) {
        const next = this.clients.shift();
        this.logger("Next client: " + JSON.stringify(next));
        if (next && next.id !== this.client_id) {
          while (!this.client.connected && tries < 20) {
            this.logger("Connecting to next client, tries: " + tries);
            this.connectClient(next.host, next.port);
            await sleep(5000);
            if (!this.client.connected) {
              this.logger("Client failed to connect");
              tries += 1;
            } else {
              successFullConnection = true;
              this.logger("Client connected");
            }
            await sleep(2000);
          }
        }
      }
      return successFullConnection;
    }
    return false;
  }

  connectClient(host, port) {
    this.client = io(`http://${host}:${port}`, {
      reconnection: false,
      timeout: 3000,
    });

    this.client.on("connect", async () => {
      this.logger("Connected as client");
      this.client.emit("check_valid_server", this.service.name);
      for (const dataSync of this.dataToSync) {
        this.client.emit(
          "get_data",
          dataSync.identifier,
          await dataSync.options.getLatestExternalId()
        );
      }
    });

    this.defineClientCommands(this.client);
    this.client.connect();
    // Add custom listeners to sync data here
  }

  startService() {
    setTimeout(() => {
      if (!this.serviceFound) {
        this.logger("No service found");
        this.logger("Starting service");
        this.diont.announceService(this.service);
        this.startServer();
      }
    }, SERVICE_DISCOVERY_TIMEOUT);
  }

  defineServerCommands(socket) {
    socket.on("check_valid_server", (name) =>
      check_valid_server(this, socket, name)
    );
    socket.on("get_clients", () => set_clients(this, socket));
    socket.on("insert_request", (data) =>
      server_insert_request(this, socket, data)
    );
    socket.on("insert_response", (data) =>
      server_insert_response(this, socket, data)
    );
    socket.on("get_data", (identifier, externalId) => {
      server_get_data(this, socket, identifier, externalId);
    });
    socket.on("disconnect", () => {
      this.logger("Client disconnected");
      this.clients = this.clients.filter((c) => c.id !== socket.id);
      set_clients_everyone(this, socket);
    });
  }

  startServer() {
    this.server = new ioServer();
    this.server.on("connection", (socket) => {
      this.logger("Someone connected to server");
      this.clients.push(socket);
      set_clients_everyone(this, socket);
      this.defineServerCommands(socket);
    });
    this.server.on("error", (e) => {
      this.logger("Error starting service. Trying again in 2 seconds");
      this.logger(e);
      this.stop();
      this.start();
    });
    this.server.listen(this.syncService.port);
    this.serviceOnline = true;
  }

  start() {
    this.logger("Starting");
    this.listenForServices();
    this.startService();
    this.startSyncing();
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
    if (this.client) {
      this.client.disconnect();
    }
    this.client = null;
    this.server = null;
    this.clients = [];
    this.serviceFound = false;
    this.serviceOnline = false;
    this.isSyncing = false;
    clearInterval(this.syncInterval);
    this.logger("Stopped");
  }
}

export default SyncService;
