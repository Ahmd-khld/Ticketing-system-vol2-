const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
    },
    password: {
      type: String,
      required: true,
    },
    age: {
      type: Number,
    },
    hasDisability: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    isRestricted: {
      type: Boolean,
      default: false,
    },
    restrictionReason: {
      type: String,
      default: '',
    },
    deletionDate: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'sub-admin', 'customer', 'viewer'],
      default: 'user',
    },
    permissions: {
      hardwareControl: { type: Boolean, default: false },
      systemSettings: { type: Boolean, default: false },
      auditLogs: { type: Boolean, default: false },
      userManagement: { type: Boolean, default: false },
    },
    savedCards: [
      {
        last4Digits: String,
        encryptedData: String,
      },
    ],
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    gameStats: {
      trialsUsed: { type: Number, default: 0 },
      lastPlayedMonth: { type: Number, default: () => new Date().getMonth() + 1 },
      lastPlayedYear: { type: Number, default: () => new Date().getFullYear() },
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Auto-delete account after 1 month if deletionDate is set
userSchema.index({ deletionDate: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model('User', userSchema);
module.exports = User;
