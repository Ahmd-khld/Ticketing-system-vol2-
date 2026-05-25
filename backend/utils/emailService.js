const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error('Email configuration missing: EMAIL_USER or EMAIL_PASS not set in environment.');
      return { status: 'skipped', reason: 'Email credentials are not configured' };
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"Smart Garden" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments,
    });

    console.log(`Email successfully sent to ${to}. MessageID: ${info.messageId}`);
    return { status: 'success', messageId: info.messageId };
  } catch (error) {
    console.error(`Email failed to send to ${to}:`, error);
    return { status: 'failed', error: error.message };
  }
};

module.exports = { sendEmail };
