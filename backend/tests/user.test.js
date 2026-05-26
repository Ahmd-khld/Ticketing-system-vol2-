const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');
const OTP = require('../models/OTP');
const jwt = require('jsonwebtoken');

// Mock email service
jest.mock('../utils/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ status: 'success' })
}));

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('User API', () => {
  let userToken, user;

  beforeEach(async () => {
    user = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      password: 'password123',
      isVerified: true,
      savedCards: [
        { last4Digits: '1234', encryptedData: 'some-data' }
      ]
    });
    userToken = generateToken(user._id);
  });

  describe('DELETE /api/users/profile/cards/:cardId', () => {
    it('should remove a saved card', async () => {
      const cardId = user.savedCards[0]._id;
      const res = await request(app)
        .delete(`/api/users/profile/cards/${cardId}`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.savedCards).toHaveLength(0);
      
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.savedCards).toHaveLength(0);
    });
  });

  describe('POST /api/users/forgot-password', () => {
    it('should send reset OTP successfully', async () => {
      const res = await request(app)
        .post('/api/users/forgot-password')
        .send({ email: 'user@test.com' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Password reset code sent to email');
      
      const otpRecord = await OTP.findOne({ email: 'user@test.com' });
      expect(otpRecord).toBeTruthy();
    });
  });

  describe('POST /api/users/reset-password', () => {
    it('should reset password successfully with correct OTP', async () => {
      await OTP.create({ email: 'user@test.com', otp: '123456' });

      const res = await request(app)
        .post('/api/users/reset-password')
        .send({
          email: 'user@test.com',
          otp: '123456',
          password: 'newpassword123'
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Password has been reset successfully');
      
      const updatedUser = await User.findById(user._id);
      const isMatch = await updatedUser.matchPassword('newpassword123');
      expect(isMatch).toBe(true);
    });
  });
});
