const colyseus = require("colyseus");
const { Schema, type, MapSchema } = require("@colyseus/schema");
const UserModel = require("./user");
const EnemyModel = require("./enemy");

/* PLAYER SCHEMA */
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

    // Mana
    this.mana = 50;
    this.current_mana = 50;

    // Skills 1-8
    this.skill1 = "default";
    this.skill2 = "default";
    this.skill3 = "default";
    this.skill4 = "default";
    this.skill5 = "default";
    this.skill6 = "default";
    this.skill7 = "default";
    this.skill8 = "default";

    // Combat
    this.targetEnemy = "";
    this.lastAttackTime = 0;
    this.attackCooldownMs = 2000;

    // Skill Cooldowns (timestamps)
    this.skillCooldown1 = 0;
    this.skillCooldown2 = 0;
    this.skillCooldown3 = 0;
    this.skillCooldown4 = 0;
    this.skillCooldown5 = 0;
    this.skillCooldown6 = 0;
    this.skillCooldown7 = 0;
    this.skillCooldown8 = 0;

    // Leveling and rewards
    this.level = 1;
    this.xp = 0;
    this.gold = 0;
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
type("number")(Player.prototype, "mana");
type("number")(Player.prototype, "current_mana");
type("string")(Player.prototype, "skill1");
type("string")(Player.prototype, "skill2");
type("string")(Player.prototype, "skill3");
type("string")(Player.prototype, "skill4");
type("string")(Player.prototype, "skill5");
type("string")(Player.prototype, "skill6");
type("string")(Player.prototype, "skill7");
type("string")(Player.prototype, "skill8");
type("string")(Player.prototype, "targetEnemy");
type("number")(Player.prototype, "lastAttackTime");
type("number")(Player.prototype, "attackCooldownMs");
type("number")(Player.prototype, "skillCooldown1");
type("number")(Player.prototype, "skillCooldown2");
type("number")(Player.prototype, "skillCooldown3");
type("number")(Player.prototype, "skillCooldown4");
type("number")(Player.prototype, "skillCooldown5");
type("number")(Player.prototype, "skillCooldown6");
type("number")(Player.prototype, "skillCooldown7");
type("number")(Player.prototype, "skillCooldown8");
type("number")(Player.prototype, "level");
type("number")(Player.prototype, "xp");
type("number")(Player.prototype, "gold");

