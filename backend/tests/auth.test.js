const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

describe('Auth API', () => {
  describe('POST /api/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          age: 25
        });
      
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('message', 'Registration successful. Please verify your email with the code sent.');
      
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user).toBeTruthy();
      expect(user.name).toBe('Test User');
    });

    it('should fail to register with an existing email', async () => {
      await User.create({
        name: 'Existing User',
        email: 'test@example.com',
        password: 'password123'
      });

      const res = await request(app)
        .post('/api/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          age: 25
        });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'User already exists');
    });
  });

  describe('POST /api/verify-email', () => {
    it('should verify email successfully with correct OTP', async () => {
      const email = 'verify@example.com';
      await User.create({
        name: 'To Verify',
        email,
        password: 'password123',
        isVerified: false
      });
      
      // Need to create OTP record since we're bypassing the register logic
      const OTP = require('../models/OTP');
      await OTP.create({ email, otp: '123456' });

      const res = await request(app)
        .post('/api/verify-email')
        .send({ email, otp: '123456' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Email verified successfully');
      expect(res.body).toHaveProperty('isVerified', true);
      expect(res.body).toHaveProperty('token');

      const user = await User.findOne({ email });
      expect(user.isVerified).toBe(true);
    });

    it('should fail verification with incorrect OTP', async () => {
      const email = 'failverify@example.com';
      await User.create({
        name: 'To Verify Fail',
        email,
        password: 'password123',
        isVerified: false
      });
      
      const OTP = require('../models/OTP');
      await OTP.create({ email, otp: '123456' });

      const res = await request(app)
        .post('/api/verify-email')
        .send({ email, otp: 'wrong' });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toMatch(/Invalid or expired verification code/);
    });
  });

  describe('POST /api/login', () => {
    it('should login successfully with verified user', async () => {
      await User.create({
        name: 'Verified User',
        email: 'verified@example.com',
        password: 'password123',
        isVerified: true
      });

      const res = await request(app)
        .post('/api/login')
        .send({
          email: 'verified@example.com',
          password: 'password123'
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).toHaveProperty('email', 'verified@example.com');
    });

    it('should fail to login with unverified user and send new OTP', async () => {
      await User.create({
        name: 'Unverified User',
        email: 'unverified@example.com',
        password: 'password123',
        isVerified: false
      });

      const res = await request(app)
        .post('/api/login')
        .send({
          email: 'unverified@example.com',
          password: 'password123'
        });
      
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Email not verified. A new verification code has been sent to your email.');
    });

    it('should fail with incorrect password', async () => {
      await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        isVerified: true
      });

      const res = await request(app)
        .post('/api/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });
      
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Invalid credentials');
    });
  });
});
