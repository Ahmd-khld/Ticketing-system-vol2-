const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/User');
const Ticket = require('./models/Ticket');
const Backup = require('./models/Backup');
const HardwareAlert = require('./models/HardwareAlert');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

async function runTests() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for Testing...');

    // --- 1. Brute Force Test ---
    console.log('Triggering Brute Force Test...');
    await User.findOneAndUpdate(
      { role: 'user' }, 
      { otpAttempts: 6, isVerified: false }, 
      { upsert: true, returnDocument: 'after' }
    );

    // --- 2. Permission Creep Test ---
    console.log('Triggering RBAC Permission Creep Test...');
    await User.findOneAndUpdate(
      { email: 'rogue@test.com' },
      { 
        name: 'Rogue User', 
        email: 'rogue@test.com', 
        role: 'user', 
        password: 'password123',
        permissions: { hardwareControl: true, systemSettings: true },
        isVerified: true
      },
      { upsert: true }
    );

    // --- 3. Operational Backlog Test ---
    console.log('Triggering Operational Backlog (20 Tickets)...');
    const tickets = [];
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + 1);

    for (let i = 0; i < 20; i++) {
      tickets.push({
        userId: new mongoose.Types.ObjectId(),
        ticketType: 'adult',
        subscriptionPlan: 'one-time',
        price: 10,
        status: 'INACTIVE', 
        validFrom: now,
        validUntil: future,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        promoCodeName: 'Auto-generated for GRC testing'
      });
    }
    await Ticket.deleteMany({ promoCodeName: 'Auto-generated for GRC testing' });
    await Ticket.insertMany(tickets);

    // --- 4. Stale Backup Test ---
    console.log('Triggering Stale Backup Test...');
    await Backup.deleteMany({});
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - 10); // 10 days ago
    await Backup.create({
      date: staleDate,
      data: { system: 'Smart Park', status: 'Healthy', note: 'Mock data for GRC test' }
    });

    // --- 5. Hardware Failure Test ---
    console.log('Triggering Hardware Failure (5 Errors)...');
    const errors = [];
    for (let i = 0; i < 5; i++) {
      errors.push({
        sensor: 'Soil Moisture Sensor 01',
        type: 'error',
        message: 'Timeout error while reading pin A0',
        timeString: new Date().toLocaleTimeString()
      });
    }
    await HardwareAlert.insertMany(errors);

    // --- 6. Unverified Admin Test ---
    console.log('Triggering Unverified Admin Test...');
    await User.findOneAndUpdate(
      { email: 'newadmin@test.com' },
      { 
        name: 'New Admin', 
        email: 'newadmin@test.com', 
        role: 'admin', 
        isVerified: false,
        password: 'password123'
      },
      { upsert: true }
    );

    console.log('\n✅ ALL TESTS TRIGGERED SUCCESSFULLY!');
    console.log('Open your GRC Dashboard and wait 5 seconds for the live update.');
    
    process.exit(0);
  } catch (error) {
    console.error('Test Execution Failed:', error);
    process.exit(1);
  }
}

runTests();
