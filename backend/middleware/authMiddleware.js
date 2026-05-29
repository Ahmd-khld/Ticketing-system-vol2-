const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to protect routes, checking for a valid session via JWT
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[Auth] Missing or malformed Authorization header');
      res.status(401);
      return next(new Error('Not authorized, missing or invalid token'));
    }

    const token = authHeader.split(' ')[1];
    const secret = (process.env.JWT_SECRET || '').trim();
    
    if (!secret) {
      console.error('[Auth] JWT_SECRET is not defined in environment');
      res.status(500);
      return next(new Error('Server configuration error'));
    }

    const decoded = jwt.verify(token, secret);
    const userId = decoded.id || decoded._id || decoded.userId;
    const tokenVersion = decoded.v;

    const user = await User.findById(userId).select('-password');

    if (user) {
      // Check if token has been invalidated via tokenVersion
      if (typeof tokenVersion !== 'undefined' && user.tokenVersion !== tokenVersion) {
        console.warn(`[Auth] Token invalidated for user: ${user.email} (Version mismatch)`);
        return res.status(401).json({ message: 'Session expired. Please login again.' });
      }

      if (user.isRestricted) {
        console.warn(`[Auth] Access denied for restricted user: ${user.email}`);
        return res.status(403).json({
          message: user.restrictionReason || 'Your account has been restricted. Please contact support.',
          isRestricted: true,
        });
      }
      req.user = user;
      next();
    } else {
      console.warn(`[Auth] User not found for ID: ${userId}`);
      res.status(401);
      return next(new Error('Not authorized, user not found'));
    }
  } catch (error) {
    console.error('[Auth] Token Verification Failed:', error.message);
    res.status(401);
    return next(new Error(`Not authorized, token failed: ${error.message}`));
  }
};

// Middleware to check for admin or sub-admin role
const admin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'sub-admin')) {
    next();
  } else {
    res.status(403).send('Not authorized as an admin');
  }
};

module.exports = { protect, admin };
