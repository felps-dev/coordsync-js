import Datastore from "@seald-io/nedb";

export const open_change_db = (db_name) => {
  const db = new Datastore({
    filename: db_name,
    autoload: true,
  });
  return db;
};

export const insert_change = async (db, identifier, id, type, index) => {
  const last_index =
    (await db.findOneAsync({ identifier }).sort({ index: -1 }))?.index || 0;
  db.insert({ index: index || last_index + 1, identifier, id, type });
};

export const get_changes = async (db, identifier, from) => {
  const change_list = await db.findAsync({ index: { $gt: from }, identifier });
  // Remove duplicated changes, using ID and getting the latest one
  const changes = {};
  for (const change of change_list) {
    changes[change.id] = change;
  }
  return Object.values(changes);
};

export const get_latest_change = async (db, identifier) => {
  return await db.findOneAsync({ identifier }).sort({ index: -1 });
};
