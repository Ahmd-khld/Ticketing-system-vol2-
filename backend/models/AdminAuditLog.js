const mongoose = require('mongoose');
const { encryptDeterministic, decryptDeterministic } = require('../utils/encryption');

const adminAuditLogSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      get: decryptDeterministic,
      set: encryptDeterministic,
    },
    ipAddress: {
      type: String,
      required: true,
      get: decryptDeterministic,
      set: encryptDeterministic,
    },
    status: {
      type: String,
      enum: ['success', 'failed'],
      required: true,
    },
    statusCode: {
      type: Number,
    },
    action: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Performance Indexes for quick searching
adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ email: 1, status: 1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
