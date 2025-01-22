const { Schema, model } = require('mongoose');

const PlayerSchema = new Schema({
  username: { type: String, unique: true, required: true },
  hp: { type: Number, required: true },
  atk: { type: Number, required: true },
  defense: { type: Number, required: true },
  current_hp: { type: Number, required: true },
  current_atk: { type: Number, required: true },
  current_defense: { type: Number, required: true }
});

module.exports = model('Player', PlayerSchema);
