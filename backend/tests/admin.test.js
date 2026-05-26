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

  beforeEach(async () => {
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
});
