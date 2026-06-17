const mongoose = require('mongoose');

const whitelistedIPSchema = new mongoose.Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    macAddress: {
      type: String,
      default: '',
    },
    adminEmail: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      default: 'Added via Admin Dashboard',
    },
  },
  {
    timestamps: true,
  }
);

whitelistedIPSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WhitelistedIP', whitelistedIPSchema);