/* ENEMY SCHEMA */
class Enemy extends Schema {
  constructor() {
    super();
    this.unique_code = "";
    this.name = "Monster";
    this.type = "melee";
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
    this.targetedPlayer = "";
    this.autoAttackIntervalMs = 3000;
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

/* GLOBAL STATE */
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
    console.log("[Server] MyRoom created. Loading enemies from DB...");

    // For proper context, save "this" as "self"
    const self = this;

    // 1) Load existing enemies from DB
    const enemiesFromDb = await EnemyModel.find({});
    enemiesFromDb.forEach((enemyDoc) => {
      const e = new Enemy();
      e.unique_code = enemyDoc.unique_code;
      e.name = enemyDoc.name;
      e.type = enemyDoc.type || "melee";
      e.default_x = enemyDoc.default_x;
      e.default_y = enemyDoc.default_y;
      e.default_z = enemyDoc.default_z;
      e.x = enemyDoc.x;
      e.y = enemyDoc.y;
      e.z = enemyDoc.z;
      e.zone = enemyDoc.zone;
      e.hp = enemyDoc.hp;
      e.current_hp = (enemyDoc.current_hp ?? enemyDoc.hp);
      e.atk = enemyDoc.atk;
      e.defense = enemyDoc.defense;
      e.dead = enemyDoc.dead || false;

      console.log(`[Server] Loaded enemy '${e.unique_code}' => HP=${e.current_hp}/${e.hp}, dead=${e.dead}`);
      this.state.enemies.set(e.unique_code, e);
    });

    // 2) Periodically broadcast player stats
    this.statsInterval = setInterval(() => {
      self.broadcastPlayerStats();
    }, 2000);

    // 3) Auto-attack loop
    this.setSimulationInterval((deltaTime) => self.updateLoop(deltaTime), 100);

    // 4) MESSAGES

    // (A) spawnNewEnemy
    this.onMessage("spawnNewEnemy", async (client, data) => {
      console.log("[Server] spawnNewEnemy =>", data);

      const existingDoc = await EnemyModel.findOne({ unique_code: data.unique_code });
      if (existingDoc) {
        console.warn(`[Server] spawnNewEnemy => code already exists in DB: ${data.unique_code}`);
        return;
      }

      if (this.state.enemies.has(data.unique_code)) {
        console.warn(`[Server] spawnNewEnemy => code already in state: ${data.unique_code}`);
        return;
      }

      const e = new Enemy();
      e.unique_code = data.unique_code;
      e.name = data.name || "SpawnedMonster";
      e.hp = data.hp || 50;
      e.current_hp = e.hp;
      e.atk = data.atk || 5;
      e.defense = data.defense || 3;
      e.default_x = data.x || 0;
      e.default_y = data.y || 0;
      e.default_z = data.z || 0;
      e.x = data.x || 0;
      e.y = data.y || 0;
      e.z = data.z || 0;
      e.zone = data.zone || "default_zone";
      e.dead = false;

      this.state.enemies.set(e.unique_code, e);
      console.log(`[Server] Successfully spawned new enemy => ${e.unique_code} with HP=${e.current_hp}`);

      try {
        await EnemyModel.create({
          unique_code: e.unique_code,
          name: e.name,
          type: e.type,
          hp: e.hp,
          current_hp: e.current_hp,
          atk: e.atk,
          defense: e.defense,
          default_x: e.default_x,
          default_y: e.default_y,
          default_z: e.default_z,
          x: e.x,
          y: e.y,
          z: e.z,
          zone: e.zone,
          dead: e.dead
        });
      } catch (err) {
        console.error("[Server] DB error creating new enemy =>", err);
        return;
      }

      this.broadcast("initializeEnemies", [ e ]);
    });

    // (B) login
    this.onMessage("login", async (client, data) => {
      const { username } = data;
      if (!username) return;
      let userDoc = await UserModel.findOne({ username });
      if (!userDoc) {
        userDoc = new UserModel({ username });
        await userDoc.save();
        console.log(`[Server] Created new user in DB => ${username}`);
      } else {
        console.log(`[Server] Found existing user => ${username}`);
      }
      if (!userDoc.skill1 || userDoc.skill1 === "default") {
        userDoc.skill1 = "Punch";
      }
      if (!userDoc.skill2 || userDoc.skill2 === "default") {
        userDoc.skill2 = "BasicHeal";
      }
      await userDoc.save();
    
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
      p.mana = userDoc.mana || 50;
      p.current_mana = userDoc.current_mana || 50;
      p.skill1 = userDoc.skill1;
      p.skill2 = userDoc.skill2;
      p.skill3 = userDoc.skill3 || "default";
      p.skill4 = userDoc.skill4 || "default";
      p.skill5 = userDoc.skill5 || "default";
      p.skill6 = userDoc.skill6 || "default";
      p.skill7 = userDoc.skill7 || "default";
      p.skill8 = userDoc.skill8 || "default";
      p.level = userDoc.level || 1;
      p.xp = userDoc.xp || 0;
      p.gold = userDoc.gold || 0;
      
      this.state.players.set(client.sessionId, p);
      console.log(`[Server] ${username} logged in => HP=${p.current_hp}/${p.hp}, Level=${p.level}`);
    
      client.send("loginSuccess", {
        username: p.username,
        x: p.x,
        y: p.y,
        z: p.z,
        zone: p.zone,
        hp: p.hp,
        current_hp: p.current_hp,
        atk: p.atk,
        defense: p.defense,
        mana: p.mana,
        current_mana: p.current_mana,
        skill1: p.skill1,
        skill2: p.skill2,
        skill3: p.skill3,
        skill4: p.skill4,
        skill5: p.skill5,
        skill6: p.skill6,
        skill7: p.skill7,
        skill8: p.skill8,
        level: p.level,
        xp: p.xp,
        gold: p.gold
      });
    
      client.send("initializeEnemies", Array.from(this.state.enemies.values()));
    });
    
    // (C) move
    this.onMessage("move", (client, data) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.x = data.x ?? p.x;
      p.y = data.y ?? p.y;
      p.z = data.z ?? p.z;
      this.broadcast("positionUpdate", {
        sessionId: client.sessionId,
        username: p.username,
        x: p.x,
        y: p.y,
        z: p.z,
        zone: p.zone
      }, { except: client });
    });
    
