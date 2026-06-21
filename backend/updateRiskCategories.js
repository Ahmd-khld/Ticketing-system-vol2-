const mongoose = require('mongoose');
const Risk = require('./models/Risk');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park');
  const result = await Risk.updateMany(
    { category: { $in: ['BRUTE_FORCE', 'INSIDER THREAT', 'rbac'] } },
    { $set: { category: 'Account' } }
  );
  console.log(`Updated ${result.modifiedCount} risks to 'Account' category.`);
  process.exit(0);
}
run();
