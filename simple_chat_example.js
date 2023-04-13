import readline from "readline";
import SyncService from "./sync.js";
const chat_messages = [];

const syncService = new SyncService("TestServer 1", 8002, 8001, false);

syncService.defineSync("test", {
  getData: async (externalId) => {
    return chat_messages.filter((message) => message.externalId > externalId);
  },
  fetchInsert: async () => {
    return chat_messages.find((message) => message.externalId == null);
  },
  updateLocal: async (data, externalId) => {
    const message = chat_messages.find((message) => message.externalId == null);
    message.externalId = externalId;
  },
  getLatestExternalId: async () => {
    return chat_messages.reduce((max, message) => {
      if (message.externalId > max) {
        return message.externalId;
      } else {
        return max;
      }
    }, 0);
  },
  insert: async (data, externalId) => {
    chat_messages.push({
      message: data.message,
      date: data.date,
      externalId,
    });
    console.clear();
    console.log("Messages:");
    chat_messages.forEach((message) => {
      console.log(`${message.message}`);
    });
  },
});

syncService.start();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function do_question() {
  rl.question("Message: ", (message) => {
    chat_messages.push({
      message,
      date: new Date(),
      externalId: null,
    });
    do_question();
  });
}

do_question();
