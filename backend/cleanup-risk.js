const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Risk = require('./models/Risk');

const cleanup = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const result = await Risk.deleteMany({ id: { $regex: /RISK-INSIDER-ahmed@admin\.com -/i } });
    console.log(`Deleted ${result.deletedCount} ghost records.`);
    
    // Also delete any with trailing empty string or just the exact ID if needed
    const exact = await Risk.deleteMany({ id: 'RISK-INSIDER-ahmed@admin.com -' });
    console.log(`Deleted ${exact.deletedCount} exact ghost records.`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

cleanup();
