export const client_set_clients = (self, socket, clients) => {
  self.logger("Got clients from server");
  self.clients = clients;
};
