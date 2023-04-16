import { get_latest_change, insert_change } from "../changes_db.js";

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
    self.client.emit(
      "get_data",
      dataSync.identifier,
      latest_change ? await dataSync.options.getLatestExternalId() : 0,
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
  if (self.current_queue.identifier === data.identifier) {
    self.current_queue.done.push({
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
  if (self.current_queue.identifier === data.identifier) {
    self.current_queue.done.push({
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
  if (self.current_queue.identifier === data.identifier) {
    self.current_queue.done.push({
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
      if (
        (await options.getData(item.externalId, item.externalId)).length === 0
      ) {
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
