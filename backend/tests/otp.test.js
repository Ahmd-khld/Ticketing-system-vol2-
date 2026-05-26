const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const OTP = require('../models/OTP');

// Mock email service
jest.mock('../utils/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ status: 'success' })
}));

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

describe('OTP API', () => {
  describe('POST /api/otp/send-otp', () => {
    it('should send OTP successfully', async () => {
      const res = await request(app)
        .post('/api/otp/send-otp')
        .send({ email: 'test@example.com' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'OTP sent successfully');
      
      const otpRecord = await OTP.findOne({ email: 'test@example.com' });
      expect(otpRecord).toBeTruthy();
      expect(otpRecord.otp).toHaveLength(6);
    });
  });

  describe('POST /api/otp/verify-otp', () => {
    it('should verify OTP successfully', async () => {
      const email = 'verify@example.com';
      await OTP.create({ email, otp: '123456' });

      const res = await request(app)
        .post('/api/otp/verify-otp')
        .send({ email, otp: '123456' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      
      const otpRecord = await OTP.findOne({ email });
      expect(otpRecord).toBeNull();
    });

    it('should fail with incorrect OTP', async () => {
      const email = 'fail@example.com';
      await OTP.create({ email, otp: '123456' });

      const res = await request(app)
        .post('/api/otp/verify-otp')
        .send({ email, otp: 'wrong' });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Invalid or expired OTP');
    });
  });
});
