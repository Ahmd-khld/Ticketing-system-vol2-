const { sendEmail } = require('../utils/emailService');
const nodemailer = require('nodemailer');

jest.mock('nodemailer');

describe('Email Service', () => {
  let originalEnvUser, originalEnvPass;

  beforeEach(() => {
    originalEnvUser = process.env.EMAIL_USER;
    originalEnvPass = process.env.EMAIL_PASS;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.EMAIL_USER = originalEnvUser;
    process.env.EMAIL_PASS = originalEnvPass;
    jest.restoreAllMocks();
  });

  it('should return skipped status if credentials are not configured', async () => {
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;

    const result = await sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' });
    
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('Email credentials are not configured');
    expect(console.error).toHaveBeenCalledWith('Email configuration missing: EMAIL_USER or EMAIL_PASS not set in environment.');
  });

  it('should send email successfully', async () => {
    process.env.EMAIL_USER = 'test@smartpark.com';
    process.env.EMAIL_PASS = 'password123';

    const mockSendMail = jest.fn().mockResolvedValue({ messageId: '12345' });
    nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

    const result = await sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(result.status).toBe('success');
    expect(result.messageId).toBe('12345');
    expect(mockSendMail).toHaveBeenCalled();
  });

  it('should return failed status if sendMail throws an error', async () => {
    process.env.EMAIL_USER = 'test@smartpark.com';
    process.env.EMAIL_PASS = 'password123';

    const mockSendMail = jest.fn().mockRejectedValue(new Error('SMTP Error'));
    nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });

    const result = await sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('SMTP Error');
    expect(console.error).toHaveBeenCalled();
  });
});
