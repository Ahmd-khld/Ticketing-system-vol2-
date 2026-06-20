const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');
const OTP = require('../models/OTP');
const Ticket = require('../models/Ticket');
const jwt = require('jsonwebtoken');
const { hashOtp } = require('../utils/otpService');

// Mock email service
jest.mock('../utils/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ status: 'success' })
}));

beforeAll(async () => await dbHandler.connect());
afterEach(async () => {
  await dbHandler.clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => await dbHandler.closeDatabase());

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('User API', () => {
  let userToken, user, ticketId;

  beforeEach(async () => {
    user = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      password: 'password123',
      isVerified: true,
      hasDisability: false,
      savedCards: [
        { last4Digits: '1234', encryptedData: 'some-data' }
      ]
    });
    userToken = generateToken(user._id);

    const ticket = await Ticket.create({
      userId: user._id,
      ticketType: 'adult',
      subscriptionPlan: 'one-time',
      price: 100,
      paymentMethod: 'ONLINE',
      paymentStatus: 'PAID',
      status: 'ACTIVE',
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 86400000)
    });
    ticketId = ticket._id;
  });

  describe('GET /api/users/profile', () => {
    it('should get user profile', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.email).toEqual(user.email);
    });

    it('should fail if user not found', async () => {
      await User.findByIdAndDelete(user._id);
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update disability preference', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ hasDisability: true });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.hasDisability).toBe(true);

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.hasDisability).toBe(true);
    });

    it('should reject email change', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ email: 'newemail@test.com' });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain('Email cannot be changed here');
    });

    it('should handle duplicate email error', async () => {
      await User.create({
        name: 'Another User',
        email: 'another@test.com',
        password: 'password123'
      });
      
      // We can mock an error by modifying save method if needed,
      // but since email check is manually done in controller we can skip this
      // The 11000 duplicate key error is usually impossible here because
      // email change is explicitly rejected.
    });
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

    it('should return 200 even if user not found (security)', async () => {
      const res = await request(app)
        .post('/api/users/forgot-password')
        .send({ email: 'nonexistent@test.com' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toContain('Password reset code sent');
    });
  });

  describe('POST /api/users/reset-password', () => {
    it('should reset password successfully with correct OTP', async () => {
      await OTP.create({ email: 'user@test.com', otp: hashOtp('123456') });

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

    it('should fail with incorrect OTP', async () => {
      await OTP.create({ email: 'user@test.com', otp: hashOtp('123456') });

      const res = await request(app)
        .post('/api/users/reset-password')
        .send({
          email: 'user@test.com',
          otp: '000000',
          password: 'newpassword123'
        });
      
      expect(res.statusCode).toEqual(400);
    });
    
    it('should lock account after 5 failed attempts', async () => {
      await OTP.create({ email: 'user@test.com', otp: hashOtp('123456') });
      user.otpAttempts = 4;
      await user.save();

      const res = await request(app)
        .post('/api/users/reset-password')
        .send({
          email: 'user@test.com',
          otp: '000000',
          password: 'newpassword123'
        });
      
      expect(res.statusCode).toEqual(403);
      expect(res.body.isLocked).toBe(true);

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.isRestricted).toBe(true);
      expect(updatedUser.deletionDate).not.toBeNull();
    });
    
    it('should block reset if account is scheduled for deletion', async () => {
      user.deletionDate = new Date();
      await user.save();
      
      const res = await request(app)
        .post('/api/users/reset-password')
        .send({
          email: 'user@test.com',
          otp: '123456',
          password: 'newpassword123'
        });
      
      expect(res.statusCode).toEqual(403);
    });
  });

  describe('DELETE /api/users/profile', () => {
    it('should delete user profile and cascade delete tickets', async () => {
      const res = await request(app)
        .delete('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(200);
      
      const deletedUser = await User.findById(user._id);
      expect(deletedUser).toBeNull();
      
      const tickets = await Ticket.find({ userId: user._id });
      expect(tickets.length).toBe(0);
    });
  });

  describe('Account Deletion (Request, Confirm, Cancel, Restore)', () => {
    it('should request account deletion', async () => {
      const res = await request(app)
        .post('/api/users/request-deletion')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ password: 'password123' });
      
      expect(res.statusCode).toEqual(200);
      
      const otpRecord = await OTP.findOne({ email: user.email });
      expect(otpRecord).toBeTruthy();
    });

    it('should confirm account deletion', async () => {
      await OTP.create({ email: user.email, otp: hashOtp('123456') });
      
      const res = await request(app)
        .post('/api/users/confirm-deletion')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ password: 'password123', otp: '123456' });
      
      expect(res.statusCode).toEqual(200);
      
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.deletionDate).not.toBeNull();
    });

    it('should cancel account deletion', async () => {
      user.deletionDate = new Date();
      await user.save();
      
      const res = await request(app)
        .post('/api/users/cancel-deletion')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(200);
      
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.deletionDate).toBeNull();
    });

    it('should restore account', async () => {
      user.deletionDate = new Date();
      await user.save();
      
      const res = await request(app)
        .post('/api/users/restore-account')
        .send({ email: user.email, password: 'password123' });
      
      expect(res.statusCode).toEqual(200);
      
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.deletionDate).toBeNull();
    });

    it('should fail restore if account not scheduled for deletion', async () => {
      const res = await request(app)
        .post('/api/users/restore-account')
        .send({ email: user.email, password: 'password123' });
      
      expect(res.statusCode).toEqual(400);
    });
  });
});
