import Diont from "diont";
import { Server as ioServer } from "socket.io";
import { io } from "socket.io-client";
import {
  client_insert_request,
  client_insert_response,
  client_server_validated,
  client_set_clients,
  client_set_data,
} from "./commands/client.js";
import {
  check_valid_server,
  server_get_data,
  server_insert_request,
  server_insert_response,
  set_clients,
  set_clients_everyone,
} from "./commands/server.js";
import { processDataAndWaitFeedback } from "./commands/shared.js";
import {
  PROCESSING_INTERVAL,
  RESTART_ON_ERROR_INTERVAL,
  SERVICE_DISCOVERY_TIMEOUT,
} from "./constants.js";
import { sleep } from "./utils.js";

function simple_log(message, title) {
  console.log(`[${title || "No Title"}] ${message}`);
}

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
    const newExternalId = await processDataAndWaitFeedback(
      this,
      options,
      identifier,
      "insert_request",
      data_to_insert,
      socket
    );
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
    }, 200);
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
    // Server said that this is a valid client
    socket.on("valid_server", () => client_server_validated(this, socket));
    // Server wants to update client list
    socket.on("set_clients", (clients) =>
      client_set_clients(this, socket, clients)
    );
    // Server wants to insert data
    socket.on("insert_request", (data) =>
      client_insert_request(this, socket, data)
    );
    // Server inserted data on all clients and is waiting for response
    socket.on("insert_response", (data) =>
      client_insert_response(this, socket, data)
    );
    // Server wants to update data
    socket.on("set_data", async (identifier, data) =>
      client_set_data(this, socket, identifier, data)
    );
    // Server disconnected, try to connect to next client(Assuming next client is the server)
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
    await sleep(PROCESSING_INTERVAL);
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
          while (!this.client?.connected && tries < 20) {
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
    // When clients connect, we check if they are valid
    socket.on("check_valid_server", (name) =>
      check_valid_server(this, socket, name)
    );
    // Clients can request the list of clients
    socket.on("get_clients", () => set_clients(this, socket));
    // Clients can request a insert, that will be synced to all other clients, and after on server
    socket.on("insert_request", (data) =>
      server_insert_request(this, socket, data)
    );
    // When client has inserted data, it will send a response to the server that it has done so
    socket.on("insert_response", (data) =>
      server_insert_response(this, socket, data)
    );
    // Clients can request data from the server
    socket.on("get_data", (identifier, externalId) => {
      server_get_data(this, socket, identifier, externalId);
    });
    // When a client disconnects, we remove it from the list of clients
    // And send the new list to all clients
    socket.on("disconnect", () => {
      this.logger("Client disconnected");
      this.clients = this.clients.filter((c) => c.id !== socket.id);
      set_clients_everyone(this, socket);
    });
  }

  startServer() {
    this.server = new ioServer();
    // After a client connects, we add it to the list of clients
    // And send the new list to all clients
    this.server.on("connection", (socket) => {
      this.logger("Someone connected to server");
      this.clients.push(socket);
      set_clients_everyone(this, socket);
      this.defineServerCommands(socket);
    });
    // If the server fails to start, we try again in 2 seconds
    // This is to prevent the server from crashing
    this.server.on("error", async (e) => {
      this.logger(
        `Error starting service. Trying again in ${
          RESTART_ON_ERROR_INTERVAL / 1000
        } seconds`
      );
      this.logger(e);
      await sleep(RESTART_ON_ERROR_INTERVAL);
      this.stop();
      this.start();
    });
    this.server.listen(this.syncService.port);
    this.serviceOnline = true;
  }

  start() {
    // Start the service
    this.logger("Starting");
    this.listenForServices();
    this.startService();
    this.startSyncing();
  }

  stop() {
    // Stop the service and clear all variables
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
