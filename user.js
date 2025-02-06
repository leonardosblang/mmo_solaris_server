const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  username: { type: String, unique: true, required: true },
  x: { type: Number, default: 3336 },
  y: { type: Number, default: 1132 },
  z: { type: Number, default: 2 },
  zone: { type: String, default: "demozone0" },
  hp: { type: Number, default: 100 },
  current_hp: { type: Number, default: 100 },
  atk: { type: Number, default: 10 },
  defense: { type: Number, default: 5 },
  mana: { type: Number, default: 50 },
  current_mana: { type: Number, default: 50 },
  // Skills 1-8 (with defaults)
  skill1: { type: String, default: "default" },
  skill2: { type: String, default: "default" },
  skill3: { type: String, default: "default" },
  skill4: { type: String, default: "default" },
  skill5: { type: String, default: "default" },
  skill6: { type: String, default: "default" },
  skill7: { type: String, default: "default" },
  skill8: { type: String, default: "default" },
  // NEW: Leveling and rewards
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  gold: { type: Number, default: 0 }
});

module.exports = model('User', UserSchema);