    // (D) initializeEnemies
    this.onMessage("initializeEnemies", async (client, enemyDataList) => {
      console.log("[Server] Received initializeEnemies =>", enemyDataList);
      for (const data of enemyDataList) {
        if (this.state.enemies.has(data.unique_code)) {
          console.log(`[Server] Duplicate => removing old: ${data.unique_code}`);
          this.removeEnemyFromState(data.unique_code);
        }
    
        const newEnemy = new Enemy();
        newEnemy.unique_code = data.unique_code;
        newEnemy.name = data.name || "Unknown";
        newEnemy.type = data.type || "melee";
        newEnemy.default_x = data.x;
        newEnemy.default_y = data.y;
        newEnemy.default_z = data.z;
        newEnemy.x = data.x;
        newEnemy.y = data.y;
        newEnemy.z = data.z;
        newEnemy.zone = data.zone;
        newEnemy.hp = data.hp;
        newEnemy.current_hp = data.current_hp ?? data.hp;
        newEnemy.atk = data.atk || 5;
        newEnemy.defense = data.defense || 3;
        newEnemy.dead = data.dead || false;
    
        this.state.enemies.set(data.unique_code, newEnemy);
        console.log(`[Server] Created new enemy => code=${newEnemy.unique_code}, HP=${newEnemy.current_hp}/${newEnemy.hp}`);
    
        await EnemyModel.updateOne(
          { unique_code: newEnemy.unique_code },
          {
            $set: {
              unique_code: newEnemy.unique_code,
              name: newEnemy.name,
              type: newEnemy.type,
              default_x: newEnemy.default_x,
              default_y: newEnemy.default_y,
              default_z: newEnemy.default_z,
              x: newEnemy.x,
              y: newEnemy.y,
              z: newEnemy.z,
              zone: newEnemy.zone,
              hp: newEnemy.hp,
              current_hp: newEnemy.current_hp,
              atk: newEnemy.atk,
              defense: newEnemy.defense,
              dead: newEnemy.dead
            }
          },
          { upsert: true }
        );
      }
    
      this.broadcast("initializeEnemies", Array.from(this.state.enemies.values()));
    });
    
