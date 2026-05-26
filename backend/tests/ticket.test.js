const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const jwt = require('jsonwebtoken');

jest.mock('../utils/grcService', () => ({
  triggerGRCUpdate: jest.fn(),
  setIO: jest.fn()
}));

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' })
  })
}));

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

describe('Ticket API', () => {
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

  describe('POST /api/tickets/checkout', () => {
    it('should create tickets successfully', async () => {
      const res = await request(app)
        .post('/api/tickets/checkout')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          quantities: {
            adult: 1
          },
          subscriptionPlan: 'one-time',
          selectedDate: new Date().toISOString().split('T')[0],
          paymentMethod: 'ONLINE'
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'Checkout successful. Your tickets are being generated and sent to your email.');
      expect(res.body.tickets).toHaveLength(1);
    });
  });

  describe('GET /api/tickets/history', () => {
    it('should return user ticket history', async () => {
      await Ticket.create({
        userId: user._id,
        ticketType: 'adult',
        subscriptionPlan: 'one-time',
        price: 200,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'ACTIVE'
      });

      const res = await request(app)
        .get('/api/tickets/history')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toHaveProperty('ticketType', 'adult');
    });
  });

  describe('PATCH /api/tickets/:id/cancel', () => {
    it('should cancel an active ticket', async () => {
      const ticket = await Ticket.create({
        userId: user._id,
        ticketType: 'adult',
        subscriptionPlan: 'one-time',
        price: 200,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: 'ACTIVE'
      });

      const res = await request(app)
        .patch(`/api/tickets/${ticket._id}/cancel`)
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toBe('Ticket cancelled successfully. Refund initiated.');

      const updatedTicket = await Ticket.findById(ticket._id);
      expect(updatedTicket.status).toBe('CANCELLED');
    });
  });
});
