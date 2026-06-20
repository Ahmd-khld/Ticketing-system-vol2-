const crypto = require('crypto');

describe('Encryption Utility', () => {
  let encryption;
  
  beforeEach(() => {
    jest.resetModules();
  });

  it('should hash the key if it is not exactly 32 bytes', () => {
    // Modify env variable to force hashing
    process.env.ENCRYPTION_KEY = 'shortkey';
    encryption = require('../utils/encryption');
    
    const text = 'test message';
    const encrypted = encryption.encryptDeterministic(text);
    const decrypted = encryption.decryptDeterministic(encrypted);
    expect(decrypted).toBe(text);
  });

  it('should use the key directly if it is exactly 32 bytes', () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
    encryption = require('../utils/encryption');
    
    const text = 'test message 2';
    const encrypted = encryption.encryptDeterministic(text);
    const decrypted = encryption.decryptDeterministic(encrypted);
    expect(decrypted).toBe(text);
  });

  it('should decrypt legacy AES-256-CBC format (2 parts)', () => {
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
    encryption = require('../utils/encryption');
    
    const text = 'legacy text';
    // Create a mock legacy CBC encrypted string manually
    const keyBuffer = Buffer.from(process.env.ENCRYPTION_KEY);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const legacyFormat = iv.toString('hex') + ':' + encrypted;
    
    const decrypted = encryption.decryptDeterministic(legacyFormat);
    expect(decrypted).toBe(text);
  });

  it('should return original text if format is unknown (more than 3 parts)', () => {
    encryption = require('../utils/encryption');
    const unknownFormat = 'part1:part2:part3:part4';
    expect(encryption.decryptDeterministic(unknownFormat)).toBe(unknownFormat);
  });

  it('should return original text if decryption fails (invalid data)', () => {
    encryption = require('../utils/encryption');
    const invalidFormat = 'invalidhex:invalidhex:invalidhex';
    expect(encryption.decryptDeterministic(invalidFormat)).toBe(invalidFormat);
  });
});
