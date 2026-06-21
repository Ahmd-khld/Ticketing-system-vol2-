const { setIO, triggerGRCUpdate, runRiskAssessment, sanitizeAndSyncGRCData } = require('../utils/grcService');
const dbHandler = require('./setup');
const Risk = require('../models/Risk');
const User = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');
const child_process = require('child_process');
const events = require('events');

beforeAll(async () => await dbHandler.connect());
afterEach(async () => {
  await dbHandler.clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => await dbHandler.closeDatabase());

describe('GRC Service', () => {
  describe('sanitizeAndSyncGRCData', () => {
    it('should handle null data', async () => {
      const result = await sanitizeAndSyncGRCData(null);
      expect(result).toBeNull();
    });


  });

  describe('runRiskAssessment', () => {
    it('should execute python script and broadcast results', async () => {
      const mockChild = new events.EventEmitter();
      mockChild.stdout = new events.EventEmitter();
      mockChild.stderr = new events.EventEmitter();
      
      const spawnSpy = jest.spyOn(child_process, 'spawn').mockReturnValue(mockChild);

      const mockIO = { emit: jest.fn() };
      setIO(mockIO);

      const assessmentPromise = runRiskAssessment();
      
      // Simulate script output
      mockChild.stdout.emit('data', JSON.stringify({ risk_register: [] }));
      mockChild.emit('close', 0);

      const result = await assessmentPromise;
      expect(result).toBeDefined();
      expect(mockIO.emit).toHaveBeenCalledWith('grcLiveUpdate', expect.any(Object));
      spawnSpy.mockRestore();
    });

    it('should handle python script failure', async () => {
      const mockChild = new events.EventEmitter();
      mockChild.stdout = new events.EventEmitter();
      mockChild.stderr = new events.EventEmitter();
      
      const spawnSpy = jest.spyOn(child_process, 'spawn').mockReturnValue(mockChild);

      const assessmentPromise = runRiskAssessment();
      
      mockChild.stderr.emit('data', 'Python error');
      mockChild.emit('close', 1);

      const result = await assessmentPromise;
      expect(result).toBeNull();
      spawnSpy.mockRestore();
    });
  });

  describe('triggerGRCUpdate', () => {
    it('should not do anything in test env by default', () => {
      const spawnSpy = jest.spyOn(child_process, 'spawn');
      triggerGRCUpdate();
      // the process.env.NODE_ENV is 'test' so it returns early
      expect(spawnSpy).not.toHaveBeenCalled();
      spawnSpy.mockRestore();
    });
  });
});
