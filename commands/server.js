//Coordsync server commands

import { processDataAndWaitFeedback } from "./shared.js";

// Check the service name is valid
// If it is, then the server is valid
export const check_valid_server = (self, socket, name) => {
  if (name === self.service.name) {
    self.logger("The client is valid");
    socket.emit("valid_server");
  } else {
    self.logger("The client is not valid, disconnecting");
    socket.emit("disconnect");
  }
};

export const set_clients = (self, socket) => {
  socket.emit(
    "set_clients",
    self.clients.map((c) => {
      const host = c.handshake.headers.host.split(":")[0];
      const port = c.handshake.headers.host.split(":")[1];
      return {
        id: c.id,
        connected: c.connected,
        host,
        port,
      };
    })
  );
};

export const set_clients_everyone = (self, socket) => {
  socket.broadcast.emit(
    "set_clients",
    self.clients.map((c) => {
      const host = c.handshake.headers.host.split(":")[0];
      const port = c.handshake.headers.host.split(":")[1];
      return {
        id: c.id,
        connected: c.connected,
        host,
        port,
      };
    })
  );
};

export const server_insert_response = (self, socket, data) => {
  self.logger("Insert response from client");
  self.logger(JSON.stringify(data));
  const server_queue = self.current_queue;
  if (
    server_queue.identifier === data.identifier &&
    server_queue.externalId == data.externalId
  ) {
    self.current_queue.done.push({
      id: socket.id,
    });
  }
};

export const server_get_data = async (
  self,
  socket,
  identifier,
  lastExternalId
) => {
  self.logger("Client requested data");
  self.logger("Identifier: " + identifier);
  self.logger("Last external id: " + lastExternalId);
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === identifier
  );
  if (found) {
    const { options } = found;
    const data = await options.getData(lastExternalId);
    self.logger("Sending data to client");
    self.logger("Data: " + JSON.stringify(data));
    socket.emit("set_data", identifier, data);
  }
};

export const server_insert_request = async (self, socket, data) => {
  self.logger("Client requested insert");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === data.identifier
  );
  if (found) {
    const { options } = found;

    const newExternalId = (await options.getLatestExternalId()) + 1;
    const data_to_insert = data.data;
    //Emit to all clients and wait until everyone inserted
    await processDataAndWaitFeedback(
      self,
      options,
      data.identifier,
      "insert_request",
      data_to_insert,
      socket,
      true,
      (self, client, found, socket) => !found && client.id !== socket.id
    );
    self.logger("All clients inserted");
    //Insert into local database
    await options.insert(data_to_insert, newExternalId);
    await socket.emit("insert_response", {
      identifier: data.identifier,
      externalId: newExternalId,
    });
  }
};
