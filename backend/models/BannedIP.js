const mongoose = require('mongoose');

const bannedIPSchema = new mongoose.Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    reason: {
      type: String,
      default: 'Exceeded 50 failed login attempts',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('BannedIP', bannedIPSchema);
