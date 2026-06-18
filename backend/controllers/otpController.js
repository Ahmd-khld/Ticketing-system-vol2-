const { sendEmail } = require('../utils/emailService');
const { issueOtp, consumeOtp } = require('../utils/otpService');
const { buildOtpEmail } = require('../utils/otpEmail');
const logger = require('../utils/logger');

const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const otpCode = await issueOtp(email);

    sendEmail({
      to: email,
      subject: 'Your Verification Code',
      html: buildOtpEmail({
        otp: otpCode,
        heading: 'Verification Code',
        intro: 'Your one-time password (OTP) for verification is:',
      }),
    }).catch(err => logger.error('[OTP] Background email failed:', err.message));

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    logger.error('[OTP] sendOTP failed:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const ok = await consumeOtp(email, otp);
    if (!ok) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    res.json({ message: 'OTP verified successfully', success: true });
  } catch (error) {
    logger.error('[OTP] verifyOTP failed:', error.message);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
};
