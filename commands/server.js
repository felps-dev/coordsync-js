//Coordsync server commands

import {
  get_changes,
  get_latest_change,
  insert_change,
} from "../changes_db.js";
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

export const server_insert_request = async (self, socket, data) => {
  self.logger("Client requested insert");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === data.identifier
  );
  if (found) {
    const { options } = found;

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
    const newExternalId = (await options.getLatestExternalId()) + 1;
    await options.insert(data_to_insert, newExternalId);
    await socket.emit("insert_response", {
      identifier: data.identifier,
      externalId: newExternalId,
    });
  }
};

export const server_insert_response = (self, socket, data) => {
  self.logger("Insert response from client");
  self.logger(JSON.stringify(data));
  const server_queue = self.getQueue(data.identifier, data.externalId);
  if (server_queue) {
    server_queue.done.push({
      id: socket.id,
    });
  }
};

export const server_update_request = async (self, socket, data) => {
  self.logger("Client requested update");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === data.identifier
  );
  if (found) {
    const { options } = found;

    const data_to_update = data.data;

    if (!(await options.decideUpdate(data.data))) {
      self.logger("Server decided to not update due to decideUpdate function");
      await socket.emit("update_response", {
        identifier: data.identifier,
        externalId: data.externalId,
      });
      return;
    }

    //Emit to all clients and wait until everyone updated
    await processDataAndWaitFeedback(
      self,
      options,
      data.identifier,
      "update_request",
      data_to_update,
      socket,
      true,
      (self, client, found, socket) => !found && client.id !== socket.id
    );
    self.logger("All clients updated");
    //Update local database
    await options.update(data_to_update);
    await insert_change(self.db, data.identifier, data.externalId, "update");
    await socket.emit("update_response", {
      identifier: data.identifier,
      externalId: data.externalId,
    });
  }
};

export const server_update_response = (self, socket, data) => {
  self.logger("Update response from client");
  self.logger(JSON.stringify(data));
  const server_queue = self.getQueue(data.identifier, data.externalId);
  if (server_queue) {
    server_queue.done.push({
      id: socket.id,
    });
  }
};

export const server_delete_request = async (self, socket, data) => {
  self.logger("Client requested delete");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === data.identifier
  );
  if (found) {
    const { options } = found;

    const data_to_delete = data.data;

    if (!options.decideDelete(data.data)) {
      self.logger("Server decided to not delete due to decideDelete function");
      await socket.emit("delete_response", {
        identifier: data.identifier,
        externalId: data.externalId,
      });
      return;
    }

    //Emit to all clients and wait until everyone deleted
    await processDataAndWaitFeedback(
      self,
      options,
      data.identifier,
      "delete_request",
      data_to_delete,
      socket,
      true,
      (self, client, found, socket) => !found && client.id !== socket.id
    );
    self.logger("All clients deleted");
    //Delete from local database
    await options.delete(data_to_delete);
    await insert_change(self.db, data.identifier, data.externalId, "delete");
    await socket.emit("delete_response", {
      identifier: data.identifier,
      externalId: data.externalId,
    });
  }
};

export const server_delete_response = (self, socket, data) => {
  self.logger("Delete response from client");
  self.logger(JSON.stringify(data));
  const server_queue = self.getQueue(data.identifier, data.externalId);
  if (server_queue) {
    server_queue.done.push({
      id: socket.id,
    });
  }
};

export const server_set_data = async (
  self,
  socket,
  identifier,
  data,
  changes = []
) => {
  self.logger("Got set data from client");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === identifier
  );
  if (found) {
    const { options } = found;
    self.logger("Broadcasting data to clients");
    const data_to_send = [];
    for (const item of data) {
      const server_record = await options.getData(
        item.externalId,
        item.externalId
      );
      if (server_record.length === 0) {
        await options.insert(item, item.externalId);
      } else {
        const newExternalId = (await options.getLatestExternalId()) + 1;
        await options.insert(item, newExternalId);
        item.externalId = newExternalId;
        data_to_send.push(server_record[0]);
      }
      data_to_send.push(item);
    }
    for (const change of changes) {
      if (!change) continue;
      if (change.type === "delete") {
        await options.delete(change.id);
      }
      insert_change(self.db, identifier, change.id, change.type, change.index);
    }
    self.logger("Data: " + JSON.stringify(data_to_send));
    self.server.emit("set_data", identifier, data_to_send, changes);
  }
};

export const server_get_data = async (
  self,
  socket,
  identifier,
  lastExternalId,
  latestChange
) => {
  self.logger("Client requested data");
  self.logger("Identifier: " + identifier);
  self.logger("Last external id: " + lastExternalId);
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === identifier
  );
  if (found) {
    const { options } = found;
    if (!options.getData) {
      throw new Error("getData function not defined on " + identifier);
    }
    const server_last_external_id = await options.getLatestExternalId();
    if (server_last_external_id <= lastExternalId) {
      self.logger(
        "Server has less data or equal than client, requesting update"
      );
      const latest_change = await get_latest_change(self.db, identifier);
      await socket.emit(
        "get_data",
        identifier,
        server_last_external_id,
        latest_change ? await options.getLatestExternalId() : 0,
        latest_change
      );
      return;
    }
    const data = await options.getData(lastExternalId);
    const changes =
      (latestChange
        ? await get_changes(self.db, identifier, latestChange.index)
        : [await get_latest_change(self.db, identifier)]) || [];
    for (const change of changes) {
      if (change && change.type === "update") {
        const data_to_update = await options.getData(change.id, change.id);
        if (data_to_update.length > 0) {
          data.push(data_to_update[0]);
        }
      }
    }
    self.logger("Sending data to client");
    self.logger("Data: " + JSON.stringify(data));
    socket.emit("set_data", identifier, data, changes);
  }
};
