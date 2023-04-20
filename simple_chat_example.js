/* eslint-disable no-console */
import readline from "readline";
import SyncService from "./sync.js";

import Datastore from "@seald-io/nedb";

const chat_database = new Datastore({
  filename: "databases/chat_db_" + process.argv[2] + ".db",
  autoload: true,
});

const syncService = new SyncService(
  "TestServer 1",
  8002,
  8001,
  true,
  "databases/" + process.argv[2]
);

const errors = [];

const logerror = (err) => {
  if (err) {
    errors.push(err);
  }
};

syncService.defineSync("test", {
  getLatestExternalId: async () => {
    const latest = await chat_database
      .findOneAsync({ externalId: { $ne: null } })
      .sort({ externalId: -1 });
    if (latest) {
      return latest.externalId;
    }
    return 0;
  },
  getData: async (from, to) => {
    if (to) {
      return await chat_database.findAsync({
        externalId: { $gte: from, $lte: to },
      });
    }
    return await chat_database.findAsync({ externalId: { $gte: from } });
  },
  afterInsert: async (data, externalId) => {
    await chat_database.updateAsync(
      { _id: data._id },
      { $set: { externalId } },
      {},
      logerror
    );
    refreshScreen();
  },
  fetchInsert: async () => {
    return await chat_database.findOneAsync({ externalId: null });
  },
  insert: async (data, externalId) => {
    await chat_database.insert({
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
    await chat_database.updateAsync(
      { externalId: data.externalId },
      { $set: { mustUpdate: false } },
      {},
      logerror
    );
    refreshScreen();
  },
  fetchUpdate: async () => {
    return await chat_database.findOneAsync({ mustUpdate: true });
  },
  decideUpdate: async (newData) => {
    const localData = await chat_database.findOneAsync({
      externalId: newData.externalId,
    });
    return Date.parse(newData.lastUpdate) > Date.parse(localData.lastUpdate);
  },
  update: async (data) => {
    await chat_database.updateAsync(
      { externalId: data.externalId },
      {
        $set: {
          message: data.message,
          date: data.date,
          mustUpdate: false,
          lastUpdate: data.lastUpdate,
          mustDelete: false,
        },
      },
      {},
      logerror
    );
    refreshScreen();
  },
  afterDelete: async (data) => {
    await chat_database.removeAsync(
      { externalId: Number(data.externalId) },
      {},
      logerror
    );
    refreshScreen();
  },
  fetchDelete: async () => {
    return await chat_database.findOneAsync({ mustDelete: true });
  },
  decideDelete: () => {
    return true;
  },
  delete: async (data) => {
    await chat_database.removeAsync(
      { externalId: Number(data.externalId) },
      {},
      logerror
    );
    refreshScreen();
  },
});

syncService.start();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const refreshScreen = async () => {
  // console.clear();
  console.log("Errors:");
  for (const error of errors) {
    console.log(error);
  }
  console.log("Messages:");
  const messages = await chat_database.findAsync({}).sort({ externalId: 1 });
  for (const message of messages) {
    console.log(`${message.message} - ${message.externalId}`);
  }
};

function do_question() {
  rl.question("Message: ", (message) => {
    // If message has pattern !update;message_index;new_message
    // then update the message
    if (message.startsWith("!update;")) {
      // eslint-disable-next-line no-unused-vars
      const [_, index, newMessage] = message.split(";");
      chat_database.updateAsync(
        { externalId: Number(index) },
        {
          $set: {
            message: newMessage,
            mustUpdate: true,
            lastUpdate: new Date(),
            mustDelete: false,
          },
        },
        {},
        logerror
      );
    } else if (message.startsWith("!delete;")) {
      // eslint-disable-next-line no-unused-vars
      const [_, index] = message.split(";");
      chat_database.updateAsync(
        { externalId: Number(index) },
        {
          $set: {
            mustDelete: true,
          },
        },
        {},
        logerror
      );
    } else {
      chat_database.insert({
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
refreshScreen();
do_question();
