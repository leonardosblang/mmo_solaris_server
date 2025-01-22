const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  username: { type: String, unique: true, required: true },
  x: { type: Number, default: 3336 },
  y: { type: Number, default: 1132 },
  z: { type: Number, default: 2 },
  zone: { type: String, default: "demozone0" },
  hp: { type: Number, default: 100 },
  atk: { type: Number, default: 10 },
  defense: { type: Number, default: 5 },
  current_hp: { type: Number, default: 100 },
  current_atk: { type: Number, default: 10 },
  current_defense: { type: Number, default: 5 },
});

module.exports = model('User', UserSchema);
