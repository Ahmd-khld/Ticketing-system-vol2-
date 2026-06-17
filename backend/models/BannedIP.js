const mongoose = require('mongoose');
const { encryptDeterministic, decryptDeterministic } = require('../utils/encryption');

const bannedIPSchema = new mongoose.Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
      get: decryptDeterministic,
      set: encryptDeterministic,
    },
    reason: {
      type: String,
      default: 'Exceeded 50 failed login attempts',
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

bannedIPSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BannedIP', bannedIPSchema);
