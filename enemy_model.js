const { Schema, model } = require('mongoose');

const EnemyModelSchema = new Schema({
  unique_code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  hp: { type: Number, required: true },
  atk: { type: Number, required: true },
  defense: { type: Number, required: true },
});

module.exports = model('EnemyModel', EnemyModelSchema);
