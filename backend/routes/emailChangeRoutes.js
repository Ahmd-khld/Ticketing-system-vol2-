const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { otpRequestLimiter, otpVerifyLimiter } = require('../middleware/rateLimiters');
const { requireEmailChangeToken } = require('../middleware/emailChangeToken');
const {
  verifyCurrentEmailSchema,
  setNewEmailSchema,
  verifyNewEmailSchema,
} = require('../validators/schemas');
const {
  requestEmailChange,
  verifyCurrentEmail,
  setNewEmail,
  verifyNewEmail,
} = require('../controllers/emailChangeController');

// All routes require an authenticated session (protect). Phase-3 routes ALSO
// require the short-lived temp token from phase 1 (requireEmailChangeToken).

// ---- Phase 1: verify the CURRENT email --------------------------------------
router.post('/request', protect, otpRequestLimiter, requestEmailChange);
router.post(
  '/verify-current',
  protect,
  otpVerifyLimiter,
  validateRequest(verifyCurrentEmailSchema),
  verifyCurrentEmail
);

// ---- Phase 3: set & verify the NEW email ------------------------------------
router.post(
  '/set-new-email',
  protect,
  otpRequestLimiter,
  requireEmailChangeToken,
  validateRequest(setNewEmailSchema),
  setNewEmail
);
router.post(
  '/verify-new',
  protect,
  otpVerifyLimiter,
  requireEmailChangeToken,
  validateRequest(verifyNewEmailSchema),
  verifyNewEmail
);

module.exports = router;
