const mongoose = require('mongoose');
const { server, app, io } = require('./app');
const User = require('./models/User');
const { initTicketCron } = require('./cron/ticketCron');
const grcService = require('./utils/grcService');

const PORT = process.env.PORT || 5000;

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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server is running on http://0.0.0.0:${PORT}`);
});
