const colyseus = require("colyseus");
const { Schema, type, MapSchema } = require("@colyseus/schema");
const UserModel = require("./user");

class Player extends Schema {
  constructor() {
    super();
    this.username = "";
    this.x = 100;
    this.y = 100;
    this.z = 0;
    this.zone = "demozone0";
    this.angle = 0;
  }
}
type("string")(Player.prototype, "username");
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("number")(Player.prototype, "z");
type("number")(Player.prototype, "angle");
type("string")(Player.prototype, "zone");

class State extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}
type({ map: Player })(State.prototype, "players");

class MyRoom extends colyseus.Room {
  onCreate() {
    this.setState(new State());
    console.log("[Room] Created MyRoom");

    // Periodically store positions in DB
    this.autoStoreInterval = setInterval(() => {
      this.storePositionsInDB();
    }, 5000); // every 5s for easier debugging

    this.onMessage("login", async (client, data) => {
      const { username } = data;
      if (!username) return;

      let userDoc = await UserModel.findOne({ username });
      if (!userDoc) {
        userDoc = new UserModel({ username });
        await userDoc.save();
        console.log(`[Login] Created new user: ${username}`);
      } else {
        console.log(`[Login] Found existing user: ${username}`);
      }

      // Create a Player in the room
      const p = new Player();
      p.username = username;
      p.x = userDoc.x;
      p.y = userDoc.y;
      p.z = userDoc.z;
      p.zone = userDoc.zone;

      this.state.players.set(client.sessionId, p);

      // Send existing players to the new client
      const existingPlayers = [];
      for (let [sid, existingP] of this.state.players) {
        if (sid === client.sessionId) continue;
        existingPlayers.push({
          sessionId: sid,
          username: existingP.username,
          x: existingP.x,
          y: existingP.y,
          z: existingP.z,
          zone: existingP.zone
        });
      }
      client.send("initialPlayers", existingPlayers);

      // Broadcast the new player's data to everyone
      this.broadcast("positionUpdate", {
  sessionId: client.sessionId,
  username: p.username,
  x: p.x,
  y: p.y,
  z: p.z,
  angle: p.angle,
  zone: p.zone || "demozone0", // Ensure zone is always defined
}, { except: client });

      // Tell the new client they're logged in + their coords
      client.send("loginSuccess", {
        username: p.username,
        x: p.x,
        y: p.y,
        z: p.z,
        zone: p.zone
      });
    });

    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      p.x = data.x ?? p.x;
      p.y = data.y ?? p.y;
      p.z = data.z ?? p.z;
      p.angle = data.angle ?? p.angle;

      // Broadcast to others
      this.broadcast("positionUpdate", {
        sessionId: client.sessionId,
        username: p.username,
        x: p.x,
        y: p.y,
        z: p.z,
        angle: p.angle,
        zone: p.zone,
      }, { except: client });
    });
  }

  onJoin(client) {
    console.log("[Join]", client.sessionId, "joined.");
  }

  async onLeave(client) {
    console.log("[Leave]", client.sessionId, "left.");

    // Save their position
    const p = this.state.players.get(client.sessionId);
    if (p && p.username) {
      await UserModel.updateOne(
        { username: p.username },
        { $set: { x: p.x, y: p.y, z: p.z, zone: p.zone } },
        { upsert: true }
      );
    }

    // Remove from state
    this.state.players.delete(client.sessionId);

    // Let other clients remove him
    this.broadcast("playerLeft", { sessionId: client.sessionId });
  }

  async storePositionsInDB() {
    console.log("[DB] Attempting to store positions...");
    for (let [sid, p] of this.state.players) {
      if (!p.username) continue;
      try {
        await UserModel.updateOne(
          { username: p.username },
          { $set: { x: p.x, y: p.y, z: p.z, zone: p.zone } },
          { upsert: true }
        );
        console.log(`[DB] Stored ${p.username} => ${p.x},${p.y},${p.z}, zone=${p.zone}`);
      } catch (err) {
        console.error("[DB] Error storing position:", err);
      }
    }
  }

  onDispose() {
    if (this.autoStoreInterval) clearInterval(this.autoStoreInterval);
  }
}

module.exports = { MyRoom };
