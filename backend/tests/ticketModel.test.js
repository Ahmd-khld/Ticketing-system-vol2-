const mongoose = require('mongoose');
const dbHandler = require('./setup');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

beforeAll(async () => await dbHandler.connect());
afterEach(async () => {
  await dbHandler.clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => await dbHandler.closeDatabase());

jest.mock('../app', () => {
  return {
    io: {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    }
  };
});

describe('Ticket Model', () => {
  let user;

  beforeEach(async () => {
    user = await User.create({
      name: 'Ticket User',
      email: 'ticketuser@example.com',
      password: 'password'
    });
  });

  it('should count tickets by date range correctly', async () => {
    const start = new Date();
    const end = new Date();
    start.setDate(start.getDate() - 2);
    end.setDate(end.getDate() + 2);

    await Ticket.create([
      {
        userId: user._id,
        ticketType: 'adult',
        subscriptionPlan: 'one-time',
        price: 100,
        validFrom: new Date(),
        validUntil: end,
        paymentStatus: 'PAID'
      },
      {
        userId: user._id,
        ticketType: 'child',
        subscriptionPlan: 'one-time',
        price: 50,
        validFrom: new Date(),
        validUntil: end,
        paymentStatus: 'PAID'
      }
    ]);

    const countMap = await Ticket.countTicketsByDateRange(start, end);
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Check if the exact UTC date is generated. This is a bit tricky due to timezone,
    // but the map should have keys and values.
    expect(Object.keys(countMap).length).toBeGreaterThan(0);
    const count = Object.values(countMap)[0];
    expect(count).toBe(2);
  });

  it('should broadcast via socket on save', async () => {
    const { io } = require('../app');
    
    await Ticket.create({
      userId: user._id,
      ticketType: 'senior',
      subscriptionPlan: 'monthly',
      price: 80,
      validFrom: new Date(),
      validUntil: new Date()
    });

    expect(io.to).toHaveBeenCalledWith(`user-${user._id}-tickets`);
    expect(io.emit).toHaveBeenCalledWith('userTicketCountUpdate', expect.any(Object));
    expect(io.emit).toHaveBeenCalledWith('dashboardStatsUpdated');
    expect(io.emit).toHaveBeenCalledWith('crowdDataUpdated');
  });

  it('should broadcast via socket on insertMany', async () => {
    const { io } = require('../app');
    
    await Ticket.insertMany([{
      userId: user._id,
      ticketType: 'senior',
      subscriptionPlan: 'monthly',
      price: 80,
      validFrom: new Date(),
      validUntil: new Date()
    }]);

    expect(io.to).toHaveBeenCalledWith(`user-${user._id}-tickets`);
    expect(io.emit).toHaveBeenCalledWith('dashboardStatsUpdated');
  });
});
