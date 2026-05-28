const BannedIP = require('../models/BannedIP');
const WhitelistedIP = require('../models/WhitelistedIP');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

/**
 * Middleware to check if the inbound IP address is banned.
 * If banned, the request is terminated immediately with 403.
 */
const checkBannedIP = async (req, res, next) => {
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    const isBanned = await BannedIP.findOne({ ipAddress: clientIp });

    if (isBanned) {
      console.warn(`[Security] Blocked request from banned IP: ${clientIp} | Reason: ${isBanned.reason}`);
      return res.status(403).json({
        message: 'Your IP address has been banned due to security policy violations.',
        reason: isBanned.reason,
        isBanned: true
      });
    }
    next();
  } catch (err) {
    console.error('[Security] IP Check Error:', err);
    next(); // Fail-safe: allow request if check fails
  }
};

/**
 * Middleware to verify if an admin's IP is whitelisted.
 * Required for sensitive admin/super-admin operations.
 */
const verifyAdminWhitelist = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Not an authenticated request, skip whitelist check
    }

    const token = authHeader.split(' ')[1];
    const secret = (process.env.JWT_SECRET || '').trim();
    if (!secret) return next();

    const decoded = jwt.verify(token, secret);
    const userId = decoded.id || decoded._id || decoded.userId;
    const user = await User.findById(userId);

    if (!user || (user.role !== 'admin' && user.role !== 'sub-admin')) {
      return next(); // Not an admin, skip whitelist check
    }

    const clientIp = req.ip || req.connection.remoteAddress;
    const isWhitelisted = await WhitelistedIP.findOne({ ipAddress: clientIp });

    if (!isWhitelisted) {
      console.warn(`[Security] Admin access denied for ${user.email} from non-whitelisted IP: ${clientIp}`);
      return res.status(403).json({
        message: 'Administrative access restricted. Your current IP address is not in the authorized whitelist.',
        isIpRestricted: true
      });
    }

    next();
  } catch (err) {
    console.error('[Security] Whitelist Check Error:', err.message);
    next();
  }
};

module.exports = {
  checkBannedIP,
  verifyAdminWhitelist
};
