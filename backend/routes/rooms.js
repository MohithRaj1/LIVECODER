const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const Message = require('../models/Message');

// Create a new room
router.post('/create', async (req, res) => {
  try {
    const { name, language } = req.body;
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const room = new Room({ roomId, name: name || 'Untitled Room', language: language || 'javascript' });
    await room.save();
    res.status(201).json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get room by ID
router.get('/:roomId', async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get messages for a room
router.get('/:roomId/messages', async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId }).sort({ timestamp: 1 }).limit(100);
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
