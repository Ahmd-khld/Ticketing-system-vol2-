const mongoose = require('mongoose');
require('dotenv').config();
const grcService = require('./utils/grcService');

async function test() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park');
  const res1 = await grcService.runRiskAssessment();
  const res2 = await grcService.runRiskAssessment();
  process.exit(0);
}
test();
