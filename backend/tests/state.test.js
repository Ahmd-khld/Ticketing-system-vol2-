const request = require('supertest');
const { app } = require('../app');
const dbHandler = require('./setup');
const Backup = require('../models/Backup');

beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clearDatabase());
afterAll(async () => await dbHandler.closeDatabase());

describe('State API', () => {
  describe('GET /api/download', () => {
    it('should return current state', async () => {
      const res = await request(app).get('/api/download');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('settings');
    });
  });

  describe('POST /api/backup', () => {
    it('should create a backup', async () => {
      const res = await request(app).post('/api/backup');
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('backupId');
      
      const count = await Backup.countDocuments();
      expect(count).toBe(1);
    });
  });

  describe('GET /api/backups', () => {
    it('should list backups', async () => {
      await Backup.create({ data: { test: 1 } });
      const res = await request(app).get('/api/backups');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('DELETE /api/backup/:id', () => {
    it('should delete a backup', async () => {
      const backup = await Backup.create({ data: { test: 1 } });
      const res = await request(app).delete(`/api/backup/${backup._id}`);
      expect(res.statusCode).toEqual(200);
      
      const count = await Backup.countDocuments();
      expect(count).toBe(0);
    });
  });
});
