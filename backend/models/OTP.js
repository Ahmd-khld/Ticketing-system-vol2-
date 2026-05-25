const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 600, // OTP expires in 10 minutes
    },
  },
  {
    timestamps: true,
  }
);

const OTP = mongoose.model('OTP', otpSchema);
module.exports = OTP;
