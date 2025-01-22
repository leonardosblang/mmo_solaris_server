const colyseus = require("colyseus");
const { Schema, type, MapSchema } = require("@colyseus/schema");
const UserModel = require("./user");
const EnemyModel = require("./enemy");

class Player extends Schema {
  constructor() {
    super();
    this.username = "";
    this.x = 100;
    this.y = 100;
    this.z = 0;
    this.zone = "demozone0";
    this.angle = 0;
    this.hp = 100;
    this.current_hp = 100;
    this.atk = 10;
    this.defense = 5;
  }
}
type("string")(Player.prototype, "username");
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("number")(Player.prototype, "z");
type("number")(Player.prototype, "angle");
type("string")(Player.prototype, "zone");
type("number")(Player.prototype, "hp");
type("number")(Player.prototype, "current_hp");
type("number")(Player.prototype, "atk");
type("number")(Player.prototype, "defense");

class Enemy extends Schema {
  constructor() {
    super();
    this.unique_code = "";
    this.name = "";
    this.type = "";
    this.default_x = 0;
    this.default_y = 0;
    this.default_z = 0;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.zone = "default_zone";
    this.hp = 50;
    this.current_hp = 50;
    this.atk = 5;
    this.defense = 3;
    this.dead = false;
  }
}
type("string")(Enemy.prototype, "unique_code");
type("string")(Enemy.prototype, "name");
type("string")(Enemy.prototype, "type");
type("number")(Enemy.prototype, "default_x");
type("number")(Enemy.prototype, "default_y");
type("number")(Enemy.prototype, "default_z");
type("number")(Enemy.prototype, "x");
type("number")(Enemy.prototype, "y");
type("number")(Enemy.prototype, "z");
type("string")(Enemy.prototype, "zone");
type("number")(Enemy.prototype, "hp");
type("number")(Enemy.prototype, "current_hp");
type("number")(Enemy.prototype, "atk");
type("number")(Enemy.prototype, "defense");
type("boolean")(Enemy.prototype, "dead");

class State extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.enemies = new MapSchema();
  }
}
type({ map: Player })(State.prototype, "players");
type({ map: Enemy })(State.prototype, "enemies");

