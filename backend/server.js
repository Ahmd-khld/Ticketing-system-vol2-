require('dotenv').config({ quiet: true });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookie = require('cookie');
const mongoSanitize = require('express-mongo-sanitize');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const Ticket = require('./models/Ticket');
const AdminAuditLog = require('./models/AdminAuditLog');
const BannedIP = require('./models/BannedIP');
const WhitelistedIP = require('./models/WhitelistedIP');
const HardwareAlert = require('./models/HardwareAlert');

const { protect } = require('./middleware/authMiddleware');
const { requireSuperAdmin, requireAdmin } = require('./middleware/superAdminMiddleware');

const ticketRoutes = require('./routes/ticketRoutes');
const adminRoutes = require('./routes/adminRoutes');
const grcRoutes = require('./routes/grcRoutes');
const promoRoutes = require('./routes/promoRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const otpRoutes = require('./routes/otpRoutes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

const io = new Server(server, {
  pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT) || 60000,
  pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL) || 25000,
  transports: ['websocket'],
  cors: {
    origin(origin, callback) {
      const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      const isAllowedLocalDevOrigin = (o) =>
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}):517\d$/.test(o);
      if (!origin || allowedOrigins.includes(origin) || isAllowedLocalDevOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  },
});

// Socket.io Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    if (user.role !== 'admin' && user.role !== 'sub-admin') {
      // User is authenticated but NOT an admin.
      // We allow the connection so they can receive personal notifications (like ticket updates),
      // but we will restrict joining the admin-room later in the connection handler.
    }

    socket.user = user;
    next();
  } catch (err) {
    console.error('Socket Auth Error:', err.message);
    next(new Error(`Authentication error: ${err.message}`));
  }
});

module.exports.io = io;
app.set('io', io);

app.use(
  cors({
    origin(origin, callback) {
      const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      const isAllowedLocalDevOrigin = (o) =>
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}):517\d$/.test(o);
      if (!origin || allowedOrigins.includes(origin) || isAllowedLocalDevOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());

// SAFE NOSQL SANITIZATION
// Using manual sanitization to avoid "only a getter" errors on req.query and req.params in modern Express
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.query) mongoSanitize.sanitize(req.query);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
});

app.use((req, res, next) => {
  if (req.headers.cookie) {
    const parsedCookies = cookie.parse(req.headers.cookie);
    const token = parsedCookies.token || parsedCookies.jwt;
    if (token && !req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }
  }
  next();
});

const { initTicketCron } = require('./cron/ticketCron');
const grcService = require('./utils/grcService');

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park')
  .then(() => {
    console.log('MongoDB Connected');
    initAdmin();
    initTicketCron();
    grcService.setIO(io);
  })
  .catch((err) => console.error('MongoDB connection error:', err));

const initAdmin = async () => {
  try {
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
    const adminExists = await User.findOne({ email: superAdminEmail });
    if (!adminExists) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      // Do NOT hash here, User.create will trigger pre-save hook which hashes it
      await User.create({
        name: 'System Administrator',
        email: superAdminEmail,
        phone: 'N/A',
        password: adminPassword,
        age: 30,
        role: 'admin',
        isVerified: true,
        hasDisability: false,
      });
      console.log('Admin user verified/created');
    }
  } catch (error) {
    console.error('Failed to initialize admin account:', error);
  }
};

const logAdminActionServer = async (req, actionDesc) => {
  try {
    if (!req.user || !req.user.email) return;
    const log = await AdminAuditLog.create({
      email: req.user.email,
      ipAddress: req.ip || 'unknown-client',
      status: 'success',
      statusCode: 200,
      action: actionDesc,
      userAgent: req.get('User-Agent') || 'Unknown',
    });
    if (io) io.emit('auditLogUpdate', log);
    
    // Live GRC Integration: Trigger risk assessment update on every admin action
    grcService.triggerGRCUpdate();
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
};

app.use('/api/users', userRoutes);
app.use('/api', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/grc', grcRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/promo', promoRoutes);
app.use('/api/otp', otpRoutes);

// TEMPORARY TEST TRIGGER FOR GRC DASHBOARD
app.get('/api/admin/trigger-test-attack', async (req, res) => {
  try {
    // Inject a fake hardware attack directly into MongoDB
    // Note: Using the schema fields present in HardwareAlert.js (message, sensor, type, timeString)
    await HardwareAlert.create({
      sensor: 'Network Sniffer',
      type: 'error',
      message: 'CRITICAL: Repeated brute force attacks from 192.168.1.50',
      timeString: new Date().toLocaleTimeString(),
    });
    
    // Optional: Emit a socket event if you want instant UI updates elsewhere
    if (io) io.emit('dataRefresh');
    
    res.send('🔥 Simulated attack successfully injected into MongoDB! Check your GRC dashboard.');
  } catch (error) {
    console.error('Trigger Error:', error);
    res.status(500).send('Failed to inject attack data.');
  }
});

app.delete('/api/admin/clear-dummy-tickets', requireSuperAdmin, async (req, res) => {
  try {
    await Ticket.deleteMany({});
    await logAdminActionServer(req, 'Cleared all dummy ticket data');
    if (io) io.emit('dataRefresh');
    res.json({ message: 'Successfully cleared all dummy tickets!' });
  } catch (error) {
    console.error('Clear Dummy Data Error:', error);
    res.status(500).json({ message: 'Failed to clear dummy tickets' });
  }
});

app.post('/api/admin/backups/:filename/restore', requireSuperAdmin, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const backupPath = path.join(__dirname, 'backups', filename);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ message: 'Backup file not found on server.' });
    }
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';
    const dbName = mongoose.connection.name;

    // Use spawn instead of exec to prevent command injection
    const { spawn } = require('child_process');
    const child = spawn('mongorestore', [
      `--uri=${mongoUri}`,
      `--archive=${backupPath}`,
      '--gzip',
      `--nsInclude=${dbName}.*`,
      '--drop',
    ]);

    let stderrData = '';
    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        console.error('Restore Error:', stderrData);
        return res.status(500).json({ message: 'Restore failed', error: stderrData });
      }

      await logAdminActionServer(req, `Restored database from backup: ${filename}`);
      if (io) io.emit('dataRefresh');
      res.status(200).json({ message: 'Database successfully restored from backup!' });
    });

    child.on('error', (err) => {
      console.error('Failed to start restore process:', err);
      res.status(500).json({ message: 'Failed to initiate restore process.' });
    });
  } catch (error) {
    console.error('Restore Error:', error);
    res.status(500).json({ message: 'Error initiating restore' });
  }
});

io.on('connection', (socket) => {
  // Allow admins to join any user room, and users to join their OWN room
  socket.on('joinUserRoom', (rawUserId) => {
    const userId = String(rawUserId);
    if (socket.user.role === 'admin' || socket.user.role === 'sub-admin' || socket.user._id.toString() === userId) {
      socket.join(`user-${userId}-tickets`);
      console.log(`Socket ${socket.id} joined room: user-${userId}-tickets`);
    }
  });

  socket.on('joinAdminRoom', () => {
    if (socket.user.role === 'admin' || socket.user.role === 'sub-admin') {
      socket.join('admin-room');
      console.log(`Socket ${socket.id} joined room: admin-room`);
    }
  });

  socket.on('leaveUserRoom', (userId) => {
    socket.leave(`user-${userId}-tickets`);
  });
});

app.use((err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  if (err.message === 'Not authorized, no session' || err.message === 'Not authorized, token failed') {
    statusCode = 401;
  }
  res.status(statusCode).json({ message: err.message });
});

server.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
