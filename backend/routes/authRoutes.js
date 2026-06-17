const express = require('express');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../utils/emailService');
const { issueOtp, consumeOtp } = require('../utils/otpService');
const { buildOtpEmail } = require('../utils/otpEmail');
const logger = require('../utils/logger');
const validateRequest = require('../middleware/validateRequest');
const { loginValidationSchema, registerValidationSchema } = require('../validators/schemas');
const { authLimiter } = require('../middleware/rateLimiters');
const { protect } = require('../middleware/authMiddleware');
const bcrypt = require('bcrypt');

const router = express.Router();

const generateToken = (id, tokenVersion = 0) => {
  const secret = (process.env.JWT_SECRET || '').trim();
  return jwt.sign({ id, v: tokenVersion }, secret, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/register
// @access  Public
router.post('/register', validateRequest(registerValidationSchema), async (req, res) => {
  try {
    const { name, email, phone, password, age, role, hasDisability } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      phone,
      password,
      age,
      hasDisability,
      role,
      isVerified: false, // Explicitly set to false until OTP verification
    });

    if (user) {
      // Generate and send OTP
      const otpCode = await issueOtp(email);

      const emailResult = await sendEmail({
        to: email,
        subject: 'Verify Your Email - Smart Garden',
        html: buildOtpEmail({
          otp: otpCode,
          heading: 'Welcome to Smart Garden!',
          greeting: `Hello ${name},`,
          intro: 'Thank you for registering. Please use the following code to verify your email address:',
        }),
      });

      if (emailResult.status !== 'success') {
        // Rollback user creation if email fails to send
        await User.findByIdAndDelete(user._id);
        return res.status(502).json({ message: 'Could not send verification email. Please verify email configuration.' });
      }

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        hasDisability: user.hasDisability,
        role: user.role,
        isVerified: user.isVerified,
        message: 'Registration successful. Please verify your email with the code sent.',
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Verify email using OTP
// @route   POST /api/verify-email
// @access  Public
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.deletionDate) {
      return res.status(403).json({
        message: 'Account is locked and scheduled for deletion due to too many failed attempts.',
        isLocked: true,
      });
    }

    const otpValid = await consumeOtp(email, otp);

    if (otpValid) {
      user.isVerified = true;
      user.lastLogin = new Date(); // Record initial login upon verification
      user.otpAttempts = 0;
      user.deletionDate = null;
      user.isRestricted = false;
      user.restrictionReason = '';
      await user.save();

      res.json({
        message: 'Email verified successfully',
        isVerified: true,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id, user.tokenVersion),
      });
    } else {
      user.otpAttempts = (user.otpAttempts || 0) + 1;

      if (user.otpAttempts >= 5) {
        user.isRestricted = true;
        user.restrictionReason =
          'Too many failed verification attempts. Account locked for 30 days and scheduled for deletion.';
        user.deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await user.save();

        return res.status(403).json({
          message:
            'Max attempts reached. Your account has been locked for 30 days and is scheduled for deletion.',
          isLocked: true,
        });
      }

      await user.save();
      const remaining = 5 - user.otpAttempts;
      res.status(400).json({
        message: `Invalid or expired verification code. ${remaining} attempts remaining.`,
        remainingAttempts: remaining,
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Auth user & get token
// @route   POST /api/login
// @access  Public
router.post('/login', authLimiter, validateRequest(loginValidationSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.isRestricted) {
      return res.status(403).json({
        message: user.restrictionReason || 'Your account has been restricted. Please contact support.',
        isRestricted: true,
        isLocked: !!user.deletionDate,
      });
    }

    if (user.deletionDate) {
      return res.status(403).json({
        message: 'This account is scheduled for deletion. You must restore it before logging in.',
        isDeletionScheduled: true,
        email: user.email
      });
    }

    if (await user.matchPassword(password)) {
      if (!user.isVerified) {
        // Generate and send NEW OTP on login attempt if not verified
        const otpCode = await issueOtp(user.email);

        const emailResult = await sendEmail({
          to: user.email,
          subject: 'Action Required: Verify Your Email - Smart Garden',
          html: buildOtpEmail({
            otp: otpCode,
            heading: 'Verify Your Email',
            greeting: `Hello ${user.name},`,
            intro: 'You attempted to login but your email is not yet verified. Please use the following code to complete your verification:',
          }),
        });

        if (emailResult.status !== 'success') {
          return res.status(502).json({ message: 'Could not send verification email. Please verify email configuration.' });
        }

        return res.status(401).json({
          message: 'Email not verified. A new verification code has been sent to your email.',
          isVerified: false,
        });
      }

      // Check for 10-day inactivity 2FA or Forced 2FA
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const isInactive = user.lastLogin && user.lastLogin < tenDaysAgo;
      const is2FAExpired = !user.twoFactorExpires || user.twoFactorExpires < new Date();
      const isForced2FA = user.force2FA;

      // Superadmin exemption for 2FA
      const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase().trim();
      const isSuperAdmin = user.email.toLowerCase().trim() === superAdminEmail;

      if (!isSuperAdmin && (isForced2FA || (isInactive && is2FAExpired))) {
        // Generate and send 2FA OTP
        const otpCode = await issueOtp(user.email);

        const emailResult = await sendEmail({
          to: user.email,
          subject: 'Security Code - Smart Garden 2FA',
          html: buildOtpEmail({
            otp: otpCode,
            heading: 'Security Check: 2FA Required',
            greeting: `Hello ${user.name},`,
            intro: `${isForced2FA ? 'Your account requires 2FA for every login.' : "It's been a while since your last login."} For your security, please use the following code to complete your login:`,
          }),
        });

        if (emailResult.status !== 'success') {
          return res.status(502).json({ message: 'Could not send 2FA email. Please verify email configuration.' });
        }

        // Reset attempts when a new 2FA is triggered to allow fresh start
        user.otpAttempts = 0;
        await user.save();

        return res.status(200).json({
          message: isForced2FA ? '2FA required' : '2FA required due to inactivity',
          twoFactorRequired: true,
          email: user.email,
          role: user.role,
        });
      }

      // Update last login
      user.lastLogin = new Date();
      user.otpAttempts = 0; // Reset on successful standard login
      await user.save();

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        requiresPasswordReset: user.requiresPasswordReset,
        token: generateToken(user._id, user.tokenVersion),
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// @desc    Verify 2FA using OTP
// @route   POST /api/verify-2fa
// @access  Public
router.post('/verify-2fa', async (req, res) => {
  try {
    const { email, otp, rememberMe } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isRestricted) {
      return res.status(403).json({ message: 'Account is restricted' });
    }

    const otpValid = await consumeOtp(email, otp);

    if (otpValid) {
      user.lastLogin = new Date();
      user.otpAttempts = 0; // Reset attempts on success
      if (rememberMe) {
        // Remember for another 10 days
        user.twoFactorExpires = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      } else {
        user.twoFactorExpires = null;
      }
      await user.save();

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        requiresPasswordReset: user.requiresPasswordReset,
        token: generateToken(user._id, user.tokenVersion),
      });
    } else {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      
      if (user.otpAttempts >= 5) {
        // Phase 1: Automated Detection
        const Risk = require('../models/Risk');
        const riskId = `RISK-2FA-${Date.now()}`;
        
        await Risk.create({
          id: riskId,
          category: 'BRUTE_FORCE',
          description: `Account [${user.email}] exceeded 5 consecutive 2FA failures. Manual security review required.`,
          asset: `User Account: ${user._id}`,
          likelihood: 5,
          impact: 5,
          status: 'Open',
          recommendations: [{
            title: 'Execute Resolve',
            body: 'Restrict account, force password reset, and terminate all active sessions.',
            priority: 'High',
            action: 'RESOLVE_BRUTE_FORCE',
            params: { userId: user._id.toString() }
          }]
        });

        await user.save();
        return res.status(403).json({ 
          message: 'Security threshold exceeded. Your account has been flagged for administrative review. Please contact support.',
          isFlagged: true 
        });
      }

      await user.save();
      const remaining = 5 - user.otpAttempts;
      res.status(400).json({ 
        message: `Invalid or expired 2FA code. ${remaining} attempts remaining before account restriction.`,
        remainingAttempts: remaining
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update password mandatorily
// @route   POST /api/auth/mandatory-password-update
// @access  Private
router.post('/mandatory-password-update', protect, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.requiresPasswordReset) {
      return res.status(400).json({ message: 'Password reset is not mandatory for this account.' });
    }

    if (await user.matchPassword(password)) {
      return res.status(400).json({ message: 'New password cannot be the same as your current password.' });
    }

    // Password Policy Regex Validation (Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special)
    const policyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
    if (!policyRegex.test(password)) {
      return res.status(400).json({ message: 'Password does not meet the required security policy.' });
    }

    // Update password and clear restriction flags
    user.password = password; // Hashing is handled by pre-save middleware in User model
    user.requiresPasswordReset = false;
    user.isRestricted = false;
    user.restrictionReason = '';
    
    // Increment tokenVersion to invalidate old tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    
    await user.save();

    // Return fresh authorized JWT
    res.status(200).json({
      message: 'Password updated successfully. Access restored.',
      token: generateToken(user._id, user.tokenVersion)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
