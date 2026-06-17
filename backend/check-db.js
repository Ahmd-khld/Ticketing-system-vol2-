const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function checkUser() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park');
  const user = await User.findOne({ email: /ahmedfacebook267/i });
  console.log('Found user in DB:');
  console.log(user ? { email: user.email, name: user.name, role: user.role } : 'Not found');
  mongoose.disconnect();
}

checkUser();
