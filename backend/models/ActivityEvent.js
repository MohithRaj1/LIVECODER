const mongoose = require('mongoose');

const ActivityEventSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  type: { type: String, enum: ['edit', 'run', 'chat', 'join', 'leave'], required: true, index: true },
  meta: { type: Object, default: {} },
  timestamp: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('ActivityEvent', ActivityEventSchema);

