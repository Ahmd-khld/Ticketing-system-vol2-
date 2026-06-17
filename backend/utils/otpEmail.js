/**
 * Single source of truth for OTP / verification-code emails.
 *
 * Previously this exact markup was copy-pasted across otpController, authRoutes
 * and userController (4+ duplicates). Centralizing it keeps branding consistent
 * and means a styling change happens in one place.
 */

const buildOtpEmail = ({
  otp,
  heading = 'Verification Code',
  intro = 'Your one-time password (OTP) is:',
  note = 'This code will expire in 10 minutes. If you did not request this, please ignore this email.',
  greeting = 'Hello,',
} = {}) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
    <h2 style="color: #0B4228; text-align: center;">${heading}</h2>
    <p>${greeting}</p>
    <p>${intro}</p>
    <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0B4228;">${otp}</span>
    </div>
    <p>${note}</p>
    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="font-size: 12px; color: #6b7280; text-align: center;">Smart Garden IoT System</p>
  </div>
`;

module.exports = { buildOtpEmail };
