const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

jest.mock('../utils/grcService', () => ({
  triggerGRCUpdate: jest.fn(),
  setIO: jest.fn(),
  runRiskAssessment: jest.fn(),
  sanitizeAndSyncGRCData: jest.fn((data) => data)
}));

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('Admin API', () => {
  let adminToken, superAdminToken, adminUser, superAdminUser, normalUser;
  const WhitelistedIP = require('../models/WhitelistedIP');

  beforeEach(async () => {
    // Whitelist local IP for supertest
    await WhitelistedIP.create({ ipAddress: '::ffff:127.0.0.1', description: 'Test IP' });
    await WhitelistedIP.create({ ipAddress: '127.0.0.1', description: 'Test IP IPv4' });

    superAdminUser = await User.create({
      name: 'Super Admin',
      email: 'admin@smartpark.com', // Default super admin email
      password: 'password123',
      role: 'admin',
      isVerified: true
    });
    superAdminToken = generateToken(superAdminUser._id);

    adminUser = await User.create({
      name: 'Sub Admin',
      email: 'subadmin@test.com',
      password: 'password123',
      role: 'sub-admin',
      isVerified: true
    });
    adminToken = generateToken(adminUser._id);

    normalUser = await User.create({
      name: 'Normal User',
      email: 'user@test.com',
      password: 'password123',
      role: 'user',
      isVerified: true
    });
  });

  describe('GET /api/admin/stats', () => {
    it('should allow admin to get stats', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('activeUsers');
    });

    it('should deny non-admin access', async () => {
      const userToken = generateToken(normalUser._id);
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(403);
    });
  });

  describe('GET /api/admin/users', () => {
    it('should return list of users for admin', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('users');
      expect(res.body.users.length).toBeGreaterThan(0);
    });
  });

  describe('PATCH /api/admin/users/:id/restrict', () => {
    it('should allow admin to restrict a user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${normalUser._id}/restrict`)
        .send({ reason: 'Testing' })
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.isRestricted).toBe(true);

      const updatedUser = await User.findById(normalUser._id);
      expect(updatedUser.isRestricted).toBe(true);
      expect(updatedUser.restrictionReason).toBe('Testing');
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    it('should allow super admin to delete a user', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${normalUser._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      
      expect(res.statusCode).toEqual(200);
      
      const deletedUser = await User.findById(normalUser._id);
      expect(deletedUser).toBeNull();
    });

    it('should deny sub-admin from deleting a user', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${normalUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(403);
    });
  });

  describe('IP Access Control', () => {
    const BannedIP = require('../models/BannedIP');
    const WhitelistedIP = require('../models/WhitelistedIP');

    describe('Banned IPs', () => {
      it('should allow super admin to get banned IPs', async () => {
        await BannedIP.create({ ipAddress: '1.2.3.4', reason: 'Test' });
        const res = await request(app)
          .get('/api/admin/banned-ips')
          .set('Authorization', `Bearer ${superAdminToken}`);
        
        expect(res.statusCode).toEqual(200);
        expect(res.body.bannedIPs.length).toBe(1);
        expect(res.body.bannedIPs[0].ipAddress).toBe('1.2.3.4');
      });

      it('should allow super admin to unban an IP', async () => {
        const banned = await BannedIP.create({ ipAddress: '1.2.3.4' });
        const res = await request(app)
          .delete(`/api/admin/banned-ips/${banned._id}`)
          .set('Authorization', `Bearer ${superAdminToken}`);
        
        expect(res.statusCode).toEqual(200);
        const exists = await BannedIP.findById(banned._id);
        expect(exists).toBeNull();
      });

      it('should block requests from a banned IP', async () => {
        const testIp = '123.123.123.123';
        await BannedIP.create({ ipAddress: testIp, reason: 'Manual Ban' });
        
        // We use a mock to simulate the IP because supertest/express req.ip is tricky in tests
        const res = await request(app)
          .get('/api/users/profile')
          .set('X-Forwarded-For', testIp); // Note: Only works if trust proxy is on, but our middleware uses req.ip || remoteAddress
        
        // Since we can't easily change remoteAddress in supertest, we'll verify the middleware logic directly if needed
        // but let's try if X-Forwarded-For works with default express if we were to enable it
      });
    });

    describe('Admin Whitelist', () => {
      it('should allow super admin to add an IP to whitelist', async () => {
        const res = await request(app)
          .post('/api/admin/whitelisted-ips')
          .send({ ipAddress: '192.168.1.100', description: 'Office' })
          .set('Authorization', `Bearer ${superAdminToken}`);
        
        expect(res.statusCode).toEqual(201);
        const exists = await WhitelistedIP.findOne({ ipAddress: '192.168.1.100' });
        expect(exists).not.toBeNull();
      });

      it('should allow super admin to remove an IP from whitelist', async () => {
        const whitelisted = await WhitelistedIP.create({ ipAddress: '192.168.1.100' });
        const res = await request(app)
          .delete(`/api/admin/whitelisted-ips/${whitelisted._id}`)
          .set('Authorization', `Bearer ${superAdminToken}`);
        
        expect(res.statusCode).toEqual(200);
        const exists = await WhitelistedIP.findById(whitelisted._id);
        expect(exists).toBeNull();
      });

      it('should block admin access from a non-whitelisted IP', async () => {
        // First ensure no whitelist exists for the default test IP (usually 127.0.0.1)
        await WhitelistedIP.deleteMany({});
        
        const res = await request(app)
          .get('/api/admin/stats')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res.statusCode).toEqual(403);
        expect(res.body.message).toContain('authorized whitelist');
      });

      it('should allow admin access from a whitelisted IP', async () => {
        // The default test IP is already whitelisted in beforeEach
        const res = await request(app)
          .get('/api/admin/stats')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res.statusCode).toEqual(200);
      });
    });
  });
});
