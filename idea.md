The idea is basically use socket.io and bonjour together for creating a multiple head sync

The steps will be:

- The code starts `start()`
- Inits a Server and a Client
- With bonjour search for all servers
- Connects to all servers and ask for the current state
- If theres some server as `main` then connect to it
- If theres no server as `main`, connect into the server with the earlier `start_date_time`
- The server that receives the first client will be the `main`
- The `main` will do a benchmark to all clients Eg:
- - I have 3 Clients
- - For each client, they will be state `benchmark-{id}`, with command `set_benchmank = {id}`
- - The `{benchmark-0}` will be the actual server
- - For each `benchmark-{id}`, sends to clients the IP and Port, with command `do_benchmark = {id}`
- - Each client will connects and test 1000 messages with 1000 bytes, and get the time
- - The client will send the time for the server, and the server will accumulate the time of the clients for each benchmark
- - Eg: {'benchmark-0': 1000, 'benchmark-1': 2000, 'benchmark-2': 3000}
- - The lowest time needs to be the `main`
- - The `main` will send to all clients the `set-main` IP and Port
- - The clients will connect to the `main`, and the server closes the connection, and connects into the new `main`
- This benchmark will be done every 5 minutes
