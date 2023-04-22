export const get_index_from_name = async (self, name, identifier) => {
  self.logger("Getting index for " + identifier + " from " + name);
  const db = self.index_db;
  return await db.findOneAsync({ identifier, name });
};

export const get_latest_index = async (self, name, identifier) => {
  self.logger("Getting latest index for " + identifier + " from " + name);
  const index_found = await get_index_from_name(self, name, identifier);
  self.logger("Index found: " + JSON.stringify(index_found));
  return index_found?.index || 0;
};

export const insert_or_update_index = async (
  self,
  name,
  identifier,
  index,
  child_call = false
) => {
  const db = self.index_db;
  const existing_index = await get_index_from_name(self, name, identifier);
  if (existing_index) {
    existing_index.index = index;
    await db.updateAsync(
      { _id: existing_index._id },
      {
        $set: { index: index },
      }
    );
  } else {
    await db.insertAsync({ identifier, name, index });
  }
  if (!child_call) {
    for (const client of self.clients) {
      insert_or_update_index(self, client.name, identifier, index, true);
    }
  }
};
