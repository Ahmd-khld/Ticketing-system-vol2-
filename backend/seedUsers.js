require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // Assuming this path based on your server.js

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park')
  .then(async () => {
    console.log('MongoDB Connected. Seeding 1000 users...');

    try {
      // We hash the password ONLY ONCE to save CPU time, then reuse it for all users.
      const seedPassword = process.env.SEED_USER_PASSWORD || 'password123';
      const seedCount = parseInt(process.env.SEED_USER_COUNT) || 1000;
      const hashedPassword = await bcrypt.hash(seedPassword, 12);
      const usersToInsert = [];

      for (let i = 1; i <= seedCount; i++) {
        usersToInsert.push({
          name: `Test User ${i}`,
          email: `testuser${i}@smartpark.com`,
          phone: `0100000${i.toString().padStart(4, '0')}`,
          password: hashedPassword,
          age: Math.floor(Math.random() * 50) + 18, // Random age between 18 and 67
          role: 'user',
          isVerified: true,
          hasDisability: Math.random() > 0.9, // ~10% chance of having a disability
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Bulk insert is much faster than saving them one by one in a loop
      await User.insertMany(usersToInsert);
      console.log(`Successfully added ${seedCount} users to the database!`);
      process.exit(0);
    } catch (error) {
      console.error('Error seeding users:', error);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
