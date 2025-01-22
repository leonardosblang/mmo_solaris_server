const express = require('express');
const http = require('http');
const colyseus = require('colyseus');
const { connectDB } = require('./db');
const { MyRoom } = require('./MyRoom');

async function main() {
  await connectDB();

  const app = express();
  const server = http.createServer(app);

  const gameServer = new colyseus.Server({ server });
  gameServer.define("my_room", MyRoom);

  app.get('/', (req, res) => {
    res.send("Colyseus server is up!");
  });

  const port = process.env.PORT || 2567;
  server.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