class MyRoom extends colyseus.Room {
  async onCreate() {
    this.setState(new State());
    console.log("[Room] Created MyRoom");
  
    // Load all existing enemies from the database into the server state
    const enemies = await EnemyModel.find({});
    enemies.forEach((enemy) => {
      const e = new Enemy();
      e.unique_code = enemy.unique_code;
      e.name = enemy.name;
      e.type = enemy.type || "melee"; // Default type if missing
      e.default_x = enemy.default_x;
      e.default_y = enemy.default_y;
      e.default_z = enemy.default_z;
      e.x = enemy.x;
      e.y = enemy.y;
      e.z = enemy.z;
      e.zone = enemy.zone;
      e.hp = enemy.hp;
      e.current_hp = enemy.current_hp; // Persisted current HP
      e.atk = enemy.atk;
      e.defense = enemy.defense;
      e.dead = enemy.dead || false;
  
      this.state.enemies.set(e.unique_code, e);
    });
  
    console.log("[Server] Loaded enemies from database:", Array.from(this.state.enemies.keys()));
  

    // Handle player login
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

      const p = new Player();
      p.username = username;
      p.x = userDoc.x;
      p.y = userDoc.y;
      p.z = userDoc.z;
      p.zone = userDoc.zone;
      this.state.players.set(client.sessionId, p);

      client.send("loginSuccess", {
        username: p.username,
        x: p.x,
        y: p.y,
        z: p.z,
        zone: p.zone,
      });

      // Send all existing enemies to the client
      client.send("initializeEnemies", Array.from(this.state.enemies.values()));
    });

    // Handle movement
    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;

      p.x = data.x ?? p.x;
      p.y = data.y ?? p.y;
      p.z = data.z ?? p.z;

      this.broadcast(
        "positionUpdate",
        {
          sessionId: client.sessionId,
          username: p.username,
          x: p.x,
          y: p.y,
          z: p.z,
          zone: p.zone,
        },
        { except: client }
      );
    });

    this.onMessage("initializeEnemies", async (client, enemyDataList) => {
      console.log("[Server] Initializing enemies...");
    
      for (const data of enemyDataList) {
        if (this.state.enemies.has(data.unique_code)) {
          console.log(`[Server] Enemy already exists: ${data.unique_code}`);
          continue; // Enemy is already loaded; skip initialization
        }
    
        console.log(`[Server] Adding new enemy: ${data.unique_code}`);
        const enemy = new Enemy();
        enemy.unique_code = data.unique_code;
        enemy.name = data.name;
        enemy.type = data.type || "melee"; // Default type if missing
        enemy.default_x = data.x;
        enemy.default_y = data.y;
        enemy.default_z = data.z;
        enemy.x = data.x;
        enemy.y = data.y;
        enemy.z = data.z;
        enemy.zone = data.zone;
        enemy.hp = data.hp;
        enemy.current_hp = data.current_hp || data.hp; // Initialize current HP to full if missing
        enemy.atk = data.atk;
        enemy.defense = data.defense;
        enemy.dead = data.dead || false;
    
        this.state.enemies.set(data.unique_code, enemy);
    
        // Save the new enemy to the database
        await EnemyModel.updateOne(
          { unique_code: enemy.unique_code },
          {
            $set: {
              unique_code: enemy.unique_code,
              name: enemy.name,
              type: enemy.type,
              default_x: enemy.default_x,
              default_y: enemy.default_y,
              default_z: enemy.default_z,
              x: enemy.x,
              y: enemy.y,
              z: enemy.z,
              zone: enemy.zone,
              hp: enemy.hp,
              current_hp: enemy.current_hp,
              atk: enemy.atk,
              defense: enemy.defense,
              dead: enemy.dead,
            },
          },
          { upsert: true } // Create the document if it doesn't exist
        );
      }
    
      // Broadcast the updated enemy state to all clients
      this.broadcast("initializeEnemies", Array.from(this.state.enemies.values()));
    });
    

    // Handle combat
    this.onMessage("attack", async (client, data) => {
      console.log("[Server] Received attack message:", data);
    
      const player = this.state.players.get(client.sessionId);
      const enemy = this.state.enemies.get(data.unique_code);
    
      if (!player || !enemy || enemy.dead) {
        console.warn("[Server] Attack failed: Invalid player or enemy.");
        return;
      }
    
      console.log("[Server] Processing attack...");
      const playerDamage = Math.max(0, player.atk - enemy.defense);
      const enemyDamage = Math.max(0, enemy.atk - player.defense);
    
      enemy.current_hp -= playerDamage;
      player.current_hp -= enemyDamage;
    
      console.log(`[Server] Enemy HP: ${enemy.current_hp}, Player HP: ${player.current_hp}`);
    
      if (enemy.current_hp <= 0) {
        enemy.dead = true;
        enemy.current_hp = 0;
    
        console.log("[Server] Enemy killed:", data.unique_code);
    
        setTimeout(async () => {
          enemy.dead = false;
          enemy.current_hp = enemy.hp;
    
          await EnemyModel.updateOne(
            { unique_code: enemy.unique_code },
            { $set: { current_hp: enemy.hp, dead: false } }
          );
    
          this.broadcast("enemyRespawn", {
            unique_code: enemy.unique_code,
            x: enemy.default_x,
            y: enemy.default_y,
            z: enemy.default_z,
          });
        }, 10000); // Respawn in 10 seconds
      }
    
      if (player.current_hp <= 0) {
        player.current_hp = 0;
        console.log("[Server] Player killed:", client.sessionId);
        client.send("playerDeath", {});
      }
    
      await EnemyModel.updateOne(
        { unique_code: enemy.unique_code },
        { $set: { current_hp: enemy.current_hp, dead: enemy.dead } }
      );
      await UserModel.updateOne(
        { username: player.username },
        { $set: { current_hp: player.current_hp } }
      );
    
      this.broadcast("combatUpdate", {
        unique_code: enemy.unique_code,
        enemy_hp: enemy.current_hp,
        player_hp: player.current_hp,
        sessionId: client.sessionId,
      });
    });
    
  }

  async onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      await UserModel.updateOne(
        { username: p.username },
        { $set: { x: p.x, y: p.y, z: p.z, zone: p.zone, current_hp: p.current_hp } }
      );
    }
    this.state.players.delete(client.sessionId);
    this.broadcast("playerLeft", { sessionId: client.sessionId });
  }

  async storePositionsInDB() {
    for (let [sid, p] of this.state.players) {
      await UserModel.updateOne(
        { username: p.username },
        { $set: { x: p.x, y: p.y, z: p.z, zone: p.zone, current_hp: p.current_hp } }
      );
    }
  }
}

module.exports = { MyRoom };
