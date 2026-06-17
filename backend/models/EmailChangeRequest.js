const mongoose = require('mongoose');
const { encryptDeterministic, decryptDeterministic } = require('../utils/encryption');

// The entire two-phase flow must complete within this window. The TTL index
// guarantees abandoned requests are purged even if the client never returns.
const EMAIL_CHANGE_TTL_SECONDS = 15 * 60; // 15 minutes

const emailChangeRequestSchema = new mongoose.Schema(
  {
    // One active request per user (upsert on (re)start).
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    step: {
      type: String,
      enum: ['verify-current', 'set-new-email', 'verify-new'],
      required: true,
    },
    currentEmail: { 
      type: String, 
      required: true,
      get: decryptDeterministic,
      set: encryptDeterministic,
    },
    newEmail: { 
      type: String, 
      default: null,
      get: decryptDeterministic,
      set: encryptDeterministic,
    },

    // HMAC hash of the OTP for the CURRENT step (never the plaintext code).
    otpHash: { type: String, default: null },
    otpExpiresAt: { type: Date, required: true },

    // Failed verification attempts for the current OTP (record-level brute-force cap).
    attempts: { type: Number, default: 0 },

    // Binds the short-lived temp token to this request; rotated each phase 1 success.
    tokenJti: { type: String, default: null },

    createdAt: {
      type: Date,
      default: Date.now,
      expires: EMAIL_CHANGE_TTL_SECONDS,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

module.exports = mongoose.model('EmailChangeRequest', emailChangeRequestSchema);
