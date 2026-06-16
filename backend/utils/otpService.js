const crypto = require('crypto');

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

module.exports = { generateOtp, hashOtp, verifyOtp, OTP_LENGTH };
