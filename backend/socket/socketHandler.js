const Room = require('../models/Room');
const Message = require('../models/Message');

// Map of roomId -> Set of connected socket IDs with user info
const rooms = new Map();

// Generate a random avatar color
const COLORS = [
  '#00d4ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#a855f7',
  '#f97316', '#ec4899', '#14b8a6', '#3b82f6', '#ef4444',
];
const getColor = (index) => COLORS[index % COLORS.length];

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join a coding room
    socket.on('join-room', async ({ roomId, username }) => {
      try {
        socket.join(roomId);

        // Initialize room in memory if needed
        if (!rooms.has(roomId)) rooms.set(roomId, new Map());
        const roomUsers = rooms.get(roomId);

        const colorIndex = roomUsers.size;
        const userInfo = { socketId: socket.id, username, color: getColor(colorIndex) };
        roomUsers.set(socket.id, userInfo);

        // Fetch existing room data from DB
        let room = await Room.findOne({ roomId });
        if (!room) {
          room = new Room({ roomId, name: `Room ${roomId}` });
          await room.save();
        }

        // Fetch recent messages
        const messages = await Message.find({ roomId }).sort({ timestamp: 1 }).limit(100);

        // Send current room state to the joining user
        socket.emit('room-joined', {
          code: room.code,
          language: room.language,
          messages,
          users: Array.from(roomUsers.values()),
        });

        // Notify others a new user joined
        socket.to(roomId).emit('user-joined', {
          user: userInfo,
          users: Array.from(roomUsers.values()),
        });

        // Save system message
        const sysMsg = new Message({
          roomId,
          username: 'System',
          text: `${username} joined the room`,
          type: 'system',
        });
        await sysMsg.save();
        io.to(roomId).emit('new-message', sysMsg);

        console.log(`${username} joined room ${roomId}`);
      } catch (err) {
        console.error('join-room error:', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // Code change event
    socket.on('code-change', async ({ roomId, code }) => {
      socket.to(roomId).emit('code-update', { code });
      // Debounced DB save - just save inline (production would debounce)
      try {
        await Room.findOneAndUpdate({ roomId }, { code, updatedAt: Date.now() });
      } catch (err) {
        console.error('code-change DB error:', err.message);
      }
    });

    // Language change
    socket.on('language-change', async ({ roomId, language }) => {
      io.to(roomId).emit('language-update', { language });
      try {
        await Room.findOneAndUpdate({ roomId }, { language });
      } catch (err) {
        console.error('language-change DB error:', err.message);
      }
    });

    // Cursor position
    socket.on('cursor-move', ({ roomId, cursor, username, color }) => {
      socket.to(roomId).emit('cursor-update', { socketId: socket.id, cursor, username, color });
    });

    // Chat message
    socket.on('send-message', async ({ roomId, username, text }) => {
      try {
        const msg = new Message({ roomId, username, text, type: 'user' });
        await msg.save();
        io.to(roomId).emit('new-message', msg);
      } catch (err) {
        console.error('send-message error:', err.message);
      }
    });

    // Typing indicator
    socket.on('typing', ({ roomId, username, isTyping }) => {
      socket.to(roomId).emit('user-typing', { username, isTyping });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      for (const [roomId, roomUsers] of rooms.entries()) {
        if (roomUsers.has(socket.id)) {
          const user = roomUsers.get(socket.id);
          roomUsers.delete(socket.id);

          if (roomUsers.size === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit('user-left', {
              socketId: socket.id,
              users: Array.from(roomUsers.values()),
            });

            // System message
            try {
              const sysMsg = new Message({
                roomId,
                username: 'System',
                text: `${user.username} left the room`,
                type: 'system',
              });
              await sysMsg.save();
              io.to(roomId).emit('new-message', sysMsg);
            } catch (err) {
              console.error('disconnect message error:', err.message);
            }
          }
          break;
        }
      }
    });
  });
};
