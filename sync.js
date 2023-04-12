import Diont from "diont";
import { Server as ioServer } from "socket.io";
import { io } from "socket.io-client";
import { client_set_clients } from "./commands/client.js";
import {
  check_valid_server,
  set_clients,
  set_clients_everyone,
} from "./commands/server.js";
import { sleep } from "./utils.js";

function simple_log(message, title) {
  console.log(`[${title || "No Title"}] ${message}`);
}

const SERVICE_DISCOVERY_TIMEOUT = 2000;

class SyncService {
  constructor(serviceName, servicePort, syncPort) {
    this.diont = Diont();
    this.service = {
      name: serviceName,
      port: servicePort,
    };
    this.syncService = {
      port: syncPort,
    };
    this.serviceFound = false;
    this.server = null;
    this.client = null;
    this.client_id = null;
    this.clients = [];
    this.logger = simple_log;
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
    this.logger("Client count: " + this.clients.length);
    if (this.clients.length > 0) {
      console.log("current", this.client_id, "first", this.clients[0].id);
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

    this.client.on("connect", () => {
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
    socket.on("check_valid_server", (name) =>
      check_valid_server(this, socket, name)
    );
    socket.on("get_clients", () => set_clients(this, socket));
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
  }

  start() {
    this.logger("Starting");
    this.listenForServices();
    this.logger("Starting new service");
    this.startService();
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
    this.logger("Stopped");
  }
}

let syncService = null;

const setup = () => {
  syncService = new SyncService("TestServer 1", 8002, 8001);
  syncService.start();
  return syncService;
};

setup();
