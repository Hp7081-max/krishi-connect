require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { connectDB, getDBStatus } = require('./config/db');
const dataService = require('./services/dataService');
const { requireAuth } = require('./middleware/auth');

// Routers
const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const bidRoutes = require('./routes/bids');
const dealRoutes = require('./routes/deals');
const equipmentRoutes = require('./routes/equipment');
const walletRoutes = require('./routes/wallet');
const toolRoutes = require('./routes/tools');
const syncRoutes = require('./routes/sync');
const returnRoutes = require('./routes/returns');
const diseaseAIRoutes = require('./routes/diseaseAI');

const app = express();
const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

// Pass Socket.IO instance to dataService for live broadcasting
dataService.setSocketIO(io);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Only expose the frontend script (NOT the whole project folder, which would leak data/db.json, source code, etc.)
app.get('/api-client.js', (req, res) => res.sendFile(path.join(__dirname, 'api-client.js')));

app.get('/disease-ai.js', (req, res) => res.sendFile(path.join(__dirname, 'disease-ai.js')));

// Serve fully final.html at root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'fully final.html'));
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/listings', requireAuth, listingRoutes);
app.use('/api/bids', requireAuth, bidRoutes);
app.use('/api/deals', requireAuth, dealRoutes);
app.use('/api/returns', requireAuth, returnRoutes);
app.use('/api/equipment', requireAuth, equipmentRoutes);
app.use('/api/wallet', requireAuth, walletRoutes);
app.use('/api/tools', requireAuth, toolRoutes);
app.use('/api/disease-ai', requireAuth, diseaseAIRoutes);
app.use('/api/state', requireAuth, syncRoutes);

// General health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'Krishi Connect (Kisaan Setu)',
    version: '1.0.0',
    db: getDBStatus(),
    uptime: Math.round(process.uptime()) + 's'
  });
});

// Live Socket.IO connections
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Broadcast driver GPS coordinates live
  socket.on('driver:location', (data) => {
    socket.broadcast.emit('driver:location_update', data);
  });

  // Client request state refresh
  socket.on('state:request', async () => {
    try {
      const state = await dataService.getFullState();
      socket.emit('state:full', state);
    } catch (e) {
      console.error('Socket state request failed', e);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  // Initialize storage
  dataService.ensureDataFile();

  // Connect to DB
  await connectDB();
  await dataService.seedMongoDBIfNeeded();
  await dataService.applyAdminPassword();

  server.listen(PORT, () => {
    const dbStatus = getDBStatus();
    console.log('====================================================');
    console.log(`🚀 Krishi Connect Backend running on port ${PORT}`);
    console.log(`📡 Local URL: http://localhost:${PORT}`);
    console.log(`📊 Storage Mode: ${dbStatus.mode.toUpperCase()}`);
    console.log(`🗄️ Database: ${dbStatus.database}`);
    console.log(`⚡ Realtime Socket.IO: Active`);
    console.log('====================================================');
  });
}

startServer().catch((err) => {
  console.error('Failed to start Krishi Connect server:', err);
  process.exit(1);
});

module.exports = { app, server };
