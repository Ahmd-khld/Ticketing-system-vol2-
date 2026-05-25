const crypto = require('crypto');
const OTP = require('../models/OTP');
const { sendEmail } = require('../utils/emailService');

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const otpCode = generateOTP();

    // Upsert OTP for the email
    await OTP.findOneAndUpdate(
      { email },
      { otp: otpCode, createdAt: Date.now() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
        <h2 style="color: #0B4228; text-align: center;">Verification Code</h2>
        <p>Hello,</p>
        <p>Your one-time password (OTP) for verification is:</p>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0B4228;">${otpCode}</span>
        </div>
        <p>This code will expire in 10 minutes. If you did not request this code, please ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="font-size: 12px; color: #6b7280; text-align: center;">Smart Garden IoT System</p>
      </div>
    `;

    const emailResult = await sendEmail({
      to: email,
      subject: 'Your Verification Code',
      html: emailHtml,
    });

    if (emailResult.status === 'success') {
      res.json({ message: 'OTP sent successfully' });
    } else {
      res.status(500).json({ message: 'Failed to send OTP email', error: emailResult.error });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    // Optional: Delete OTP after successful verification
    await OTP.deleteOne({ _id: otpRecord._id });

    res.json({ message: 'OTP verified successfully', success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
};
