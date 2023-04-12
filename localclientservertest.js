import { Server as ioServer } from "socket.io";
import { io } from "socket.io-client";

const server = new ioServer();
server.listen(8002);

server.on("connection", (socket) => {
  console.log("Connected to server");
  socket.on("test", (data) => {
    console.log("Received test message", data);
  });
});

const client = io("http://localhost:8002");
client.on("connect", () => {
  console.log("Connected to client");
  client.emit("test", "Hello from client");
});
