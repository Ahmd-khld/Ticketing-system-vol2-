const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');
const Risk = require('../models/Risk');
const jwt = require('jsonwebtoken');

jest.mock('../utils/grcService', () => ({
  triggerGRCUpdate: jest.fn(),
  setIO: jest.fn(),
  sanitizeAndSyncGRCData: jest.fn(data => data)
}));

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('GRC API', () => {
  let superAdminToken, superAdmin;

  beforeEach(async () => {
    superAdmin = await User.create({
      name: 'Super Admin',
      email: 'admin@smartpark.com',
      password: 'password123',
      role: 'admin',
      isVerified: true
    });
    superAdminToken = generateToken(superAdmin._id);
  });

  describe('GET /api/grc/whoami', () => {
    it('should identify super admin correctly', async () => {
      const res = await request(app)
        .get('/api/grc/whoami')
        .set('Authorization', `Bearer ${superAdminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.isAuthorized).toBe(true);
      expect(res.body.authenticatedUser).toBe('admin@smartpark.com');
    });
  });

  describe('PATCH /api/grc/risks/:id', () => {
    it('should update risk status', async () => {
      const res = await request(app)
        .patch('/api/grc/risks/RISK-123')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'Resolved' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toBe('Risk RISK-123 marked as Resolved');
      
      const risk = await Risk.findOne({ id: 'RISK-123' });
      expect(risk.status).toBe('Resolved');
      expect(risk.resolvedBy).toBe('admin@smartpark.com');
    });
  });

  describe('POST /api/grc/remediate', () => {
    it('should remediate by blocking a user', async () => {
      const targetUser = await User.create({
        name: 'Bad User',
        email: 'bad@test.com',
        password: 'password123',
        isRestricted: false
      });

      const res = await request(app)
        .post('/api/grc/remediate')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          action: 'block_user',
          params: { userId: targetUser._id.toString() },
          riskId: 'RISK-THREAT'
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toMatch(/has been restricted via GRC auto-remediation/);
      
      const updatedUser = await User.findById(targetUser._id);
      expect(updatedUser.isRestricted).toBe(true);
      expect(updatedUser.restrictionReason).toMatch(/RISK-THREAT/);
    });
  });
});
