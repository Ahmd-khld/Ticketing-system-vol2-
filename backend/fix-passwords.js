const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');
require('dotenv').config({ quiet: true });

const isBcryptHash = (str) => /^\$2[aby]\$\d{2}\$[./0-9A-Za-z]{53}$/.test(str);

async function fixPasswords() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park');
    console.log('Connected to MongoDB...');

    const users = await User.find({});
    let fixedCount = 0;

    for (const user of users) {
      if (!isBcryptHash(user.password)) {
        console.log(`Hashing plain text password for user: ${user.email}`);
        // We can just call save() because our new middleware will handle the hashing
        // as long as it's not already a bcrypt hash.
        await user.save();
        fixedCount++;
      }
    }

    console.log(`Successfully fixed ${fixedCount} passwords.`);
    process.exit(0);
  } catch (err) {
    console.error('Error fixing passwords:', err);
    process.exit(1);
  }
}

fixPasswords();
