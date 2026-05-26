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

describe('Game API', () => {
  let userToken, user;

  beforeEach(async () => {
    user = await User.create({
      name: 'Gamer User',
      email: 'gamer@test.com',
      password: 'password123',
      isVerified: true
    });
    userToken = generateToken(user._id);
  });

  describe('GET /api/game/status', () => {
    it('should return 0 trials used for new user', async () => {
      const res = await request(app)
        .get('/api/game/status')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('trialsUsed', 0);
      expect(res.body).toHaveProperty('canPlay', true);
    });
  });

  describe('POST /api/game/win', () => {
    it('should record trial and return promo code on win', async () => {
      const res = await request(app)
        .post('/api/game/win')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ score: 100 });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('trialsUsed', 1);
      
      const promo = await PromoCode.findOne({ userId: user._id });
      expect(promo).toBeTruthy();
      expect(promo.code).toMatch(/^SMART-/);
    });

    it('should prevent playing after 3 trials', async () => {
      user.gameStats.trialsUsed = 3;
      await user.save();

      const res = await request(app)
        .post('/api/game/win')
        .set('Authorization', `Bearer ${userToken}`);
      
      if (res.statusCode !== 400) console.log('DEBUG: res.body', res.body);
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'No trials left for this month');
    });
  });

  describe('POST /api/game/lose', () => {
    it('should record trial on lose', async () => {
      const res = await request(app)
        .post('/api/game/lose')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ score: 50 });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('trialsUsed', 1);
      
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.gameStats.trialsUsed).toBe(1);
    });
  });
});
