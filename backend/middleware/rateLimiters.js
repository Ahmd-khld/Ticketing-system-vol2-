const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per `window`
  message: {
    status: 429,
    message: 'Too many login attempts, please try again after 15 minutes.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const promoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 promo validation requests per hour
  message: {
    status: 429,
    message: 'Too many attempts to validate promo codes, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiters key off an in-memory store shared across the whole process, which
// doesn't reset between tests; skip them under NODE_ENV=test so suites that make
// many OTP calls aren't throttled. Production behavior is unchanged.
const skipInTest = () => process.env.NODE_ENV === 'test';

// Throttles endpoints that SEND an OTP (prevents email-bombing / cost abuse).
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    status: 429,
    message: 'Too many verification code requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

// Throttles endpoints that VERIFY an OTP (network-level brute-force defense,
// complementing the per-request attempt counter in the controller).
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    status: 429,
    message: 'Too many verification attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
});

module.exports = {
  authLimiter,
  promoLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
};
