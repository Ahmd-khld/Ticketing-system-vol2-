const mongoose = require('mongoose');
const { encryptDeterministic, decryptDeterministic } = require('../utils/encryption');

const whitelistedIPSchema = new mongoose.Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
      get: decryptDeterministic,
      set: encryptDeterministic,
    },
    macAddress: {
      type: String,
      default: '',
      get: decryptDeterministic,
      set: encryptDeterministic,
    },
    adminEmail: {
      type: String,
      default: '',
      get: decryptDeterministic,
      set: encryptDeterministic,
    },
    description: {
      type: String,
      default: 'Added via Admin Dashboard',
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

whitelistedIPSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WhitelistedIP', whitelistedIPSchema);
