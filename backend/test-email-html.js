const nodemailer = require('nodemailer');
require('dotenv').config();

const otpEmailHtml = (otpCode, purposeLine) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
    <h2 style="color: #0B4228; text-align: center;">Verification Code</h2>
    <p>Hello,</p>
    <p>Use the code below ${purposeLine}:</p>
    <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0B4228;">${otpCode}</span>
    </div>
    <p>This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="font-size: 12px; color: #6b7280; text-align: center;">Smart Garden IoT System</p>
  </div>
`;

async function testEmail() {
  console.log('Testing HTML email configuration...');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Smart Garden" <${process.env.EMAIL_USER}>`,
      to: 'ahmedfacebook267@gmail.com', // User's email from prompt
      subject: 'Security code to change your email address',
      html: otpEmailHtml('123456', 'as a two-factor security check to change your account email address'),
    });
    console.log('HTML Email sent successfully:', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

testEmail();
