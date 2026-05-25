const cron = require('node-cron');
const nodemailer = require('nodemailer');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

const initTicketCron = () => {
  // Run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Starting daily ticket maintenance job...');
    
    try {
      await handleExpirations();
      await handleReminders();
    } catch (error) {
      console.error('[Cron] Error during ticket maintenance:', error);
    }
  });

  console.log('[Cron] Ticket maintenance job scheduled (Daily at 00:00)');
};

/**
 * Task B: Automatically expire tickets where validUntil is in the past
 */
const handleExpirations = async () => {
  const now = new Date();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  
  // Find tickets that are about to expire to emit events for them
  const overdueTickets = await Ticket.find({
    status: { $ne: 'EXPIRED' },
    validUntil: { $lt: now }
  });

  if (overdueTickets.length > 0) {
    const result = await Ticket.updateMany(
      {
        _id: { $in: overdueTickets.map(t => t._id) }
      },
      {
        $set: { status: 'EXPIRED' }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`[Cron] Task B: Expired ${result.modifiedCount} overdue tickets.`);
      
      // Broadcast the status change to all connected clients in real-time
      try {
        const { io } = require('../server');
        if (io) {
          overdueTickets.forEach(ticket => {
            const payload = {
              ticketId: ticket._id.toString(),
              userId: ticket.userId.toString(),
              status: 'EXPIRED',
              updatedAt: new Date(),
              ticket: { ...ticket.toObject(), status: 'EXPIRED' }
            };
            
            // Emit to the specific user room (Admin dashboard listeners)
            const roomName = `user-${ticket.userId.toString()}-tickets`;
            console.log(`[Socket Debug] Cron Expiration: Emitting TICKET_STATUS_UPDATED to room: ${roomName} for ticket: ${ticket._id}`);
            io.to(roomName).emit('TICKET_STATUS_UPDATED', payload);
            // Global broadcast for general admin view updates
            io.emit('globalTicketUpdate', payload);
          });
        }
      } catch (err) {
        console.error('[Cron] Failed to broadcast expiration updates:', err.message);
      }
    }
  }

  // NEW: Permanently delete cash reservations that have been expired for more than 24 hours
  try {
    const deletedResult = await Ticket.deleteMany({
      paymentMethod: 'CASH',
      status: 'EXPIRED',
      validUntil: { $lt: yesterdayStart },
    });
    if (deletedResult.deletedCount > 0) {
      console.log(`[Cron] Task C: Deleted ${deletedResult.deletedCount} abandoned cash reservations.`);
    }
  } catch (deleteError) {
    console.error('[Cron] Failed to delete abandoned cash reservations:', deleteError.message);
  }
};

/**
 * Task A: Send reminders for tickets expiring in exactly 24 hours
 */
const handleReminders = async () => {
  const tomorrowStart = new Date();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const expiringTickets = await Ticket.find({
    status: 'ACTIVE',
    validUntil: { $gte: tomorrowStart, $lte: tomorrowEnd }
  }).populate('userId');

  if (expiringTickets.length === 0) return;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  console.log(`[Cron] Task A: Sending ${expiringTickets.length} expiration reminders...`);

  for (const ticket of expiringTickets) {
    if (!ticket.userId || !ticket.userId.email) continue;

    const mailOptions = {
      from: `"Smart Park" <${process.env.EMAIL_USER}>`,
      to: ticket.userId.email,
      subject: 'Your Smart Park Ticket Expires Tomorrow!',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #0B4228; text-align: center;">Ticket Expiration Reminder</h2>
          <p>Hello <strong>${ticket.userId.name}</strong>,</p>
          <p>This is a friendly reminder that your <strong>${ticket.ticketType}</strong> ticket for Smart Park is set to expire tomorrow.</p>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Ticket ID:</strong> ${ticket._id}</p>
            <p style="margin: 5px 0;"><strong>Valid Until:</strong> ${new Date(ticket.validUntil).toLocaleDateString()}</p>
            <p style="margin: 5px 0;"><strong>Type:</strong> ${ticket.ticketType} (${ticket.subscriptionPlan})</p>
          </div>

          <p>Don't let it go to waste! We look forward to seeing you at the park.</p>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="http://localhost:5173/profile" style="background-color: #80C241; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">View My Tickets</a>
          </div>
          
          <p style="font-size: 12px; color: #999; margin-top: 40px; text-align: center;">
            If you have already used this ticket or believe this is an error, please contact support.
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (err) {
      console.error(`[Cron] Failed to send reminder to ${ticket.userId.email}:`, err.message);
    }
  }
};

module.exports = { initTicketCron };
