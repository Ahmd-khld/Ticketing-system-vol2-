const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');
const Telemetry = require('../models/Telemetry');
const jwt = require('jsonwebtoken');

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('Telemetry API', () => {
  let adminToken, adminUser;

  beforeEach(async () => {
    adminUser = await User.create({
      name: 'Admin',
      email: 'admin@smartpark.com',
      password: 'password123',
      role: 'admin',
      isVerified: true
    });
    adminToken = generateToken(adminUser._id);
  });

  describe('POST /api/hardware/telemetry', () => {
    it('should receive and store telemetry data', async () => {
      const payload = {
        moisture: 500,
        humidity: 45.5,
        temperature: 24.2,
        rgbDistance: 20,
        servoDistance: 10.5,
        ldrStatus: 'ON',
        pumpStatus: 'OFF',
        servoStatus: 'CLOSED'
      };

      const res = await request(app)
        .post('/api/hardware/telemetry')
        .send(payload);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Telemetry received, verified and broadcasted.');
      
      const stored = await Telemetry.findOne();
      expect(stored).toBeTruthy();
      expect(stored.moisture).toBe(500);
    });

    it('should handle payload with signature', async () => {
      const jsonPart = JSON.stringify({
        moisture: 600,
        humidity: 40.0,
        temperature: 25.0,
        rgbDistance: 15,
        servoDistance: 5.0
      });
      const payload = `${jsonPart}|sig:1234567890abcdef`;

      const res = await request(app)
        .post('/api/hardware/telemetry')
        .set('Content-Type', 'text/plain')
        .send(payload);
      
      expect(res.statusCode).toEqual(200);
      
      const stored = await Telemetry.findOne({ moisture: 600 });
      expect(stored).toBeTruthy();
    });
  });

  describe('GET /api/telemetry/latest', () => {
    it('should return the latest telemetry data', async () => {
      await request(app)
        .post('/api/hardware/telemetry')
        .send({
          moisture: 700,
          humidity: 30.0,
          temperature: 20.0,
          rgbDistance: 10,
          servoDistance: 2.0
        });

      const res = await request(app)
        .get('/api/telemetry/latest')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('moisture', 700);
    });
  });

  describe('POST /api/telemetry/toggle-mock', () => {
    it('should toggle mock mode', async () => {
      const res = await request(app)
        .post('/api/telemetry/toggle-mock')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('mockMode', true);

      const res2 = await request(app)
        .post('/api/telemetry/toggle-mock')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res2.statusCode).toEqual(200);
      expect(res2.body).toHaveProperty('mockMode', false);
    });
  });
});
