# How to deal with changes

- We need a local database for each instance that holds the current change catalog
- If the client made an update or delete, the server will relies to other connected clients
- If all clients receive the change, the server will update the local database with the change
- When clients connect to the server, they will receive the current change catalog since the actual change catalog version

Eg:
Server current change catalog: 1
Client 1 current change catalog: 1
Client 2 current change catalog: 1

Client 1 makes a change and sends it to the server
Server receives the change and sends it to all connected clients
Client 1 receives the change and updates the local database. Current change catalog: 2
Client 2 receives the change and updates the local database. Current change catalog: 2
Server accepts the change and updates the local database. Current change catalog: 2
Client 1 disconnects
Client 2 makes a change and sends it to the server
Server receives the change and sends it to all connected clients
Client 2 receives the change and updates the local database. Current change catalog: 3
Server accepts the change and updates the local database. Current change catalog: 3
Client 1 connects
Server sends the current change catalog to the client. Current change catalog: 3
Client 1 receives the change catalog and updates the local database. Current change catalog: 3

Everyone is up to date
