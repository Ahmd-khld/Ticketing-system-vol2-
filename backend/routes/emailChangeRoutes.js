const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const validateRequest = require('../middleware/validateRequest');
const { otpRequestLimiter, otpVerifyLimiter } = require('../middleware/rateLimiters');
const { requireEmailChangeToken } = require('../middleware/emailChangeToken');
const {
  initiateEmailChangeSchema,
  verifyCurrentEmailSchema,
  setNewEmailSchema,
  verifyNewEmailSchema,
} = require('../validators/schemas');
const {
  initiateEmailChange,
  verifyCurrentEmail,
  setNewEmail,
  verifyNewEmail,
  checkEmailAvailability,
} = require('../controllers/emailChangeController');

// All routes require an authenticated session (protect). Phase-3 routes ALSO
// require the short-lived temp token from phase 1 (requireEmailChangeToken).

// ---- Pre-flight check -------------------------------------------------------
router.post(
  '/check-availability',
  protect,
  validateRequest(setNewEmailSchema), // uses { newEmail } validation
  checkEmailAvailability
);

// ---- Phase 1: re-authenticate (password) then verify a 2FA code -------------
// Step 1: password -> sends a 2FA security code to the current email.
router.post(
  '/initiate',
  protect,
  otpRequestLimiter,
  validateRequest(initiateEmailChangeSchema),
  initiateEmailChange
);
// Step 2: 2FA code -> returns a short-lived temp token.
router.post(
  '/verify-2fa',
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
