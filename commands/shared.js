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
  self.current_queue = {
    identifier,
    externalId: externalId,
    done: [],
  };
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
        const found = self.current_queue.done.find(
          (done) => done.id === client.id
        );
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
      if (self.current_queue.done.length === 0) {
        allClientsDone = false;
        continue;
      }
    }
    allClientsDone = true;
  }
  return externalId;
};
