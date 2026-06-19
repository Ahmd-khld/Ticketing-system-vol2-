const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const EmailChangeRequest = require('../models/EmailChangeRequest');
const { sendEmail } = require('../utils/emailService');
const { generateOtp, hashOtp, verifyOtp } = require('../utils/otpService');
const { signEmailChangeToken } = require('../middleware/emailChangeToken');

const OTP_TTL_MS = 10 * 60 * 1000; // each individual code lives 10 minutes
const TEMP_TOKEN_TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5; // failed OTP guesses before the request is destroyed



// Mirrors authRoutes.generateToken so a refreshed session matches login tokens.
const signSessionToken = (id, tokenVersion) => {
  const secret = (process.env.JWT_SECRET || '').trim();
  return jwt.sign({ id: String(id), v: tokenVersion }, secret, { expiresIn: '30d' });
};

const otpEmailHtml = (otpCode, purposeLine) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
    <h2 style="color: #0B4228; text-align: center;">Verification Code</h2>
    <p>Hello,</p>
    <p>Use the code below ${purposeLine}:</p>
    <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0B4228;">${otpCode}</span>
    </div>
    <p>This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="font-size: 12px; color: #6b7280; text-align: center;">Smart Garden IoT System</p>
  </div>
`;

/**
 * PHASE 1a — POST /api/users/email-change/initiate   (protect)
 * Re-authenticate with the account password, then send a 2FA security code to
 * the CURRENT email. The code is only sent if the password is correct, which
 * also prevents using this endpoint to email-bomb the address.
 */
const initiateEmailChange = async (req, res) => {
  try {
    const { password } = req.body;

    // req.user comes from `protect` with the password field stripped, so re-fetch
    // the full document to run the schema's matchPassword() comparison.
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!(await user.matchPassword(password))) {
      // 400 (not 401) on purpose: the session is still valid, only the re-auth
      // password is wrong. A 401 here would trip the global logout interceptor.
      return res.status(400).json({ message: 'Incorrect password.' });
    }

    const otp = generateOtp();
    await EmailChangeRequest.findOneAndUpdate(
      { user: user._id },
      {
        user: user._id,
        step: 'verify-current',
        currentEmail: user.email,
        newEmail: null,
        otpHash: hashOtp(otp),
        otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
        attempts: 0,
        tokenJti: null,
        createdAt: Date.now(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    sendEmail({
      to: user.email,
      subject: 'Security code to change your email address',
      html: otpEmailHtml(otp, 'as a two-factor security check to change your account email address'),
    }).catch(err => console.error('[EmailChange] Background email failed:', err.message));

    return res.json({ message: 'A two-factor security code has been sent to your current email address.' });
  } catch (error) {
    console.error('[EmailChange] initiate error:', error.message);
    return res.status(500).json({ message: 'Could not start the email change process.' });
  }
};

/**
 * PHASE 1b — POST /api/users/email-change/verify-2fa   (protect)
 * Verify the 2FA security code; on success mint a short-lived temp token.
 */
const verifyCurrentEmail = async (req, res) => {
  try {
    const { otp } = req.body;
    const request = await EmailChangeRequest.findOne({ user: req.user._id });

    if (!request || request.step !== 'verify-current') {
      return res.status(400).json({ message: 'No pending verification. Please restart the process.' });
    }
    if (request.otpExpiresAt < new Date()) {
      await EmailChangeRequest.deleteOne({ _id: request._id });
      return res.status(400).json({ message: 'Verification code expired. Please restart the process.' });
    }
    if (request.attempts >= MAX_ATTEMPTS) {
      await EmailChangeRequest.deleteOne({ _id: request._id });
      return res.status(429).json({ message: 'Too many incorrect attempts. Please restart the process.' });
    }
    if (!verifyOtp(otp, request.otpHash)) {
      request.attempts += 1;
      await request.save();
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Success: advance the state machine and bind a fresh temp token to it.
    const jti = crypto.randomUUID();
    request.step = 'set-new-email';
    request.otpHash = null;
    request.attempts = 0;
    request.tokenJti = jti;
    await request.save();

    const token = signEmailChangeToken(req.user._id, request._id, jti);
    return res.json({
      message: 'Identity confirmed. You may now enter your new email address.',
      token,
      expiresInSeconds: TEMP_TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    console.error('[EmailChange] verify-current error:', error.message);
    return res.status(500).json({ message: 'Verification failed.' });
  }
};

/**
 * PRE-FLIGHT CHECK — POST /api/users/email-change/check-availability   (protect)
 * Checks if the proposed new email is already in use by a User or Pending OTP Registration.
 */
const checkEmailAvailability = async (req, res) => {
  try {
    const newEmail = String(req.body.newEmail || '').trim().toLowerCase();
    
    // Check if the current user is trying to change to their own email
    const currentUser = await User.findById(req.user._id);
    if (currentUser && newEmail === String(currentUser.email).toLowerCase()) {
      return res.status(400).json({ message: 'The new email must be different from your current email.' });
    }

    // Check existing verified/unverified users
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'That email address is already in use.' });
    }

    // Check pending OTP registrations
    const OTP = require('../models/OTP');
    const existingOtp = await OTP.findOne({ email: newEmail });
    if (existingOtp) {
      return res.status(409).json({ message: 'That email address is already in use.' });
    }

    return res.status(200).json({ message: 'Email is available' });
  } catch (error) {
    console.error('[EmailChange] checkEmailAvailability error:', error.message);
    return res.status(500).json({ message: 'Failed to check email availability.' });
  }
};

/**
 * PHASE 3a — POST /api/users/email-change/set-new-email   (protect + requireEmailChangeToken)
 * Validate the temp token, ensure the new email is free, OTP to the NEW email.
 */
const setNewEmail = async (req, res) => {
  try {
    const newEmail = String(req.body.newEmail || '').trim().toLowerCase();

    const request = await EmailChangeRequest.findOne({ user: req.user._id });
    if (
      !request ||
      request.tokenJti !== req.emailChange.jti ||
      String(request._id) !== String(req.emailChange.requestId)
    ) {
      return res.status(401).json({ message: 'This authorization is no longer valid. Please restart.' });
    }
    if (!['set-new-email', 'verify-new'].includes(request.step)) {
      return res.status(400).json({ message: 'Unexpected step. Please restart the process.' });
    }
    if (newEmail === String(request.currentEmail).toLowerCase()) {
      return res.status(400).json({ message: 'The new email must be different from your current email.' });
    }

    const existing = await User.findOne({ email: newEmail });
    if (existing) {
      return res.status(409).json({ message: 'That email address is already in use.' });
    }

    const otp = generateOtp();
    request.newEmail = newEmail;
    request.otpHash = hashOtp(otp);
    request.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    request.attempts = 0;
    request.step = 'verify-new';
    await request.save();

    sendEmail({
      to: newEmail,
      subject: 'Verify your new email address',
      html: otpEmailHtml(otp, 'to verify your new email address'),
    }).catch(err => console.error('[EmailChange] Background email failed:', err.message));

    return res.json({ message: 'A verification code has been sent to your new email address.' });
  } catch (error) {
    console.error('[EmailChange] set-new-email error:', error.message);
    return res.status(500).json({ message: 'Could not set the new email address.' });
  }
};

/**
 * PHASE 3b — POST /api/users/email-change/verify-new   (protect + requireEmailChangeToken)
 * Final OTP check, commit the new email, invalidate temp token + all sessions.
 */
const verifyNewEmail = async (req, res) => {
  try {
    const { otp } = req.body;
    const request = await EmailChangeRequest.findOne({ user: req.user._id });

    if (!request || request.tokenJti !== req.emailChange.jti || request.step !== 'verify-new') {
      return res.status(401).json({ message: 'This authorization is no longer valid. Please restart.' });
    }
    if (request.otpExpiresAt < new Date()) {
      await EmailChangeRequest.deleteOne({ _id: request._id });
      return res.status(400).json({ message: 'Verification code expired. Please restart the process.' });
    }
    if (request.attempts >= MAX_ATTEMPTS) {
      await EmailChangeRequest.deleteOne({ _id: request._id });
      return res.status(429).json({ message: 'Too many incorrect attempts. Please restart the process.' });
    }
    if (!verifyOtp(otp, request.otpHash)) {
      request.attempts += 1;
      await request.save();
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Re-check uniqueness right before commit (guards against a race during the flow).
    const taken = await User.findOne({
      email: request.newEmail,
      _id: { $ne: req.user._id },
    });
    if (taken) {
      await EmailChangeRequest.deleteOne({ _id: request._id });
      return res.status(409).json({ message: 'That email address is now in use. Please restart.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      await EmailChangeRequest.deleteOne({ _id: request._id });
      return res.status(404).json({ message: 'User not found.' });
    }

    const previousEmail = user.email;
    user.email = request.newEmail;
    // Invalidate the temp token AND every existing session (forces re-auth).
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await EmailChangeRequest.deleteOne({ _id: request._id });

    // Best-effort heads-up to the old address (do not block on it).
    sendEmail({
      to: previousEmail,
      subject: 'Your account email address was changed',
      html: `<p>The email address on your Smart Garden account was changed to <strong>${user.email}</strong>. If this wasn't you, contact support immediately.</p>`,
    }).catch((e) => console.error('[EmailChange] notify old email failed:', e.message));

    // Issue a fresh session token so the client can refresh seamlessly.
    const token = signSessionToken(user._id, user.tokenVersion);
    return res.json({
      message: 'Email updated successfully. Your previous sessions were signed out.',
      email: user.email,
      token,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'That email address is already in use.' });
    }
    console.error('[EmailChange] verify-new error:', error.message);
    return res.status(500).json({ message: 'Could not update the email address.' });
  }
};

module.exports = { initiateEmailChange, verifyCurrentEmail, setNewEmail,
  verifyNewEmail,
  checkEmailAvailability,
};
