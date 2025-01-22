const { Schema, model } = require('mongoose');

const EnemySchema = new Schema({
  unique_code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  default_x: { type: Number, required: true, default: 0 },
  default_y: { type: Number, required: true, default: 0 },
  default_z: { type: Number, required: true, default: 0 },
  x: { type: Number, required: true, default: 0 },
  y: { type: Number, required: true, default: 0 },
  z: { type: Number, required: true, default: 0 },
  zone: { type: String, required: true, default: "default_zone" },
  hp: { type: Number, required: true },
  current_hp: { type: Number, required: true },
  atk: { type: Number, required: true },
  defense: { type: Number, required: true },
  dead: { type: Boolean, required: true, default: false },
});

module.exports = model('Enemy', EnemySchema);
