const crypto = require('crypto');
const OTP = require('../models/OTP');

/**
 * otpService — centralized, security-focused OTP generation & verification.
 *
 * Design notes:
 *  - Codes are generated with crypto.randomInt (CSPRNG, uniform), NOT Math.random.
 *  - We never persist the plaintext OTP. We store an HMAC-SHA256 hash keyed by a
 *    server-side pepper, so a leaked DB row cannot reveal usable codes.
 *  - Verification uses a constant-time comparison to avoid timing side channels.
 *
 * This is intentionally decoupled from any route/controller so the same logic can
 * back every OTP flow (email change, deletion, 2FA, ...).
 */

const OTP_LENGTH = 6;

const generateOtp = () => {
  // 0..999999 -> always padded to 6 digits (so "000123" is valid).
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, '0');
};

const getPepper = () => {
  const pepper = (process.env.OTP_PEPPER || process.env.JWT_SECRET || '').trim();
  if (!pepper) {
    // Fail loud rather than silently hashing with an empty key.
    throw new Error('OTP hashing pepper is not configured (set OTP_PEPPER or JWT_SECRET).');
  }
  return pepper;
};

const hashOtp = (otp) =>
  crypto.createHmac('sha256', getPepper()).update(String(otp)).digest('hex');

const verifyOtp = (plainOtp, storedHash) => {
  if (!plainOtp || !storedHash) return false;
  const computed = Buffer.from(hashOtp(plainOtp), 'hex');
  const stored = Buffer.from(String(storedHash), 'hex');
  // timingSafeEqual throws if lengths differ, so guard first.
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
};

// ---- Shared OTP collection helpers (hashed at rest) -------------------------
// These back the legacy email-OTP flows (login verification, 2FA, password reset,
// account deletion). One OTP document per email; the plaintext code is returned
// only to the caller for emailing and is never persisted.

const issueOtp = async (email) => {
  const code = generateOtp();
  await OTP.findOneAndUpdate(
    { email },
    { otp: hashOtp(code), createdAt: Date.now() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return code;
};

// Returns true and consumes (deletes) the OTP on a correct match, false otherwise.
const consumeOtp = async (email, code) => {
  if (!code) return false;
  const record = await OTP.findOne({ email });
  if (record && verifyOtp(code, record.otp)) {
    await OTP.deleteOne({ _id: record._id });
    return true;
  }
  return false;
};

module.exports = { generateOtp, hashOtp, verifyOtp, issueOtp, consumeOtp, OTP_LENGTH };
