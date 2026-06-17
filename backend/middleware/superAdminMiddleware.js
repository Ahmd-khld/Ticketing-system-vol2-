const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');
const grcService = require('../utils/grcService');

// Simple middleware to protect admin routes
const requireAdmin = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: Missing or invalid token' });
    }
    const secret = (process.env.JWT_SECRET || '').trim();

    if (!secret) {
      console.error('[AdminAuth] JWT_SECRET is not defined');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const decoded = jwt.verify(token, secret);
    const userId = decoded.id || decoded._id || decoded.userId;
    console.log(`DEBUG_AUTH: Decoded ID from token: ${userId}`);

    const user = await User.findById(userId);
    if (user) {
      console.log(`DEBUG_AUTH: Found user: ${user.email} | Role: ${user.role}`);
    } else {
      console.warn(`DEBUG_AUTH: No user found for ID: ${userId}`);
    }

    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase().trim();

    // Allow both 'admin' and 'sub-admin' roles to pass this check
    if (!user || (user.role !== 'admin' && user.role !== 'sub-admin' && user.email.toLowerCase().trim() !== superAdminEmail)) {
      console.warn(`DEBUG_AUTH: Denied access for ${user?.email || 'Unknown'}. Role was ${user?.role}`);
      return res.status(403).json({ 
        message: 'Forbidden: Admin access required',
        debug: {
          userEmail: user?.email,
          userRole: user?.role,
          requiredEmail: superAdminEmail
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('DEBUG_AUTH: JWT Verification Error:', error.message);
    return res.status(401).json({ message: `Unauthorized: ${error.message}` });
  }
};

// Middleware to protect super-admin exclusive routes
const requireSuperAdmin = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: Missing or invalid token' });
    }
    const secret = (process.env.JWT_SECRET || '').trim();

    if (!secret) {
      console.error('[SuperAdminAuth] JWT_SECRET is not defined');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const decoded = jwt.verify(token, secret);
    const userId = decoded.id || decoded._id || decoded.userId;
    const user = await User.findById(userId);

    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase().trim();
    if (!user || user.role !== 'admin' || user.email.toLowerCase().trim() !== superAdminEmail) {
      // If a legitimate sub-admin tries to access a super-admin route, log the attempt
      if (user && (user.role === 'admin' || user.role === 'sub-admin')) {
        try {
          const clientIp = req.ip || 'unknown-client';
          const log = await AdminAuditLog.create({
            email: user.email,
            ipAddress: clientIp,
            status: 'failed',
            statusCode: 403,
            action: 'Blocked: Unauthorized Super-Admin Route Access',
            userAgent: req.get('User-Agent') || 'Unknown',
          });
          const io = req.app.get('io');
          if (io) io.emit('auditLogUpdate', log);
          grcService.triggerGRCUpdate();
        } catch (err) {
          console.error('Audit Log Error:', err);
        }
      }
      return res.status(403).json({ message: 'Forbidden: Super-Admin access required' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('[SuperAdminAuth] JWT Verification Error:', error.message);
    return res.status(401).json({ message: `Unauthorized: ${error.message}` });
  }
};

module.exports = { requireAdmin, requireSuperAdmin };
