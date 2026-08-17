const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { requireAuth } = require('../middleware/auth');
const ActivityEvent = require('../models/ActivityEvent');

// Create a new room
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { name, language } = req.body;
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    const room = new Room({
      roomId,
      name: name || 'Untitled Room',
      language: language || 'javascript',
      ownerId: req.user.sub,
    });
    await room.save();
    res.status(201).json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get user's recent rooms
router.get('/user/mine', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;
    // Find rooms owned by user or where user had activity
    const activityRoomIds = await ActivityEvent.distinct('roomId', { userId });
    const rooms = await Room.find({
      $or: [
        { ownerId: userId },
        { roomId: { $in: activityRoomIds } },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(10);
    res.json({ success: true, rooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get room by ID
router.get('/:roomId', requireAuth, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, error: 'Room not found' });
    res.json({ success: true, room });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get messages for a room
router.get('/:roomId/messages', requireAuth, async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId }).sort({ timestamp: 1 }).limit(100);
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Analytics for a room (simple contribution summary)
router.get('/:roomId/analytics', requireAuth, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const sinceMs = req.query.sinceMs ? Number(req.query.sinceMs) : null;
    const since = Number.isFinite(sinceMs) ? new Date(Date.now() - Math.max(0, sinceMs)) : null;

    const match = { roomId };
    if (since) match.timestamp = { $gte: since };

    const rows = await ActivityEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: { userId: '$userId', username: '$username' },
          edits: {
            $sum: {
              $cond: [{ $eq: ['$type', 'edit'] }, 1, 0],
            },
          },
          editDelta: {
            $sum: {
              $cond: [{ $eq: ['$type', 'edit'] }, { $ifNull: ['$meta.delta', 0] }, 0],
            },
          },
          runs: { $sum: { $cond: [{ $eq: ['$type', 'run'] }, 1, 0] } },
          chats: { $sum: { $cond: [{ $eq: ['$type', 'chat'] }, 1, 0] } },
          joins: { $sum: { $cond: [{ $eq: ['$type', 'join'] }, 1, 0] } },
          leaves: { $sum: { $cond: [{ $eq: ['$type', 'leave'] }, 1, 0] } },
          firstAt: { $min: '$timestamp' },
          lastAt: { $max: '$timestamp' },
        },
      },
      { $sort: { edits: -1, runs: -1, chats: -1 } },
    ]);

    const totals = await ActivityEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      roomId,
      since: since ? since.toISOString() : null,
      totals: Object.fromEntries(totals.map((t) => [t._id, t.count])),
      users: rows.map((r) => ({
        userId: r._id.userId,
        username: r._id.username,
        edits: r.edits,
        editDelta: r.editDelta,
        runs: r.runs,
        chats: r.chats,
        joins: r.joins,
        leaves: r.leaves,
        firstAt: r.firstAt,
        lastAt: r.lastAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Failed to load analytics' });
  }
});

module.exports = router;
