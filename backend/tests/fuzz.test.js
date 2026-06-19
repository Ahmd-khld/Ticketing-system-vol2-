const request = require('supertest');
const fc = require('fast-check');
const { app } = require('../app');
const setup = require('./setup');

beforeAll(async () => {
  await setup.connect();
});

afterAll(async () => {
  await setup.closeDatabase();
});

describe('Fuzzing Authentication Endpoints', () => {
  jest.setTimeout(60000);

  it('should never crash on malformed or extreme inputs to /api/register', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
          email: fc.oneof(fc.emailAddress(), fc.string(), fc.constant(undefined)),
          phone: fc.oneof(fc.string(), fc.integer()),
          password: fc.oneof(fc.string(), fc.constant(null)),
          role: fc.oneof(fc.constant('user'), fc.constant('admin'), fc.string())
        }),
        async (payload) => {
          const res = await request(app)
            .post('/api/register')
            .send(payload);

          expect(res.status).not.toBe(500);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should never crash on malformed inputs to /api/login', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.oneof(fc.string(), fc.constant(null), fc.integer()),
          password: fc.oneof(fc.string(), fc.constant(null))
        }),
        async (payload) => {
          const res = await request(app)
            .post('/api/login')
            .send(payload);

          expect(res.status).not.toBe(500);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should never crash on malformed inputs to /api/verify-email', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          email: fc.oneof(fc.string(), fc.constant(null), fc.integer()),
          otp: fc.oneof(fc.string(), fc.constant(null), fc.integer())
        }),
        async (payload) => {
          const res = await request(app)
            .post('/api/verify-email')
            .send(payload);

          expect(res.status).not.toBe(500);
        }
      ),
      { numRuns: 50 }
    );
  });
});
