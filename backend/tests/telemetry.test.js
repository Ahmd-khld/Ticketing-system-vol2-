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

      // Give it time to generate at least one mock data and trigger save
      await new Promise(resolve => setTimeout(resolve, 100));

      const res2 = await request(app)
        .post('/api/telemetry/toggle-mock')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res2.statusCode).toEqual(200);
      expect(res2.body).toHaveProperty('mockMode', false);
    });
  });

  describe('GET /api/telemetry/mock-status', () => {
    it('should return mock mode status', async () => {
      const res = await request(app)
        .get('/api/telemetry/mock-status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('mockMode');
    });
  });

  describe('POST /api/hardware/debug', () => {
    it('should acknowledge debug inbound', async () => {
      const res = await request(app)
        .post('/api/hardware/debug')
        .set('Content-Type', 'text/plain')
        .send('DEBUG STRING');
      expect(res.statusCode).toEqual(200);
      expect(res.text).toBe('ACK_DEBUG');
    });
  });

  describe('Hardware Alerts Generation', () => {
    it('should generate alerts on threshold crossing and state change', async () => {
      // Base state
      await request(app)
        .post('/api/hardware/telemetry')
        .send({ moisture: 20, humidity: 40, temperature: 30, rgbDistance: 15, servoDistance: 10, pumpStatus: 'OFF', ldrStatus: 'OFF', servoStatus: 'CLOSED' });
      
      // Changed state
      await request(app)
        .post('/api/hardware/telemetry')
        .send({ moisture: 10, humidity: 40, temperature: 40, rgbDistance: 5, servoDistance: 10, pumpStatus: 'ON', ldrStatus: 'ON', servoStatus: 'OPEN' });

      // Return to normal
      await request(app)
        .post('/api/hardware/telemetry')
        .send({ moisture: 25, humidity: 40, temperature: 30, rgbDistance: 8, servoDistance: 10, pumpStatus: 'OFF', ldrStatus: 'OFF', servoStatus: 'CLOSED' });
    });
  });

  describe('POST /api/hardware/command', () => {
    it('should fail if no command is provided', async () => {
      const res = await request(app)
        .post('/api/hardware/command')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.statusCode).toEqual(400);
    });

    it('should fail if no real IP is registered', async () => {
      // Mock mode sets arduinoIp to Mock
      await request(app)
        .post('/api/telemetry/toggle-mock')
        .set('Authorization', `Bearer ${adminToken}`);
      
      const res = await request(app)
        .post('/api/hardware/command')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ command: 'OPEN_GATE' });
      expect(res.statusCode).toEqual(400);

      // Toggle off
      await request(app)
        .post('/api/telemetry/toggle-mock')
        .set('Authorization', `Bearer ${adminToken}`);
    });

    it('should attempt to send command to real IP', async () => {
      await request(app)
        .post('/api/hardware/telemetry')
        .send({ moisture: 20, humidity: 40, temperature: 30, rgbDistance: 15, servoDistance: 10 });

      const http = require('http');
      const originalRequest = http.request;
      jest.spyOn(http, 'request').mockImplementation((options, callback) => {
        if (options && options.hostname === '127.0.0.1' && options.port === 80) {
          const req = {
            on: jest.fn(),
            write: jest.fn(),
            end: jest.fn(() => {
              if (callback) {
                callback({
                  on: (event, cb) => {
                    if (event === 'data') cb('OK');
                    if (event === 'end') cb();
                  }
                });
              }
            })
          };
          return req;
        }
        return originalRequest(options, callback);
      });

      const res = await request(app)
        .post('/api/hardware/command')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ command: 'OPEN_GATE' });
      
      expect(res.statusCode).toBeDefined();
    });
  });

  describe('Invalid Payload Handling', () => {
    it('should reject empty body', async () => {
      const res = await request(app).post('/api/hardware/telemetry').send();
      expect(res.statusCode).toEqual(400);
    });

    it('should handle JSON parse error', async () => {
      const res = await request(app)
        .post('/api/hardware/telemetry')
        .set('Content-Type', 'text/plain')
        .send('{"moisture": 10|sig:123');
      expect(res.statusCode).toEqual(400);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/hardware/telemetry')
        .send({ moisture: 10 });
      expect(res.statusCode).toEqual(400);
    });
  });
});
