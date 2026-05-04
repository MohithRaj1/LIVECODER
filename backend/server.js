require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const roomRoutes = require('./routes/rooms');
const aiRoutes = require('./routes/ai');
const executeRoutes = require('./routes/execute');
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Landing Route
app.get('/', (req, res) => {
  res.send('<h1>LiveCode Backend is Running!</h1><p>Visit <a href="http://localhost:5174">http://localhost:5174</a> to use the app.</p>');
});

// Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/execute', executeRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'LiveCode backend is running' });
});

// Socket.IO
socketHandler(io);

// MongoDB Connection Setup
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/livecoder';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.warn('⚠️ Standard MongoDB connection failed, starting in-memory database...');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    console.log(`✅ In-memory MongoDB connected: ${uri}`);
  }

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 LiveCode server running on http://localhost:${PORT}`);
  });
};

connectDB().catch(console.error);
