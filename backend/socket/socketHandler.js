const Room = require('../models/Room');
const Message = require('../models/Message');
const ActivityEvent = require('../models/ActivityEvent');
const { verifySocketToken } = require('../middleware/auth');

// Map of roomId -> Set of connected socket IDs with user info
const rooms = new Map();
// Map of roomId -> { rev: number, code: string, history: Array<op> }
const docs = new Map();

// Generate a random avatar color
const COLORS = [
  '#00d4ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#a855f7',
  '#f97316', '#ec4899', '#14b8a6', '#3b82f6', '#ef4444',
];
const getColor = (index) => COLORS[index % COLORS.length];

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    // Capture token from handshake auth set by client before connect()
    socket.data.token = socket.handshake?.auth?.token || null;

    function getDoc(roomId, initialCode) {
      if (!docs.has(roomId)) {
        docs.set(roomId, { rev: 0, code: initialCode || '', history: [] });
      }
      return docs.get(roomId);
    }

    function applyOpToText(text, op) {
      const pos = Math.max(0, Math.min(text.length, op.pos | 0));
      const del = Math.max(0, Math.min(text.length - pos, op.del | 0));
      const ins = typeof op.ins === 'string' ? op.ins : '';
      return text.slice(0, pos) + ins + text.slice(pos + del);
    }

    // Basic text OT: transform opB to apply after opA (single op form).
    function transformAgainst(opB, opA) {
      let { pos, del, ins } = opB;
      const aPos = opA.pos | 0;
      const aDel = opA.del | 0;
      const aInsLen = (opA.ins || '').length;

      // If A inserts before B's position, shift right.
      if (aInsLen > 0 && aPos <= pos) {
        pos += aInsLen;
      }

      // If A deletes before B's position, shift left by deleted chars that are strictly before B.
      if (aDel > 0) {
        const aEnd = aPos + aDel;
        if (aEnd <= pos) {
          pos -= aDel;
        } else if (aPos < pos && aEnd > pos) {
          // B's position was inside deleted region; snap to start.
          pos = aPos;
        }

        // If B deletes and A deletes overlap, shrink B.del accordingly.
        if (del > 0) {
          const bStart = pos;
          const bEnd = pos + del;
          const overlapStart = Math.max(aPos, bStart);
          const overlapEnd = Math.min(aEnd, bEnd);
          if (overlapEnd > overlapStart) {
            del -= overlapEnd - overlapStart;
          }
        }
      }

      return { pos, del, ins };
    }

    // Join a coding room
    socket.on('join-room', async ({ roomId, token }) => {
      try {
        const payload = verifySocketToken(token);
        if (!payload) {
          socket.emit('error', { message: 'Please login to join rooms' });
          return;
        }
        const username = payload.username;
        const userId = payload.sub;
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

        const doc = getDoc(roomId, room.code);
        // Keep memory doc in sync with DB (first join wins).
        if (!doc.code && room.code) doc.code = room.code;

        // Fetch recent messages
        const messages = await Message.find({ roomId }).sort({ timestamp: 1 }).limit(100);

        // Send current room state to the joining user
        socket.emit('room-joined', {
          code: doc.code,
          rev: doc.rev,
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

        ActivityEvent.create({ roomId, userId, username, type: 'join' }).catch(() => {});

        console.log(`${username} joined room ${roomId}`);
      } catch (err) {
        console.error('join-room error:', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // OT operation event: { baseRev, op: {pos, del, ins} }
    socket.on('ot-op', async ({ roomId, baseRev, op }) => {
      try {
        if (!roomId || !op) return;
        const payload = verifySocketToken(socket.data.token) || null;
        const userId = payload?.sub || 'unknown';
        const username = payload?.username || 'unknown';
        const room = await Room.findOne({ roomId });
        const doc = getDoc(roomId, room?.code || '');

        const br = Number(baseRev);
        if (!Number.isFinite(br) || br < 0) return;

        let transformed = { pos: Number(op.pos) || 0, del: Number(op.del) || 0, ins: typeof op.ins === 'string' ? op.ins : '' };

        // Transform against all ops since baseRev
        for (let i = br; i < doc.history.length; i++) {
          transformed = transformAgainst(transformed, doc.history[i]);
        }

        doc.code = applyOpToText(doc.code, transformed);
        doc.history.push(transformed);
        doc.rev = doc.history.length;

        // Broadcast to everyone (including sender) so clients can align revisions.
        io.to(roomId).emit('ot-apply', { op: transformed, rev: doc.rev, sender: socket.id });

        // Lightweight analytics: track edit deltas
        const delta = (transformed.ins?.length || 0) - (transformed.del || 0);
        ActivityEvent.create({
          roomId,
          userId,
          username,
          type: 'edit',
          meta: { delta, pos: transformed.pos, del: transformed.del, insLen: transformed.ins?.length || 0, rev: doc.rev },
        }).catch(() => {});

        // Persist occasionally (simple throttle: every 20 ops)
        if (doc.rev % 20 === 0) {
          await Room.findOneAndUpdate({ roomId }, { code: doc.code, updatedAt: Date.now() });
        }
      } catch (err) {
        console.error('ot-op error:', err.message);
        socket.emit('error', { message: 'Failed to apply operation' });
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

        const payload = verifySocketToken(socket.data.token) || null;
        ActivityEvent.create({
          roomId,
          userId: payload?.sub || 'unknown',
          username: payload?.username || username,
          type: 'chat',
          meta: { length: String(text || '').length },
        }).catch(() => {});
      } catch (err) {
        console.error('send-message error:', err.message);
      }
    });

    // Typing indicator
    socket.on('typing', ({ roomId, username, isTyping }) => {
      socket.to(roomId).emit('user-typing', { username, isTyping });
    });

    // --- WebRTC signaling (audio/video optional) ---
    socket.on('webrtc-offer', ({ to, sdp }) => {
      if (!to || !sdp) return;
      socket.to(to).emit('webrtc-offer', { from: socket.id, sdp });
    });

    socket.on('webrtc-answer', ({ to, sdp }) => {
      if (!to || !sdp) return;
      socket.to(to).emit('webrtc-answer', { from: socket.id, sdp });
    });

    socket.on('webrtc-ice', ({ to, candidate }) => {
      if (!to || !candidate) return;
      socket.to(to).emit('webrtc-ice', { from: socket.id, candidate });
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

          const payload = verifySocketToken(socket.data.token) || null;
          ActivityEvent.create({
            roomId,
            userId: payload?.sub || 'unknown',
            username: payload?.username || user.username,
            type: 'leave',
          }).catch(() => {});
          break;
        }
      }
    });
  });
};
