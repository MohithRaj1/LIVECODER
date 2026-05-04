const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  roomId: { type: String, required: true },
  color: { type: String, default: '#00d4ff' },
  joinedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);
