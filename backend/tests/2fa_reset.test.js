const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../app');
const User = require('../models/User');
const OTP = require('../models/OTP');
const WhitelistedIP = require('../models/WhitelistedIP');
const { MongoMemoryServer } = require('mongodb-memory-server');

describe('2FA Logic Verification', () => {
  let adminToken;
  let adminId;
  let mongoServer;
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();

  beforeAll(async () => {
    // This suite manages its own in-memory server (it doesn't use tests/setup.js),
    // so it must also provide the JWT secret the auth middleware requires.
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    // Whitelist test IP to bypass IP restriction
    await WhitelistedIP.create({
      ipAddress: '::ffff:127.0.0.1',
      description: 'Test Environment',
      adminEmail: superAdminEmail
    });

    // Create Super Admin
    const superAdmin = await User.create({
      name: 'Super Admin',
      email: superAdminEmail,
      password: 'password123',
      role: 'admin',
      isVerified: true
    });

    // Login as Super Admin to get token
    const loginRes = await request(app)
      .post('/api/login')
      .send({
        email: superAdminEmail,
        password: 'password123'
      });
    adminToken = loginRes.body.token;

    // Create a Sub-Admin to test on
    const subAdmin = await User.create({
      name: 'Sub Admin',
      email: 'subadmin@example.com',
      password: 'password123',
      role: 'admin',
      isVerified: true,
      lastLogin: new Date()
    });
    adminId = subAdmin._id;
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  it('should mandate 2FA after force-logout-2fa is triggered', async () => {
    // 1. Trigger the force-logout-2fa as Super Admin
    const resetRes = await request(app)
      .patch(`/api/admin/users/${adminId}/force-logout-2fa`)
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(resetRes.statusCode).toEqual(200);
    expect(resetRes.body.message).toContain('Emergency reset successful');

    // 2. Attempt to login as the affected Sub-Admin
    const loginRes = await request(app)
      .post('/api/login')
      .send({
        email: 'subadmin@example.com',
        password: 'password123'
      });
    
    // Should return 200 with twoFactorRequired: true (not 200 with token)
    expect(loginRes.statusCode).toEqual(200);
    expect(loginRes.body).toHaveProperty('twoFactorRequired', true);
    expect(loginRes.body.message).toContain('2FA required');

    // 3. Verify OTP was generated
    const otpDoc = await OTP.findOne({ email: 'subadmin@example.com' });
    expect(otpDoc).not.toBeNull();
    expect(otpDoc.otp).toMatch(/^\d{6}$/);
  });

  it('should NOT mandate 2FA for Super Admin even if forced or inactive', async () => {
    // 1. Manually set force2FA and old lastLogin for superadmin
    await User.findOneAndUpdate(
      { email: superAdminEmail },
      { force2FA: true, lastLogin: new Date(0), twoFactorExpires: new Date(0) }
    );

    // 2. Attempt to login as Super Admin
    const loginRes = await request(app)
      .post('/api/login')
      .send({
        email: superAdminEmail,
        password: 'password123'
      });
    
    // Should return 200 with token, not 2FA requirement
    expect(loginRes.statusCode).toEqual(200);
    expect(loginRes.body).toHaveProperty('token');
    expect(loginRes.body).not.toHaveProperty('twoFactorRequired');
    expect(loginRes.body.email).toEqual(superAdminEmail);
  });
});
