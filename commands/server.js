//Coordsync server commands

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
