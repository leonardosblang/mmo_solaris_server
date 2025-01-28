const { Schema, model } = require('mongoose');

const EnemySchema = new Schema({
  unique_code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  default_x: { type: Number, default: 0 },
  default_y: { type: Number, default: 0 },
  default_z: { type: Number, default: 0 },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  z: { type: Number, default: 0 },
  zone: { type: String, default: "default_zone" },

  hp: { type: Number, default: 100 },
  current_hp: { type: Number, default: 100 },
  atk: { type: Number, default: 5 },
  defense: { type: Number, default: 3 },
  dead: { type: Boolean, default: false },
});

module.exports = model('Enemy', EnemySchema);
