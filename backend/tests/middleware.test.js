const { protect, admin } = require('../middleware/authMiddleware');
const { errorHandler } = require('../middleware/errorMiddleware');
const { requireSuperAdmin } = require('../middleware/superAdminMiddleware');
const { checkBannedIP, verifyAdminWhitelist } = require('../middleware/ipControl');
const User = require('../models/User');
const ErrorLog = require('../models/ErrorLog');
const WhitelistedIP = require('../models/WhitelistedIP');
const BannedIP = require('../models/BannedIP');
const jwt = require('jsonwebtoken');

jest.mock('../models/User');
jest.mock('../models/ErrorLog');
jest.mock('../models/WhitelistedIP');
jest.mock('../models/BannedIP');
jest.mock('jsonwebtoken');

describe('Middleware Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {}, ip: '127.0.0.1', originalUrl: '/', method: 'GET', body: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn(), statusCode: 200 };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('Auth Middleware - protect', () => {
    it('1. should return 401 if no authorization header', async () => {
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('2. should return 401 if authorization header lacks Bearer', async () => {
      req.headers.authorization = 'Basic asdf123';
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('3. should return 500 if JWT_SECRET is missing', async () => {
      req.headers.authorization = 'Bearer mytoken';
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      process.env.JWT_SECRET = originalSecret;
    });

    it('4. should return 401 if token is invalid/fails verification', async () => {
      req.headers.authorization = 'Bearer badtoken';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockImplementation(() => { throw new Error('jwt malformed'); });
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('5. should return 401 if valid token but user not found', async () => {
      req.headers.authorization = 'Bearer goodtoken';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'userId' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('6. should return 403 if user is restricted', async () => {
      req.headers.authorization = 'Bearer goodtoken';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'userId' });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ email: 'test@test.com', isRestricted: true, restrictionReason: 'Banned' }) });
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ isRestricted: true }));
    });

    it('7. should return 401 if token version mismatches', async () => {
      req.headers.authorization = 'Bearer goodtoken';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'userId', v: 1 });
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ email: 'test@test.com', tokenVersion: 2 }) });
      await protect(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Session expired. Please login again.' }));
    });

    it('8. should call next() if token and user are perfectly valid', async () => {
      req.headers.authorization = 'Bearer goodtoken';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'userId', v: 1 });
      const mockUser = { email: 'test@test.com', tokenVersion: 1 };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });
      await protect(req, res, next);
      expect(req.user).toBe(mockUser);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('Auth Middleware - admin', () => {
    it('9. should return 403 if user is not admin', () => {
      req.user = { role: 'user' };
      admin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('10. should call next if user is admin', () => {
      req.user = { role: 'admin' };
      admin(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('11. should call next if user is sub-admin', () => {
      req.user = { role: 'sub-admin' };
      admin(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Middleware - errorHandler', () => {
    it('12. should handle generic 500 errors', async () => {
      const err = new Error('Generic failure');
      res.statusCode = 200; // should be converted to 500
      await errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Generic failure' });
      expect(ErrorLog.create).toHaveBeenCalled();
    });

    it('13. should handle Mongoose duplicate key errors (11000)', async () => {
      const err = new Error('Dup');
      err.name = 'MongoServerError';
      err.code = 11000;
      err.keyValue = { email: 'dup@test.com' };
      await errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Duplicate field') }));
    });

    it('14. should convert unauthorized strings to 401 status', async () => {
      const err = new Error('token failed');
      await errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('15. should hide stack trace in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const err = new Error('Prod failure');
      await errorHandler(err, req, res, next);
      expect(ErrorLog.create).toHaveBeenCalledWith(expect.objectContaining({ stack: null }));
      process.env.NODE_ENV = originalEnv;
    });

    it('16. should fallback gracefully if ErrorLog.create fails', async () => {
      const err = new Error('Failure');
      ErrorLog.create.mockRejectedValue(new Error('DB Down'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await errorHandler(err, req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to log error to DB', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('SuperAdmin Middleware - requireSuperAdmin', () => {
    it('17. should block if user is missing or not admin role', async () => {
      req.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'userId' });
      User.findById.mockResolvedValue({ role: 'user', email: 'test@test.com' });
      await requireSuperAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('18. should call next if user is a valid super admin in env array', async () => {
      req.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'userId' });
      User.findById.mockResolvedValue({ role: 'admin', email: 'super@smartpark.com' });
      const originalAdmins = process.env.SUPER_ADMIN_EMAIL;
      process.env.SUPER_ADMIN_EMAIL = 'super@smartpark.com';
      await requireSuperAdmin(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      process.env.SUPER_ADMIN_EMAIL = originalAdmins;
    });
  });

  describe('IP Control Middleware - verifyAdminWhitelist', () => {
    it('19. should allow access if IP is whitelisted', async () => {
      req.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'userId' });
      User.findById.mockResolvedValue({ role: 'sub-admin', email: 'sub@test.com' });
      req.ip = '10.0.0.1';
      WhitelistedIP.findOne.mockResolvedValue({ ipAddress: '10.0.0.1' });
      await verifyAdminWhitelist(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('20. should block access if IP is not whitelisted', async () => {
      req.headers.authorization = 'Bearer token';
      process.env.JWT_SECRET = 'secret';
      jwt.verify.mockReturnValue({ id: 'userId' });
      User.findById.mockResolvedValue({ role: 'sub-admin', email: 'sub@test.com' });
      req.ip = '10.0.0.2';
      WhitelistedIP.findOne.mockResolvedValue(null);
      await verifyAdminWhitelist(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ isIpRestricted: true }));
    });
  });
});
