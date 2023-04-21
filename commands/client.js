import {
  get_changes,
  get_latest_change,
  insert_change,
} from "../changes_db.js";

export const client_set_clients = (self, socket, clients) => {
  self.logger("Got clients from server");
  self.logger("Clients: " + JSON.stringify(clients));
  self.clients = clients;
};

export const client_server_validated = async (self, socket) => {
  self.logger("Server said it was valid");
  socket.emit("get_clients");
  self.client_id = socket.id;
  for (const dataSync of self.dataToSync) {
    const latest_change = await get_latest_change(self.db, dataSync.identifier);
    self.logger("Latest change: " + latest_change);
    self.logger("Sending get_data request to server");
    self.logger("Identifier: " + dataSync.identifier);
    self.client.emit(
      "get_data",
      dataSync.identifier,
      await dataSync.options.getLatestExternalId(),
      latest_change
    );
  }
};

export const client_insert_request = (self, socket, data) => {
  self.logger("Got insert request from server");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
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
};

export const client_insert_response = (self, socket, data) => {
  self.logger("Got insert response from server");
  self.logger("Data: " + JSON.stringify(data));
  const queue = self.getQueue(data.identifier, data.externalId);
  if (queue) {
    queue.done.push({
      id: socket.id,
      externalId: data.externalId,
    });
  }
};

export const client_update_request = async (self, socket, data) => {
  self.logger("Got update request from server");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === data.identifier
  );
  if (found) {
    const { options } = found;
    if (await options.decideUpdate(data.data)) {
      options.update(data.data);
      insert_change(self.db, data.identifier, data.externalId, "update");
    }
    socket.emit("update_response", {
      identifier: data.identifier,
      externalId: data.externalId,
    });
  }
};

export const client_update_response = (self, socket, data) => {
  self.logger("Got update response from server");
  self.logger("Data: " + JSON.stringify(data));
  const queue = self.getQueue(data.identifier, data.externalId);
  if (queue) {
    queue.done.push({
      id: socket.id,
      externalId: data.externalId,
    });
  }
};

export const client_delete_request = (self, socket, data) => {
  self.logger("Got delete request from server");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === data.identifier
  );
  if (found) {
    const { options } = found;
    options.delete(data.data);
    insert_change(self.db, data.identifier, data.externalId, "delete");
    socket.emit("delete_response", {
      identifier: data.identifier,
      externalId: data.externalId,
    });
  }
};

export const client_delete_response = (self, socket, data) => {
  self.logger("Got delete response from server");
  self.logger("Data: " + JSON.stringify(data));
  const queue = self.getQueue(data.identifier, data.externalId);
  if (queue) {
    queue.done.push({
      id: socket.id,
      externalId: data.externalId,
    });
  }
};

export const client_set_data = async (
  self,
  socket,
  identifier,
  data,
  changes = []
) => {
  self.logger("Got set data from server");
  self.logger("Data: " + JSON.stringify(data));
  const found = self.dataToSync.find(
    (dataSync) => dataSync.identifier === identifier
  );
  if (found) {
    const { options } = found;
    for (const item of data) {
      const local_data = await options.getData(
        item.externalId,
        item.externalId
      );
      if (local_data.length === 0) {
        await options.insert(item, item.externalId);
      } else {
        await options.update(item);
      }
    }
    for (const change of changes) {
      if (!change) continue;
      if (change.type === "delete") {
        await options.delete(change.id);
      }
      insert_change(self.db, identifier, change.id, change.type, change.index);
    }
  }
};

export const client_get_data = async (
  self,
  socket,
  identifier,
  lastExternalId,
  latestChange
) => {
  self.logger("Server requested data");
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
    const data = await options.getData(Number(lastExternalId) + 1);
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
    self.logger("Sending data to server");
    self.logger("Data: " + JSON.stringify(data));
    socket.emit("set_data", identifier, data, changes);
  }
};
