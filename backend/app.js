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
const { checkBannedIP, verifyAdminWhitelist } = require('./middleware/ipControl');

const ticketRoutes = require('./routes/ticketRoutes');
const adminRoutes = require('./routes/adminRoutes');
const grcRoutes = require('./routes/grcRoutes');
const promoRoutes = require('./routes/promoRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gameRoutes = require('./routes/gameRoutes');
const otpRoutes = require('./routes/otpRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const stateRoutes = require('./routes/state');

const app = express();
const server = http.createServer(app);

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

    const secret = (process.env.JWT_SECRET || '').trim();
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.user = user;
    next();
  } catch (err) {
    console.error('Socket Auth Error:', err.message);
    next(new Error(`Authentication error: ${err.message}`));
  }
});

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

app.use('/api/hardware/telemetry', express.text({ type: '*/*' }));
app.use(express.json());
app.use(checkBannedIP);

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

const grcService = require('./utils/grcService');

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
app.use('/api', telemetryRoutes);
app.use('/api', stateRoutes);

app.get('/api/admin/trigger-test-attack', async (req, res) => {
  try {
    await HardwareAlert.create({
      sensor: 'Network Sniffer',
      type: 'error',
      message: 'CRITICAL: Repeated brute force attacks from 192.168.1.50',
      timeString: new Date().toLocaleTimeString(),
    });
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
    await HardwareAlert.deleteMany({});
    await logAdminActionServer(req, 'Cleared all dummy ticket and hardware data');
    if (io) {
      io.emit('dataRefresh');
      io.emit('hardwareAlertsCleared');
    }
    res.json({ message: 'Successfully cleared all dummy data!' });
  } catch (error) {
    console.error('Clear Dummy Data Error:', error);
    res.status(500).json({ message: 'Failed to clear dummy tickets' });
  }
});

io.on('connection', (socket) => {
  socket.on('joinUserRoom', (rawUserId) => {
    const userId = String(rawUserId);
    if (socket.user.role === 'admin' || socket.user.role === 'sub-admin' || socket.user._id.toString() === userId) {
      socket.join(`user-${userId}-tickets`);
    }
  });

  socket.on('joinAdminRoom', () => {
    if (socket.user.role === 'admin' || socket.user.role === 'sub-admin') {
      socket.join('admin-room');
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

module.exports = { app, server, io };
