const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  username: { type: String, unique: true, required: true },
  x: { type: Number, default: 3336 },
  y: { type: Number, default: 1132 },
  z: { type: Number, default: 2 },
  zone: { type: String, default: "demozone0" }
});

module.exports = model('User', UserSchema);
