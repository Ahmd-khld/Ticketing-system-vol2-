const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');
const PromoCode = require('../models/PromoCode');
const jwt = require('jsonwebtoken');

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('Promo API', () => {
  let userToken, user;

  beforeEach(async () => {
    user = await User.create({
      name: 'Test User',
      email: 'user@test.com',
      password: 'password123',
      isVerified: true
    });
    userToken = generateToken(user._id);
  });

  describe('POST /api/promo/validate', () => {
    it('should validate promo code successfully', async () => {
      await PromoCode.create({
        code: 'SAVE10',
        discount: 10,
        userId: user._id
      });

      const res = await request(app)
        .post('/api/promo/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'SAVE10' });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('discount', 10);
      expect(res.body).toHaveProperty('code', 'SAVE10');
    });

    it('should fail with invalid promo code', async () => {
      const res = await request(app)
        .post('/api/promo/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'INVALID' });
      
      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('message', 'Invalid or already used promo code');
    });

    it('should fail if promo code belongs to another user', async () => {
      const otherUser = await User.create({
        name: 'Other',
        email: 'other@test.com',
        password: 'password123'
      });
      
      await PromoCode.create({
        code: 'OTHER10',
        discount: 10,
        userId: otherUser._id
      });

      const res = await request(app)
        .post('/api/promo/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'OTHER10' });
      
      expect(res.statusCode).toEqual(404);
    });
  });
});
