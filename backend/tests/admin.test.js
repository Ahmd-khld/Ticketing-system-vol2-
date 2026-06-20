const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const User = require('../models/User');
const Ticket = require('../models/Ticket');
const HardwareAlert = require('../models/HardwareAlert');
const AdminAuditLog = require('../models/AdminAuditLog');
const BannedIP = require('../models/BannedIP');
const WhitelistedIP = require('../models/WhitelistedIP');
const Risk = require('../models/Risk');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');

jest.mock('../utils/grcService', () => ({
  triggerGRCUpdate: jest.fn(),
  setIO: jest.fn(),
  runRiskAssessment: jest.fn(),
  sanitizeAndSyncGRCData: jest.fn((data) => data)
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

describe('Admin API', () => {
  let adminToken, superAdminToken, adminUser, superAdminUser, normalUser, ticketId;

  beforeEach(async () => {
    await WhitelistedIP.create({ ipAddress: '::ffff:127.0.0.1', description: 'Test IP' });
    await WhitelistedIP.create({ ipAddress: '127.0.0.1', description: 'Test IP IPv4' });

    superAdminUser = await User.create({
      name: 'Super Admin',
      email: 'admin@smartpark.com', // Default super admin email
      password: 'password123',
      role: 'admin',
      isVerified: true
    });
    superAdminToken = generateToken(superAdminUser._id);

    adminUser = await User.create({
      name: 'Sub Admin',
      email: 'subadmin@test.com',
      password: 'password123',
      role: 'sub-admin',
      isVerified: true
    });
    adminToken = generateToken(adminUser._id);

    normalUser = await User.create({
      name: 'Normal User',
      email: 'user@test.com',
      password: 'password123',
      role: 'user',
      isVerified: true
    });

    const ticket = await Ticket.create({
      userId: normalUser._id,
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

  describe('GET /api/admin/stats', () => {
    it('should allow admin to get stats', async () => {
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('activeUsers');
    });

    it('should deny non-admin access', async () => {
      const userToken = generateToken(normalUser._id);
      const res = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${userToken}`);
      
      expect(res.statusCode).toEqual(403);
    });
  });

  describe('GET /api/admin/users', () => {
    it('should return list of users for admin', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('users');
      expect(res.body.users.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/admin/admins', () => {
    it('should return list of admins for super admin', async () => {
      const res = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
    });

    it('should return only own profile for sub admin', async () => {
      const res = await request(app)
        .get('/api/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.users.length).toBe(1);
      expect(res.body.users[0].email).toBe('subadmin@test.com');
    });
  });

  describe('POST /api/admin/scan-ticket', () => {
    it('should scan a valid ticket', async () => {
      const res = await request(app)
        .post('/api/admin/scan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ticketId: ticketId.toString() });
      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toContain('Access granted');

      const updatedTicket = await Ticket.findById(ticketId);
      expect(updatedTicket.status).toBe('USED');
    });

    it('should fail for invalid ticket', async () => {
      const res = await request(app)
        .post('/api/admin/scan-ticket')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ticketId: new mongoose.Types.ObjectId().toString() });
      expect(res.statusCode).toEqual(404);
    });
    
    it('should handle JSON QR ticket', async () => {
      const res = await request(app)
        .post('/api/admin/scan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ticketId: JSON.stringify({ ticketId: ticketId.toString() }) });
      expect(res.statusCode).toEqual(200);
    });

    it('should handle cash ticket scan', async () => {
      const cashTicket = await Ticket.create({
        userId: normalUser._id,
        ticketType: 'adult',
        subscriptionPlan: 'one-time',
        price: 100,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        status: 'INACTIVE',
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400000)
      });
      const res = await request(app)
        .post('/api/admin/scan')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ticketId: cashTicket._id.toString() });
      expect(res.statusCode).toEqual(200);
      expect(res.body.actionRequired).toBe('COLLECT_CASH');
    });
  });

  describe('GET /api/admin/users/:userId/tickets', () => {
    it('should get tickets for user', async () => {
      const res = await request(app)
        .get(`/api/admin/users/${normalUser._id}/tickets`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.tickets.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/admin/users/:userId/tickets/:ticketId/scan', () => {
    it('should scan specific user ticket', async () => {
      const res = await request(app)
        .post(`/api/admin/users/${normalUser._id}/tickets/${ticketId}/scan`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
      const updated = await Ticket.findById(ticketId);
      expect(updated.status).toBe('USED');
    });
  });

  describe('PATCH /api/admin/users/:id/restrict', () => {
    it('should allow admin to restrict a user', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${normalUser._id}/restrict`)
        .send({ reason: 'Testing' })
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.isRestricted).toBe(true);

      const updatedUser = await User.findById(normalUser._id);
      expect(updatedUser.isRestricted).toBe(true);
      expect(updatedUser.restrictionReason).toBe('Testing');
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    it('should allow super admin to delete a user', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${normalUser._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      
      expect(res.statusCode).toEqual(200);
      
      const deletedUser = await User.findById(normalUser._id);
      expect(deletedUser).toBeNull();
    });

    it('should deny sub-admin from deleting a user', async () => {
      const res = await request(app)
        .delete(`/api/admin/users/${normalUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(403);
    });
  });

  describe('POST /api/admin/sub-admin', () => {
    it('should allow super admin to create a sub-admin', async () => {
      const res = await request(app)
        .post('/api/admin/sub-admin')
        .send({
          name: 'New Sub',
          email: 'newsub@test.com',
          password: 'password123',
          ipAddress: '192.168.1.50'
        })
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(201);
      const newAdmin = await User.findOne({ email: 'newsub@test.com' });
      expect(newAdmin).not.toBeNull();
    });
  });

  describe('POST /api/admin/users/:id/force-logout', () => {
    it('should force logout an admin', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${adminUser._id}/force-logout-2fa`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });
  });

  describe('Risks (resolveRisk, resolveInsiderThreat)', () => {
    it('should resolve a brute force risk', async () => {
      const risk = await Risk.create({
        id: 'RISK-BRUTE-1',
        category: 'BRUTE FORCE',
        description: 'Test',
        status: 'Open',
        source: 'System',
        impact: 5,
        likelihood: 5,
        ipAddress: '127.0.0.1',
        recommendations: [{ action: 'RESOLVE_BRUTE_FORCE', params: { userId: normalUser._id } }]
      });
      const res = await request(app)
        .post(`/api/admin/risk-register/resolve/${risk.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });

    it('should resolve an insider threat risk', async () => {
      const risk = await Risk.create({
        id: 'RISK-INSIDER-1',
        category: 'INSIDER THREAT',
        description: `Admin [${adminUser.email}] has restricted users.`,
        status: 'Open',
        source: 'System',
        impact: 5,
        likelihood: 5,
        ipAddress: '127.0.0.1'
      });
      const res = await request(app)
        .post(`/api/admin/risk-register/resolve-insider/${risk.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
      const updatedAdmin = await User.findById(adminUser._id);
      expect(updatedAdmin.isRestricted).toBe(true);
    });
  });

  describe('Hardware and Alerts', () => {
    beforeEach(async () => {
      await HardwareAlert.create({ message: 'Test alert', type: 'error', sensor: 'LDR', timeString: new Date().toISOString() });
    });

    it('should get hardware alerts', async () => {
      const res = await request(app)
        .get('/api/admin/hardware-alerts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.alerts.length).toBeGreaterThan(0);
    });

    it('should get hardware stats', async () => {
      const res = await request(app)
        .get('/api/admin/hardware-stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
    });

    it('should get alerts by sensor', async () => {
      const res = await request(app)
        .get('/api/admin/hardware-alerts/LDR')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should clear hardware alerts', async () => {
      const res = await request(app)
        .delete('/api/admin/hardware-alerts')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });
  });

  describe('Audit Logs', () => {
    beforeEach(async () => {
      await AdminAuditLog.create({ email: 'test@admin.com', action: 'Tested', status: 'success', ipAddress: '127.0.0.1' });
    });

    it('should get audit logs', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });

    it('should clear audit logs', async () => {
      const res = await request(app)
        .delete('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });
  });

  describe('Miscellaneous Admin Functions', () => {
    it('should fetch monthly sales', async () => {
      const res = await request(app)
        .get('/api/admin/monthly-sales')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
    });

    it('should reset occupancy', async () => {
      const res = await request(app)
        .post('/api/admin/reset-occupancy')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });

    it('should unlock scanner', async () => {
      const res = await request(app)
        .post('/api/admin/unlock-scanner')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
    });
    
    it('should generate mock data', async () => {
      const res = await request(app)
        .post('/api/admin/generate-mock-data')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });
  });

  describe('Cash Tickets', () => {
    let cashTicket;
    beforeEach(async () => {
      cashTicket = await Ticket.create({
        userId: normalUser._id,
        ticketType: 'adult',
        subscriptionPlan: 'one-time',
        price: 100,
        paymentMethod: 'CASH',
        paymentStatus: 'PENDING',
        status: 'INACTIVE',
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400000)
      });
    });

    it('should activate a cash ticket', async () => {
      const res = await request(app)
        .put(`/api/admin/activate-cash-ticket/${cashTicket._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
    });

    it('should get pending cash tickets', async () => {
      const res = await request(app)
        .get('/api/admin/pending-cash-tickets')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
    });
  });

  describe('Backups', () => {
    it('should create backup', async () => {
      jest.spyOn(child_process, 'spawn').mockReturnValueOnce({
        on: jest.fn((event, cb) => {
          if (event === 'close') cb(0);
        }),
        stderr: { on: jest.fn() }
      });
      const res = await request(app)
        .post('/api/admin/backup')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });

    it('should get backups', async () => {
      const res = await request(app)
        .get('/api/admin/backups')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toEqual(200);
    });

    it('should delete backup', async () => {
      const res = await request(app)
        .delete('/api/admin/backups/test.gzip')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBeLessThan(500); // Might be 400/404 if not found
    });

    it('should restore backup', async () => {
      const res = await request(app)
        .post('/api/admin/backups/test.gzip/restore')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBeLessThan(500);
    });
    
    it('should download backup', async () => {
      const res = await request(app)
        .get('/api/admin/backups/test.gzip/download')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.statusCode).toBeLessThan(500);
    });
  });

  describe('IP Access Control', () => {
    describe('Banned IPs', () => {
      it('should allow super admin to get banned IPs', async () => {
        await BannedIP.create({ ipAddress: '1.2.3.4', reason: 'Test' });
        const res = await request(app)
          .get('/api/admin/banned-ips')
          .set('Authorization', `Bearer ${superAdminToken}`);
        
        expect(res.statusCode).toEqual(200);
        expect(res.body.bannedIPs.length).toBe(1);
        expect(res.body.bannedIPs[0].ipAddress).toBe('1.2.3.4');
      });

      it('should allow super admin to unban an IP', async () => {
        const banned = await BannedIP.create({ ipAddress: '1.2.3.4' });
        const res = await request(app)
          .delete(`/api/admin/banned-ips/${banned._id}`)
          .set('Authorization', `Bearer ${superAdminToken}`);
        
        expect(res.statusCode).toEqual(200);
        const exists = await BannedIP.findById(banned._id);
        expect(exists).toBeNull();
      });
    });

    describe('Admin Whitelist', () => {
      it('should allow super admin to add an IP to whitelist', async () => {
        const res = await request(app)
          .post('/api/admin/whitelisted-ips')
          .send({ ipAddress: '192.168.1.100', description: 'Office' })
          .set('Authorization', `Bearer ${superAdminToken}`);
        
        expect(res.statusCode).toEqual(201);
        const exists = await WhitelistedIP.findOne({ ipAddress: '192.168.1.100' });
        expect(exists).not.toBeNull();
      });

      it('should allow super admin to remove an IP from whitelist', async () => {
        const whitelisted = await WhitelistedIP.create({ ipAddress: '192.168.1.100' });
        const res = await request(app)
          .delete(`/api/admin/whitelisted-ips/${whitelisted._id}`)
          .set('Authorization', `Bearer ${superAdminToken}`);
        
        expect(res.statusCode).toEqual(200);
        const exists = await WhitelistedIP.findById(whitelisted._id);
        expect(exists).toBeNull();
      });

      it('should block admin access from a non-whitelisted IP', async () => {
        await WhitelistedIP.deleteMany({});
        
        const res = await request(app)
          .get('/api/admin/stats')
          .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res.statusCode).toEqual(403);
        expect(res.body.message).toContain('authorized whitelist');
      });
    });
  });
});
