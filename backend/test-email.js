const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
  console.log('Testing email configuration...');
  console.log('USER:', process.env.EMAIL_USER);
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Smart Garden Test" <${process.env.EMAIL_USER}>`,
      to: 'ahmedfacebook267@gmail.com', // User's email from prompt
      subject: 'Test Email',
      text: 'This is a test email to verify credentials.',
    });
    console.log('Email sent successfully:', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

testEmail();
