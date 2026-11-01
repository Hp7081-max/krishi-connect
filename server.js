require('dotenv').config();
const http = require('http');
const fs = require('fs');
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
const gradeAIRoutes = require('./routes/gradeAI');
const mandiRoutes = require('./routes/mandi');
const chatRoutes = require('./routes/chat');
const chatService = require('./services/chatService');
const { mountChatExtras } = require('./routes/chatExtras'); // offer, photo, voice, mandi rate cards

const app = express();
app.set('trust proxy', 1);
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
// Private chat uses its own Socket.IO namespace (/chat) and checks the login token itself
chatService.setSocketIO(io);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Only expose the frontend script (NOT the whole project folder, which would leak data/db.json, source code, etc.)
app.get('/api-client.js', (req, res) => res.sendFile(path.join(__dirname, 'api-client.js')));
// PWA files (install-as-app support)
['manifest.json','sw.js','offline.html','icon-192.png','icon-512.png','apple-touch-icon.png'].forEach(function (f) {
  app.get('/' + f, function (req, res) {
    if (f === 'sw.js') res.set('Cache-Control', 'no-cache');
    if (f === 'manifest.json') res.type('application/manifest+json');
    res.sendFile(path.join(__dirname, f));
  });
});

app.get('/voice.js', (req, res) => res.sendFile(path.join(__dirname, 'voice.js')));
app.get('/mandi-live.js', (req, res) => res.sendFile(path.join(__dirname, 'mandi-live.js')));
app.get('/disease-ai.js', (req, res) => res.sendFile(path.join(__dirname, 'disease-ai.js')));
app.get('/chat-client.js', (req, res) => res.sendFile(path.join(__dirname, 'chat-client.js')));

// Chat extras (offer / listing card / voice / photo / mandi rate) + mic position
app.get('/chat-extras.js', (req, res) => res.sendFile(path.join(__dirname, 'chat-extras.js')));
app.get('/chat-extras.css', (req, res) => res.sendFile(path.join(__dirname, 'chat-extras.css')));
app.get('/mic-position.js', (req, res) => res.sendFile(path.join(__dirname, 'mic-position.js')));

// Serve fully final.html at root route
// The chat script is added automatically (unless the page already has a <script src="...chat-client.js"> tag).
// Same for the chat extras + mic position files.
let appHtml = null;
app.get('/', (req, res) => {
  try {
    if (!appHtml) {
      let html = fs.readFileSync(path.join(__dirname, 'fully final.html'), 'utf8');
      if (!/<script[^>]+src=["'][^"']*chat-client\.js/i.test(html)) {
        html = html.replace('</body>', '<script src="/chat-client.js"></script>\n</body>');
      }
      if (!/chat-extras\.js/i.test(html)) {
        html = html.replace('</head>', '<link rel="stylesheet" href="/chat-extras.css">\n</head>');
        html = html.replace(
          '</body>',
          '<script src="/chat-extras.js" defer></script>\n<script src="/mic-position.js" defer></script>\n</body>'
        );
      }
      appHtml = html;
    }
    res.type('html').send(appHtml);
  } catch (e) {
    res.sendFile(path.join(__dirname, 'fully final.html'));
  }
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
app.use('/api/grade-ai', requireAuth, gradeAIRoutes);
app.use('/api/mandi', requireAuth, mandiRoutes);
app.use('/api/chat', chatRoutes); // does its own (always-on) login check
mountChatExtras(app); // /api/chat-extras (checks the login token itself) + /uploads
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
  if (typeof dataService.applyAdminPassword === 'function') await dataService.applyAdminPassword();

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