    // (E) targetEnemy
    this.onMessage("targetEnemy", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const enemy = this.state.enemies.get(data.unique_code);
      if (!enemy || enemy.dead) {
        console.warn("[Server] targetEnemy => invalid or dead enemy:", data.unique_code);
        return;
      }
      player.targetEnemy = data.unique_code;
      console.log(`[Server] ${player.username} now targeting ${data.unique_code} => HP=${enemy.current_hp}/${enemy.hp}, dead=${enemy.dead}`);
      client.send("enemyScan", {
        unique_code: enemy.unique_code,
        name: enemy.name,
        current_hp: enemy.current_hp,
        hp: enemy.hp
      });
    });
    
    // (F) removeEnemy
    this.onMessage("removeEnemy", async (client, data) => {
      const code = data.unique_code;
      console.log(`[Server] removeEnemy => code=${code}`);
      if (this.state.enemies.has(code)) {
        this.removeEnemyFromState(code);
        await EnemyModel.deleteOne({ unique_code: code });
        console.log(`[Server] Removed enemy from DB => ${code}`);
      } else {
        console.warn(`[Server] removeEnemy => No such enemy ${code} in server state`);
      }
    });
    
    // (G) basicAttack
    this.onMessage("basicAttack", async (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        console.warn("[Server] basicAttack => No such player");
        return;
      }
      if (!player.targetEnemy) {
        console.warn("[Server] basicAttack => Player has no target");
        return;
      }
    
      const now = Date.now();
      if (now - player.lastAttackTime < player.attackCooldownMs) {
        console.log("[Server] Attack on cooldown => skipping");
        return;
      }
    
      const enemy = this.state.enemies.get(player.targetEnemy);
      if (!enemy || enemy.dead) {
        console.warn("[Server] basicAttack => invalid or dead enemy");
        return;
      }
    
      player.lastAttackTime = now;
      const playerAtk = Number(player.atk) || 0;
      const enemyDef = Number(enemy.defense) || 0;
      const rawDamage = playerAtk - enemyDef;
      const damageToEnemy = Math.max(0, rawDamage);
    
      console.log(`[Server] ${player.username} dealt ${damageToEnemy} to ${enemy.unique_code}, oldHP=${enemy.current_hp}`);
      enemy.current_hp -= damageToEnemy;
      console.log(`[Server] newHP=${enemy.current_hp}`);
    
      if (enemy.current_hp <= 0) {
        // Process enemy death (award rewards regardless of the attack method)
        self.processEnemyDeath(enemy, player, client);
      } else {
        enemy.targetedPlayer = client.sessionId;
      }
    
      try {
        await EnemyModel.updateOne(
          { unique_code: enemy.unique_code },
          { $set: { current_hp: enemy.current_hp, dead: enemy.dead } }
        );
      } catch (err) {
        console.error("[Server] DB error saving HP =>", err);
      }
    
      this.broadcast("combatUpdate", {
        unique_code: enemy.unique_code,
        enemy_hp: enemy.current_hp,
        player_hp: player.current_hp,
        sessionId: client.sessionId
      });
    });
    
    // (H) useSkill
    this.onMessage("useSkill", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
    
      const slot = data.slot;
      if (!slot || slot < 1 || slot > 8) {
        console.warn(`[Server] useSkill => invalid slot: ${slot}`);
        return;
      }
    
      const skillName = player[`skill${slot}`];
      if (!skillName || skillName === "default") {
        console.log("[Server] useSkill => no valid skill in that slot");
        return;
      }
    
      const now = Date.now();
      const skillCooldownKey = `skillCooldown${slot}`;
      if (!player[skillCooldownKey]) {
        player[skillCooldownKey] = 0;
      }
    
      if (now < player[skillCooldownKey]) {
        console.log(`[Server] useSkill => skill '${skillName}' is on cooldown for player ${player.username}`);
        return;
      }
    
      // Check mana cost for the skill
      const manaCosts = {
        "Punch": 0,
        "BasicHeal": 10
      };
      const manaCost = manaCosts[skillName] || 0;
      if (player.current_mana < manaCost) {
        console.log(`[Server] Not enough mana to cast ${skillName} for player ${player.username}`);
        client.send("notEnoughMana", { skillName, current_mana: player.current_mana, manaCost });
        return;
      }
    
      // Deduct mana cost and update DB
      player.current_mana -= manaCost;
      UserModel.updateOne(
        { username: player.username },
        { $set: { current_mana: player.current_mana } }
      ).catch(err => console.error("[Server] DB error updating mana:", err));
    
      switch (skillName) {
        case "Punch":
          this.handlePunchSkill(player, client);
          player[skillCooldownKey] = now + 2000;
          break;
    
        case "BasicHeal":
          this.handleBasicHealSkill(player, client);
          player[skillCooldownKey] = now + 5000;
          break;
    
        default:
          console.log(`[Server] useSkill => unrecognized skill: ${skillName}`);
          return;
      }
    
      const remainingMs = player[skillCooldownKey] - now;
      client.send("skillUsed", {
        slot,
        skillName,
        remainingMs
      });
      this.broadcastPlayerStats();
    });
  }
  
  // New helper method to process enemy death and award rewards
  processEnemyDeath(enemy, player, client) {
    enemy.current_hp = 0;
    enemy.dead = true;
    enemy.targetedPlayer = "";
    console.log(`[Server] Enemy killed => code=${enemy.unique_code} by player=${player.username}`);
    
    // Award rewards regardless of which attack was used
    this.awardRewards(player, enemy, client);
    
    setTimeout(async () => {
      enemy.dead = false;
      enemy.current_hp = enemy.hp;
      enemy.x = enemy.default_x;
      enemy.y = enemy.default_y;
      enemy.z = enemy.default_z;
      
      await EnemyModel.updateOne(
        { unique_code: enemy.unique_code },
        { $set: { current_hp: enemy.current_hp, dead: false, x: enemy.default_x, y: enemy.default_y, z: enemy.default_z } }
      );
      
      this.broadcast("enemyRespawn", {
        unique_code: enemy.unique_code,
        x: enemy.x,
        y: enemy.y,
        z: enemy.z,
        current_hp: enemy.current_hp
      });
      console.log(`[Server] Respawned enemy => code=${enemy.unique_code}, HP reset to ${enemy.current_hp}`);
    }, 10000);
  }
  
  awardRewards(player, enemy, client) {
    const xpReward = Math.floor(enemy.hp / 2);     // For enemy with hp = 100 → 50 XP.
    const goldReward = Math.floor(enemy.atk * 2);    // For enemy with atk = 5 → 10 Gold.
    player.xp += xpReward;
    player.gold += goldReward;
    console.log(`[Server] Awarded ${xpReward} XP and ${goldReward} Gold to ${player.username}`);
    const xpThreshold = player.level * 100;
    if (player.xp >= xpThreshold) {
      player.xp -= xpThreshold;
      player.level++;
      // Increase player stats on level up
      player.hp += 10;
      player.current_hp += 10;
      player.mana += 5;
      player.current_mana += 5;
      player.atk += 2;
      player.defense += 2;
      console.log(`[Server] ${player.username} leveled up to ${player.level}!`);
      client.send("levelUp", { level: player.level });
    }
    UserModel.updateOne(
      { username: player.username },
      { $set: {
          xp: player.xp,
          level: player.level,
          gold: player.gold,
          hp: player.hp,
          current_hp: player.current_hp,
          mana: player.mana,
          current_mana: player.current_mana,
          atk: player.atk,
          defense: player.defense
        }
      }
    ).catch(err => console.error("[Server] DB error updating rewards:", err));
  }
  
  handlePunchSkill(player, client) {
    if (!player.targetEnemy) {
      console.warn("[Server] handlePunchSkill => Player has no target");
      return;
    }
    const enemy = this.state.enemies.get(player.targetEnemy);
    if (!enemy || enemy.dead) {
      console.warn("[Server] handlePunchSkill => invalid or dead enemy");
      return;
    }
    const playerAtk = Number(player.atk) || 0;
    const enemyDef = Number(enemy.defense) || 0;
    const rawDamage = playerAtk - enemyDef;
    const damageToEnemy = Math.max(0, rawDamage);
    
    console.log(`[Server] Punch => ${player.username} dealt ${damageToEnemy} to ${enemy.unique_code}, oldHP=${enemy.current_hp}`);
    enemy.current_hp -= damageToEnemy;
    if (enemy.current_hp <= 0) {
      // Use processEnemyDeath to award rewards regardless of attack type
      this.processEnemyDeath(enemy, player, client);
    } else {
      enemy.targetedPlayer = client.sessionId;
    }
    
    EnemyModel.updateOne(
      { unique_code: enemy.unique_code },
      { $set: { current_hp: enemy.current_hp, dead: enemy.dead } }
    ).catch(err => console.error("[Server] DB error saving enemy HP =>", err));
    
    this.broadcast("combatUpdate", {
      unique_code: enemy.unique_code,
      enemy_hp: enemy.current_hp,
      player_hp: player.current_hp,
      sessionId: client.sessionId
    });
  }
  
  handleBasicHealSkill(player, client) {
    const oldHP = player.current_hp;
    const healAmount = Math.floor(player.hp * 0.10);
    player.current_hp = Math.min(player.current_hp + healAmount, player.hp);
    
    console.log(`[Server] BasicHeal => ${player.username} recovers ${player.current_hp - oldHP} HP => newHP=${player.current_hp}`);
    
    UserModel.updateOne(
      { username: player.username },
      { $set: { current_hp: player.current_hp } }
    ).catch(err => console.error("[Server] DB error saving player's HP =>", err));
    
    this.broadcast("combatUpdate", {
      unique_code: null,
      enemy_hp: null,
      player_hp: player.current_hp,
      sessionId: client.sessionId
    });
  }
  
  removeEnemyFromState(unique_code) {
    this.state.enemies.delete(unique_code);
    console.log(`[Server] Removed enemy from state => code=${unique_code}`);
    this.broadcast("enemyRemoved", { unique_code });
  }
  
  broadcastPlayerStats() {
    const playersArray = [];
    this.state.players.forEach((player, sessionId) => {
      playersArray.push({
        sessionId,
        username: player.username,
        hp: player.hp,
        current_hp: player.current_hp,
        mana: player.mana,
        current_mana: player.current_mana,
        skill1: player.skill1,
        skill2: player.skill2,
        skill3: player.skill3,
        skill4: player.skill4,
        skill5: player.skill5,
        skill6: player.skill6,
        skill7: player.skill7,
        skill8: player.skill8,
        level: player.level,
        xp: player.xp,
        gold: player.gold
      });
    });
    console.log("[Server] broadcastPlayerStats =>", playersArray);
    this.broadcast("playerStatsUpdate", playersArray);
  }
  
  updateLoop(deltaTime) {
    const now = Date.now();
    this.state.enemies.forEach((enemy, code) => {
      if (enemy.dead) return;
      if (!enemy.targetedPlayer) return;
      if (now - enemy.lastAutoAttackTime < enemy.autoAttackIntervalMs) return;
    
      enemy.lastAutoAttackTime = now;
      const player = this.state.players.get(enemy.targetedPlayer);
      if (!player || player.current_hp <= 0) {
        enemy.targetedPlayer = "";
        return;
      }
    
      const enemyAtk = Number(enemy.atk) || 0;
      const playerDef = Number(player.defense) || 0;
      const rawDamage = enemyAtk - playerDef;
      const damageToPlayer = Math.max(0, rawDamage);
    
      player.current_hp -= damageToPlayer;
      console.log(`[Server] Enemy '${enemy.unique_code}' hits ${player.username} for ${damageToPlayer} => playerHP=${player.current_hp}`);
    
      if (player.current_hp <= 0) {
        player.current_hp = 0;
        console.log(`[Server] Player '${player.username}' died to enemy '${enemy.unique_code}'`);
        enemy.targetedPlayer = "";
    
        const client = this.clients.find(c => this.state.players.get(c.sessionId) === player);
        if (client) {
          client.send("playerDeath", {});
        }
      }
    
      UserModel.updateOne(
        { username: player.username },
        { $set: { current_hp: player.current_hp } }
      ).catch(err => console.error("[Server] Error updating player HP =>", err));
    
      this.broadcast("combatUpdate", {
        unique_code: enemy.unique_code,
        enemy_hp: enemy.current_hp,
        player_hp: player.current_hp,
        sessionId: player.username
      });
    });
  }
  
  async onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) {
      console.log(`[Server] onLeave => saving player '${p.username}' state to DB...`);
      await UserModel.updateOne(
        { username: p.username },
        {
          $set: {
            x: p.x,
            y: p.y,
            z: p.z,
            zone: p.zone,
            current_hp: p.current_hp,
            current_mana: p.current_mana,
            skill1: p.skill1,
            skill2: p.skill2,
            skill3: p.skill3,
            skill4: p.skill4,
            skill5: p.skill5,
            skill6: p.skill6,
            skill7: p.skill7,
            skill8: p.skill8,
            level: p.level,
            xp: p.xp,
            gold: p.gold
          }
        }
      );
    }
    this.state.players.delete(client.sessionId);
    this.broadcast("playerLeft", { sessionId: client.sessionId });
  }
  
  async storePositionsInDB() {
    console.log("[Server] storePositionsInDB => saving all player states to DB...");
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
            current_mana: p.current_mana,
            skill1: p.skill1,
            skill2: p.skill2,
            skill3: p.skill3,
            skill4: p.skill4,
            skill5: p.skill5,
            skill6: p.skill6,
            skill7: p.skill7,
            skill8: p.skill8,
            level: p.level,
            xp: p.xp,
            gold: p.gold
          }
        }
      );
    }
  }
  
  onDispose() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    console.log("[Server] MyRoom disposed.");
  }
}

module.exports = { MyRoom };
