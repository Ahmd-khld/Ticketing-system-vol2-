const mongoose = require('mongoose');
const { server, app, io } = require('./app');
const User = require('./models/User');
const WhitelistedIP = require('./models/WhitelistedIP');
const { initTicketCron } = require('./cron/ticketCron');
const grcService = require('./utils/grcService');
const { encryptDeterministic } = require('./utils/encryption');

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park')
  .then(() => {
    console.log('MongoDB Connected');
    initAdmin();
    initWhitelist();
    initTicketCron();
    grcService.setIO(io);
    grcService.startBackgroundDaemon();
  })
  .catch((err) => console.error('MongoDB connection error:', err));

const initAdmin = async () => {
  try {
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
    const adminExists = await User.findOne({ email: superAdminEmail });
    if (!adminExists) {
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
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

const initWhitelist = async () => {
  try {
    const defaultIPs = [
      { ipAddress: '127.0.0.1', description: 'Localhost IPv4' },
      { ipAddress: '::1', description: 'Localhost IPv6' },
      { ipAddress: '::ffff:127.0.0.1', description: 'Localhost IPv4 mapped IPv6' }
    ];
    for (const ip of defaultIPs) {
      const exists = await WhitelistedIP.findOne({ ipAddress: ip.ipAddress });
      if (!exists) {
        await WhitelistedIP.create(ip);
        console.log(`Whitelisted local IP: ${ip.ipAddress}`);
      }
    }
  } catch (error) {
    console.error('Failed to initialize Whitelisted IPs:', error);
  }
};

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server is running on http://0.0.0.0:${PORT}`);
});
