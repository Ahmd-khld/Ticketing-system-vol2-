const { hashOtp } = require('../utils/otpService');

describe('OTP Service', () => {
  let originalPepper, originalJwt;

  beforeEach(() => {
    originalPepper = process.env.OTP_PEPPER;
    originalJwt = process.env.JWT_SECRET;
  });

  afterEach(() => {
    process.env.OTP_PEPPER = originalPepper;
    process.env.JWT_SECRET = originalJwt;
  });

  it('should throw an error if OTP_PEPPER and JWT_SECRET are not set', () => {
    delete process.env.OTP_PEPPER;
    delete process.env.JWT_SECRET;
    
    expect(() => {
      hashOtp('123456');
    }).toThrow('OTP hashing pepper is not configured (set OTP_PEPPER or JWT_SECRET).');
  });

  it('should hash successfully when only JWT_SECRET is set', () => {
    delete process.env.OTP_PEPPER;
    process.env.JWT_SECRET = 'secret';
    
    const hash = hashOtp('123456');
    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });
});
