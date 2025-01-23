const colyseus = require("colyseus");
const { Schema, type, MapSchema } = require("@colyseus/schema");
const UserModel = require("./user");
const EnemyModel = require("./enemy");

//
// PLAYER SCHEMA
//
class Player extends Schema {
  constructor() {
    super();
    this.username = "";
    this.x = 100;
    this.y = 100;
    this.z = 0;
    this.zone = "demozone0";
    this.angle = 0;

    // Stats
    this.hp = 100;
    this.current_hp = 100;
    this.atk = 10;
    this.defense = 5;

    // Combat targeting + cooldown
    this.targetEnemy = "";         // which enemy I'm targeting
    this.lastAttackTime = 0;       // timestamp of last attack
    this.attackCooldownMs = 2000;  // 2-second cooldown on basic attack
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

type("string")(Player.prototype, "targetEnemy");
type("number")(Player.prototype, "lastAttackTime");
type("number")(Player.prototype, "attackCooldownMs");

//
// ENEMY SCHEMA
//
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

    // Stats
    this.hp = 50;
    this.current_hp = 50;
    this.atk = 5;
    this.defense = 3;

    // Combat
    this.dead = false;
    this.targetedPlayer = "";   // which player I'm targeting
    this.autoAttackIntervalMs = 3000; // auto-attack every 3 seconds
    this.lastAutoAttackTime = 0;
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
type("string")(Enemy.prototype, "targetedPlayer");
type("number")(Enemy.prototype, "autoAttackIntervalMs");
type("number")(Enemy.prototype, "lastAutoAttackTime");

//
// GLOBAL STATE
//
class State extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.enemies = new MapSchema();
  }
}
type({ map: Player })(State.prototype, "players");
type({ map: Enemy })(State.prototype, "enemies");

