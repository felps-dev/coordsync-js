- The sync idea consisnts in having a server with latest data
  Inserting:
  Eg:
  Server:
  shared_id, internal_id, description
  1, 1, "server_data"

- Client 1:
  1, 1, "server_data"
  None, 2, "Data"

- Client 2:
  1, 1, "server_data"
  None, 2, "other data"

The client 1 and 2 have different new data, so we need to sync with server

- Server:
  Receives first the data from client 1, so it updates the data
  1, 1, "server_data"
  2, 2, "Data"
  And returns to all clients but client 1 the new data

- Client 1:
  Receives the data from server and updates the data
  1, 1, "server_data"
  2, 2, "Data"

- Client 2:
  Receives the data from server and updates the data
  1, 1, "server_data"
  2, 2, "Data"
  None, 2, "other data"

Do the same with the other client, client 2

```javascript
    syncService.defineSync("chat_message", {
        getLatestExternalId: () => { //Needs to return the latest external_id
            const lastExternalId = messages.all().last().external_id
            return lastExternalId
        },
        isClientNewerThanServer: (last_client_external_id) => { //Checks if client has new data
            // const lastExternalId = messages.all().last().external_id
            // if (last_client_external_id > lastExternalId) {
            //     return true
            // }
            // return false
        },
        getData: (last_external_id) => { //Needs to return data to sync
            const message = messages.find({
                external_id: last_external_id,
            })
            return message
        },
        fetchInsert: () => { //Needs to return data to insert
            const message = messages.find({
                external_id: None,
            })
            return message
        },
        // fetchUpdate: () => { //Needs to return data to update
        //     const message = messages.find({
        //         mustUpdate: true,
        //     })
        //     return message.external_id, message.lastUpdateDateTimestamp, message
        // },
        // fetchDelete: () => { //Needs to return data to delete
        //     const message = messages.find({
        //         mustDelete: true,
        //     })
        //     return message.external_id
        // },
        // mustExecute: (data, external_id) => { //Defines the priority of the data
        //     const message = messages.find({
        //         external_id: external_id,
        //     })
        //     if (message.lastUpdateDateTimestamp > data.lastUpdateDateTimestamp) {
        //         return false
        //     }
        //     return true
        // },
        insert: (data, external_id) => { //Inserts data
            messages.insert(data)
        },
        // update: (data, external_id) => { //Updates data
        //     messages.update(data)
        // },
        // delete: (external_id) => { //Deletes data
        //     messages.delete(external_id)
        // },
        updateLocal: (data, external_id) => { //Updates local data
            messages.update({...data, external_id: external_id})
        },
    })
```

```javascript
    //Client / Server
    sendInserts(){
        const records_to_insert = this.fetchInsert()
        records_to_insert.forEach((record) => {
            const external_id = this.getLatestExternalId()
            if (this.isServer){
                await this.sendToAllClients(record, external_id + 1)
                this.updateLocal(record, external_id + 1)
            }
            else{
                const lastId = await this.sendInsertToServer(record)
                this.updateLocal(record, lastId)
            }
            this.sendInsertToServer(record, external_id)
        })
    }

    connect(){
        const serverLastId = await this.sendLastExternalId()
        const data = await this.getData(serverLastId)
    }
    // How this will work:
    setInterval(() => {
        
    }, 1000)
```