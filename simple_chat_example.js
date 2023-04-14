import readline from "readline";
import SyncService from "./sync.js";
const chat_messages = [];

const syncService = new SyncService("TestServer 1", 8002, 8001, false);

syncService.defineSync("test", {
  getLatestExternalId: async () => {
    return chat_messages.reduce((max, message) => {
      if (message.externalId > max) {
        return message.externalId;
      } else {
        return max;
      }
    }, 0);
  },
  getData: async (externalId) => {
    return chat_messages.filter((message) => message.externalId > externalId);
  },
  afterInsert: async (data, externalId) => {
    const message = chat_messages.find((message) => message.externalId == null);
    message.externalId = externalId;
  },
  fetchInsert: async () => {
    return chat_messages.find((message) => message.externalId == null);
  },
  insert: async (data, externalId) => {
    chat_messages.push({
      message: data.message,
      date: data.date,
      externalId,
      mustUpdate: false,
      lastUpdate: data.lastUpdate,
      mustDelete: false,
    });
    refreshScreen();
  },
  afterUpdate: async (data) => {
    const message = chat_messages.find(
      (message) => message.externalId == data.externalId
    );
    message.mustUpdate = false;
  },
  fetchUpdate: async () => {
    return chat_messages.find((message) => message.mustUpdate == true);
  },
  decideUpdate: (newData) => {
    const localData = chat_messages.find(
      (message) => message.externalId == newData.externalId
    );
    return newData.lastUpdate > localData.lastUpdate;
  },
  update: async (data) => {
    const message = chat_messages.find(
      (message) => message.externalId == data.externalId
    );
    message.message = data.message;
    message.date = data.date;
    message.mustUpdate = null;
    message.lastUpdate = data.lastUpdate;
    message.mustDelete = false;
    refreshScreen();
  },
  afterDelete: async (data) => {
    //Remove from local array
    const index = chat_messages.findIndex(
      (message) => message.externalId == data.externalId
    );
    chat_messages.splice(index, 1);
  },
  fetchDelete: async () => {
    return chat_messages.find((message) => message.mustDelete == true);
  },
  decideDelete: () => {
    return true;
  },
  delete: async (data) => {
    // Remove from local array
    const index = chat_messages.findIndex(
      (message) => message.externalId == data.externalId
    );
    chat_messages.splice(index, 1);
    refreshScreen();
  },
});

syncService.start();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const refreshScreen = () => {
  console.clear();
  console.log("Messages:");
  chat_messages
    .filter((message) => !message.mustDelete)
    .forEach((message) => {
      console.log(`${message.message}`);
    });
};

function do_question() {
  rl.question("Message: ", (message) => {
    // If message has pattern !update;message_index;new_message
    // then update the message
    if (message.startsWith("!update;")) {
      // eslint-disable-next-line no-unused-vars
      const [_, index, newMessage] = message.split(";");
      const messageToUpdate = chat_messages[index];
      messageToUpdate.message = newMessage;
      messageToUpdate.mustUpdate = true;
      messageToUpdate.lastUpdate = new Date();
      messageToUpdate.mustDelete = false;
    } else if (message.startsWith("!delete;")) {
      // eslint-disable-next-line no-unused-vars
      const [_, index] = message.split(";");
      const messageToDelete = chat_messages[index];
      messageToDelete.mustDelete = true;
    } else {
      chat_messages.push({
        message,
        date: new Date(),
        externalId: null,
        mustUpdate: null,
        lastUpdate: new Date(),
        mustDelete: false,
      });
    }
    do_question();
    refreshScreen();
  });
}

do_question();
