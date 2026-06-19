const express = require('express');
const User = require('../models/User');
const OTP = require('../models/OTP');
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
router.post('/register', validateRequest(registerValidationSchema), async (req, res, next) => {
  try {
    const { name, email, phone, password, age, role, hasDisability } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
      return res.status(400).json({ message: 'This mobile number is already registered to another account. Please use a different number or log in.' });
    }

    const pendingOtpPhone = await OTP.findOne({ 'registrationData.phone': phone });
    if (pendingOtpPhone) {
      return res.status(400).json({ message: 'This mobile number is currently pending email verification. Please check your email or try again later.' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const pendingData = {
      name,
      email,
      phone,
      password: hashedPassword,
      age,
      hasDisability,
      role,
      isVerified: false,
    };

    // Generate and send OTP, storing pending data
    const otpCode = await issueOtp(email, pendingData);

    sendEmail({
      to: email,
      subject: 'Verify Your Email - Smart Garden',
      html: buildOtpEmail({
        otp: otpCode,
        heading: 'Welcome to Smart Garden!',
        greeting: `Hello ${name},`,
        intro: 'Thank you for registering. Please use the following code to verify your email address:',
      }),
    }).catch(err => console.error('Background email failed:', err.message));

    res.status(201).json({
      name,
      email,
      phone,
      hasDisability,
      role,
      isVerified: false,
      message: 'Registration started. Please verify your email with the code sent.',
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Verify email using OTP
// @route   POST /api/verify-email
// @access  Public
router.post('/verify-email', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const otpRecord = await consumeOtp(email, otp);
    if (!otpRecord) {
      return res.status(400).json({ message: `Invalid or expired verification code.` });
    }

    // New Flow: Data exists in OTP record
    if (otpRecord.registrationData) {
      const regData = otpRecord.registrationData;
      const user = await User.create({
        name: regData.name,
        email: regData.email,
        phone: regData.phone,
        password: regData.password, // already hashed in /register
        age: regData.age,
        hasDisability: regData.hasDisability,
        role: regData.role,
        isVerified: true,
        lastLogin: new Date(),
        otpAttempts: 0,
        deletionDate: null,
        isRestricted: false,
        restrictionReason: '',
      });

      return res.json({
        message: 'Email verified successfully',
        isVerified: true,
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id, user.tokenVersion || 0),
      });
    }

    // Legacy Flow: User is already in DB but unverified
    const legacyUser = await User.findOne({ email });
    if (legacyUser && !legacyUser.isVerified) {
      legacyUser.isVerified = true;
      legacyUser.lastLogin = new Date();
      legacyUser.otpAttempts = 0;
      legacyUser.deletionDate = null;
      legacyUser.isRestricted = false;
      legacyUser.restrictionReason = '';
      await legacyUser.save();

      return res.json({
        message: 'Email verified successfully',
        isVerified: true,
        _id: legacyUser._id,
        name: legacyUser.name,
        email: legacyUser.email,
        role: legacyUser.role,
        token: generateToken(legacyUser._id, legacyUser.tokenVersion || 0),
      });
    }

    return res.status(400).json({ message: 'Invalid verification request.' });
  } catch (error) {
    next(error);
  }
});

// @desc    Auth user & get token
// @route   POST /api/login
// @access  Public
router.post('/login', authLimiter, validateRequest(loginValidationSchema), async (req, res, next) => {
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

        sendEmail({
          to: user.email,
          subject: 'Action Required: Verify Your Email - Smart Garden',
          html: buildOtpEmail({
            otp: otpCode,
            heading: 'Verify Your Email',
            greeting: `Hello ${user.name},`,
            intro: 'You attempted to login but your email is not yet verified. Please use the following code to complete your verification:',
          }),
        }).catch(err => console.error('Background email failed:', err.message));

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

        sendEmail({
          to: user.email,
          subject: 'Security Code - Smart Garden 2FA',
          html: buildOtpEmail({
            otp: otpCode,
            heading: 'Security Check: 2FA Required',
            greeting: `Hello ${user.name},`,
            intro: `${isForced2FA ? 'Your account requires 2FA for every login.' : "It's been a while since your last login."} For your security, please use the following code to complete your login:`,
          }),
        }).catch(err => console.error('Background email failed:', err.message));

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
    next(error);
  }
});

// @desc    Verify 2FA using OTP
// @route   POST /api/verify-2fa
// @access  Public
router.post('/verify-2fa', async (req, res, next) => {
  try {
    const { email, otp, rememberMe } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email: email });
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
    next(error);
  }
});

// @desc    Update password mandatorily
// @route   POST /api/auth/mandatory-password-update
// @access  Private
router.post('/mandatory-password-update', protect, async (req, res, next) => {
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
    next(error);
  }
});

module.exports = router;
