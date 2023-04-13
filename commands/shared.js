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
  const newExternalId = (await options.getLatestExternalId()) + 1;
  //Emit to all clients and wait until everyone inserted
  self.current_queue = {
    identifier,
    externalId: newExternalId,
    done: [],
  };
  const isServer = self.server && self.serviceOnline;
  const emitter = shouldBroadcast ? socket.broadcast : socket;
  emitter.emit(procedure, {
    identifier: identifier,
    data: data,
    externalId: newExternalId,
  });
  let allClientsInserted = false;
  self.logger("Waiting for all clients to insert");
  while (!allClientsInserted) {
    await sleep(PROCESSING_INTERVAL);
    if (isServer) {
      for (const client of self.clients) {
        self.logger("Checking client " + client.id);
        const found = self.current_queue.done.find(
          (done) => done.id === client.id
        );
        if (customCheckingCallback) {
          if (!customCheckingCallback(self, client, found, socket)) {
            allClientsInserted = false;
            continue;
          }
        } else {
          if (!found) {
            allClientsInserted = false;
            continue;
          }
        }
      }
    } else {
      if (self.current_queue.done.length === 0) {
        allClientsInserted = false;
        continue;
      }
    }
    allClientsInserted = true;
  }
  return newExternalId;
};