//
// ROOM LOGIC
//
class MyRoom extends colyseus.Room {
  async onCreate() {
    this.setState(new State());
    console.log("[Room] Created MyRoom");

    // ----------------------------------------------------------
    // LOAD existing enemies from DB
    // ----------------------------------------------------------
    const enemies = await EnemyModel.find({});
    enemies.forEach((enemy) => {
      const e = new Enemy();
      e.unique_code = enemy.unique_code;
      e.name = enemy.name;
      e.type = enemy.type || "melee";
      e.default_x = enemy.default_x;
      e.default_y = enemy.default_y;
      e.default_z = enemy.default_z;
      e.x = enemy.x;
      e.y = enemy.y;
      e.z = enemy.z;
      e.zone = enemy.zone;
      e.hp = enemy.hp;
      e.current_hp = enemy.current_hp;
      e.atk = enemy.atk;
      e.defense = enemy.defense;
      e.dead = enemy.dead || false;

      this.state.enemies.set(e.unique_code, e);
    });

    // ----------------------------------------------------------
    // Set up game loop (tick) to handle auto-attacks
    // ----------------------------------------------------------
    this.setSimulationInterval((deltaTime) => this.updateLoop(deltaTime), 100);

    // ----------------------------------------------------------
    // Handle MESSAGES
    // ----------------------------------------------------------

    // 1) Player LOGIN
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
      p.hp = userDoc.hp;
      p.current_hp = userDoc.current_hp;
      p.atk = userDoc.atk;
      p.defense = userDoc.defense;

      // Save player in state
      this.state.players.set(client.sessionId, p);

      client.send("loginSuccess", {
        username: p.username,
        x: p.x,
        y: p.y,
        z: p.z,
        zone: p.zone,
        hp: p.hp,
        current_hp: p.current_hp,
        atk: p.atk,
        defense: p.defense
      });
      // Broadcast all enemies to newly joined player
      client.send("initializeEnemies", Array.from(this.state.enemies.values()));
    });

    // 2) Player MOVE
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

    // 3) Initialize Enemies (if the client sends them)
    this.onMessage("initializeEnemies", async (client, enemyDataList) => {
      for (const data of enemyDataList) {
        if (this.state.enemies.has(data.unique_code)) {
          continue; 
        }

        const enemy = new Enemy();
        enemy.unique_code = data.unique_code;
        enemy.name = data.name;
        enemy.type = data.type || "melee";
        enemy.default_x = data.x;
        enemy.default_y = data.y;
        enemy.default_z = data.z;
        enemy.x = data.x;
        enemy.y = data.y;
        enemy.z = data.z;
        enemy.zone = data.zone;
        enemy.hp = data.hp;
        enemy.current_hp = data.current_hp || data.hp;
        enemy.atk = data.atk;
        enemy.defense = data.defense;
        enemy.dead = data.dead || false;

        this.state.enemies.set(data.unique_code, enemy);

        // Save to DB
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
          { upsert: true }
        );
      }

      this.broadcast("initializeEnemies", Array.from(this.state.enemies.values()));
    });

    // 4) Set Target: e.g. right-click to SELECT ENEMY
    this.onMessage("targetEnemy", (client, data) => {
      const { unique_code } = data;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
    
      // Check the enemy
      const enemy = this.state.enemies.get(unique_code);
      if (!enemy || enemy.dead) {
        console.warn("[Server] targetEnemy: invalid or dead enemy");
        return;
      }
    
      // Set player target
      player.targetEnemy = unique_code;
      console.log(`[Server] ${player.username} is now targeting ${unique_code}`);
    
      // Immediately send the monster data to that player
      client.send("enemyScan", {
        unique_code: enemy.unique_code,
        name: enemy.name,
        current_hp: enemy.current_hp,
        hp: enemy.hp
      });
    });
    
    this.onMessage("removeEnemy", async (client, data) => {
      const code = data.unique_code;
      
      // Check if the enemy exists in the server state
      if (this.state.enemies.has(code)) {
        // 1. Remove from state
        this.state.enemies.delete(code);
        console.log(`[Server] Removed enemy from state: ${code}`);
    
        // 2. (Optional) Remove from DB
        await EnemyModel.deleteOne({ unique_code: code });
        console.log(`[Server] Removed enemy from DB: ${code}`);
    
        // 3. Broadcast to clients that this enemy is gone
        this.broadcast("enemyRemoved", { unique_code: code });
      } else {
        console.warn(`[Server] removeEnemy: No such enemy ${code} in server state.`);
      }
    });

    // 5) BASIC ATTACK (press "1")
    this.onMessage("basicAttack", async (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (!player.targetEnemy) return; // no target

      // Check cooldown
      const now = Date.now();
      if (now - player.lastAttackTime < player.attackCooldownMs) {
        console.log("[Server] Attack on cooldown");
        return;
      }

      const enemy = this.state.enemies.get(player.targetEnemy);
      if (!enemy || enemy.dead) {
        console.warn("[Server] basicAttack: invalid or dead enemy");
        return;
      }

      // Attack is valid - update lastAttackTime
      player.lastAttackTime = now;

      // Calculate damage to enemy
      const damageToEnemy = Math.max(0, player.atk - enemy.defense);
      enemy.current_hp -= damageToEnemy;
      if (enemy.current_hp <= 0) {
        enemy.current_hp = 0;
        enemy.dead = true;
        console.log(`[Server] Enemy killed by ${player.username}: ${enemy.unique_code}`);

        // Respawn logic
        setTimeout(async () => {
          enemy.dead = false;
          enemy.current_hp = enemy.hp;
          enemy.x = enemy.default_x;
          enemy.y = enemy.default_y;
          enemy.z = enemy.default_z;

          await EnemyModel.updateOne(
            { unique_code: enemy.unique_code },
            { $set: { current_hp: enemy.hp, dead: false, x: enemy.default_x, y: enemy.default_y, z: enemy.default_z } }
          );

          this.broadcast("enemyRespawn", {
            unique_code: enemy.unique_code,
            x: enemy.x,
            y: enemy.y,
            z: enemy.z,
          });
        }, 10000); // 10s respawn
      } else {
        // Enemy is still alive - let's have it target the player
        enemy.targetedPlayer = client.sessionId;
      }

      await EnemyModel.updateOne(
        { unique_code: enemy.unique_code },
        { $set: { current_hp: enemy.current_hp, dead: enemy.dead } }
      );

      // Send combat update
      this.broadcast("combatUpdate", {
        unique_code: enemy.unique_code,
        enemy_hp: enemy.current_hp,
        player_hp: player.current_hp, // unchanged in a manual "basicAttack"
        sessionId: client.sessionId,
      });
    });
  }

  //
  // MAIN GAME LOOP: handle enemy auto-attacks
  //
  updateLoop(deltaTime) {
    const now = Date.now();

    // For each enemy, if it has a targeted player and is not dead, auto-attack periodically
    this.state.enemies.forEach((enemy, code) => {
      if (enemy.dead) return;
      if (!enemy.targetedPlayer) return; // no one to attack

      // Check auto-attack cooldown
      if (now - enemy.lastAutoAttackTime < enemy.autoAttackIntervalMs) {
        return; 
      }
      enemy.lastAutoAttackTime = now;

      // Get the targeted player
      const player = this.state.players.get(enemy.targetedPlayer);
      if (!player || player.current_hp <= 0) {
        // Target invalid or player is already dead
        enemy.targetedPlayer = "";
        return;
      }

      // Calculate damage
      const damageToPlayer = Math.max(0, enemy.atk - player.defense);
      player.current_hp -= damageToPlayer;

      console.log(`[Server] Enemy ${enemy.unique_code} hits ${player.username} for ${damageToPlayer} (HP: ${player.current_hp})`);

      // Check if player died
      if (player.current_hp <= 0) {
        player.current_hp = 0;
        console.log(`[Server] ${player.username} was killed by ${enemy.unique_code}`);
        // Optionally remove target
        enemy.targetedPlayer = "";

        // Notify the player
        const client = this.clients.find(c => this.state.players.get(c.sessionId) === player);
        if (client) {
          client.send("playerDeath", {});
        }
      }

      // Update DB
      UserModel.updateOne(
        { username: player.username },
        { $set: { current_hp: player.current_hp } }
      ).catch(err => console.error("[DB] Failed to update player HP:", err));

      // Broadcast combatUpdate
      this.broadcast("combatUpdate", {
        unique_code: enemy.unique_code,
        enemy_hp: enemy.current_hp,
        player_hp: player.current_hp,
        sessionId: player.username, // or client.sessionId
      });
    });
  }

  //
  // onLeave, store positions & HP
  //
  async onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      await UserModel.updateOne(
        { username: p.username },
        {
          $set: {
            x: p.x, 
            y: p.y,
            z: p.z,
            zone: p.zone,
            current_hp: p.current_hp,
          }
        }
      );
    }
    this.state.players.delete(client.sessionId);
    this.broadcast("playerLeft", { sessionId: client.sessionId });
  }

  async storePositionsInDB() {
    for (let [sid, p] of this.state.players) {
      await UserModel.updateOne(
        { username: p.username },
        {
          $set: {
            x: p.x,
            y: p.y,
            z: p.z,
            zone: p.zone,
            current_hp: p.current_hp,
          }
        }
      );
    }
  }
}

module.exports = { MyRoom };
