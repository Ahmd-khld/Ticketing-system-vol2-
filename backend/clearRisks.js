const mongoose = require('mongoose');
const Risk = require('./models/Risk');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park');
  const result = await Risk.deleteMany({
    $or: [
      { description: { $regex: 'pmqz8899@gmail.com', $options: 'i' } },
      { asset: { $regex: 'pmqz8899@gmail.com', $options: 'i' } }
    ]
  });
  console.log(`Deleted ${result.deletedCount} risks.`);
  process.exit(0);
}
run();
