import { PROCESSING_INTERVAL } from "../constants.js";
import { sleep } from "../utils.js";

export const processDataAndWaitFeedback = async (
  self,
  options,
  identifier,
  procedure,
  data,
  socket,
  shouldBroadcast = false,
  customCheckingCallback = null
) => {
  //Get the latest external id from this options
  const externalId =
    data.externalId || (await options.getLatestExternalId()) + 1;
  //Emit to all clients and wait until everyone Done
  const server_queue = self.getQueue(identifier, externalId);
  if (server_queue) {
    self.current_queue = self.current_queue.filter(
      (queue) => queue !== server_queue
    );
  }
  const current_queue = {
    identifier: identifier,
    externalId: externalId,
    done: [],
  };
  self.current_queue.push(current_queue);
  const isServer = self.server && self.serviceOnline;
  const emitter = shouldBroadcast ? socket.broadcast : socket;
  emitter.emit(procedure, {
    identifier: identifier,
    data: data,
    externalId: externalId,
  });
  let allClientsDone = false;
  self.logger("Waiting for all clients...");
  while (!allClientsDone) {
    await sleep(PROCESSING_INTERVAL);
    if (isServer) {
      for (const client of self.clients) {
        self.logger("Checking client " + client.id);
        const found = current_queue.done.find((done) => done.id === client.id);
        if (customCheckingCallback) {
          if (!customCheckingCallback(self, client, found, socket)) {
            allClientsDone = false;
            continue;
          }
        } else {
          if (!found) {
            allClientsDone = false;
            continue;
          }
        }
      }
    } else {
      if (current_queue.done.length === 0) {
        allClientsDone = false;
        continue;
      }
    }
    allClientsDone = true;
  }
  self.logger("All clients done");
  self.current_queue = self.current_queue.filter(
    (queue) => queue !== current_queue
  );
  return externalId;
};
