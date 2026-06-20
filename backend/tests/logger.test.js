const logger = require('../utils/logger');

describe('Logger Utility', () => {
  let originalEnv;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.NODE_ENV;
    
    // Spy on console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore environment and mocks
    process.env.NODE_ENV = originalEnv;
    delete process.env.LOG_LEVEL;
    jest.restoreAllMocks();
    
    // Reset module registry so the singleton is re-evaluated if needed
    jest.resetModules();
  });

  it('should not log info or debug in test environment by default', () => {
    process.env.NODE_ENV = 'test';
    
    // Re-require to pick up env change
    const testLogger = require('../utils/logger');
    
    testLogger.info('This is an info');
    testLogger.debug('This is a debug');
    
    expect(console.log).not.toHaveBeenCalled();
  });

  it('should log error in test environment', () => {
    process.env.NODE_ENV = 'test';
    const testLogger = require('../utils/logger');
    
    testLogger.error('This is an error');
    
    expect(console.error).toHaveBeenCalledWith('[ERROR]', 'This is an error');
  });

  it('should log everything if LOG_LEVEL is debug', () => {
    process.env.LOG_LEVEL = 'debug';
    const testLogger = require('../utils/logger');
    
    testLogger.debug('Debug msg');
    testLogger.info('Info msg');
    testLogger.warn('Warn msg');
    testLogger.error('Error msg');
    
    expect(console.log).toHaveBeenCalledWith('[DEBUG]', 'Debug msg');
    expect(console.log).toHaveBeenCalledWith('[INFO]', 'Info msg');
    expect(console.warn).toHaveBeenCalledWith('[WARN]', 'Warn msg');
    expect(console.error).toHaveBeenCalledWith('[ERROR]', 'Error msg');
  });

  it('should default to info if not in test env and no LOG_LEVEL', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_LEVEL;
    const testLogger = require('../utils/logger');
    
    testLogger.debug('Debug msg');
    testLogger.info('Info msg');
    
    expect(console.log).not.toHaveBeenCalledWith('[DEBUG]', 'Debug msg');
    expect(console.log).toHaveBeenCalledWith('[INFO]', 'Info msg');
  });
});
