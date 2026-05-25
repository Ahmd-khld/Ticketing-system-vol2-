const crypto = require('crypto');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const Ticket = require('../models/Ticket');
const PromoCode = require('../models/PromoCode');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
const IV_LENGTH = 16;
const DAILY_CAPACITY = parseInt(process.env.DAILY_CAPACITY) || 1000;

const isDateValidForBooking = (date) => {
  const now = new Date();
  // Server's local midnight
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const bookingWindow = parseInt(process.env.BOOKING_WINDOW_DAYS) || 30;
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + bookingWindow);

  let checkDate;
  if (typeof date === 'string' && date.includes('-')) {
    const [year, month, day] = date.split('-').map(Number);
    checkDate = new Date(year, month - 1, day);
  } else {
    checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
  }

  // To handle the case where the server has rolled over to the next day 
  // but it's still "today" for the user, we allow a 1-day grace period for "yesterday"
  // from the server's perspective, as long as it's the user's today.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return checkDate >= yesterday && checkDate <= maxDate;
};

const formatDateLocal = (date) => {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getCrowdLevel = (count) => {
  const percentage = (count / DAILY_CAPACITY) * 100;
  if (percentage <= 30) return 'quiet';
  if (percentage <= 70) return 'moderate';
  return 'busy';
};

const encryptCard = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

const savePaymentCardIfRequested = async ({
  user,
  cardNumber,
  expiry,
  saveCard,
  useSavedCard,
  savedCardId,
}) => {
  if (!user.savedCards) {
    user.savedCards = [];
  }

  if (useSavedCard) {
    const hasSavedCard = user.savedCards.some((card) => card._id.toString() === savedCardId);

    if (!hasSavedCard) {
      return { status: 'failed', message: 'Selected saved card was not found' };
    }

    return { status: 'used_saved_card' };
  }

  if (!saveCard || !cardNumber) {
    return { status: 'not_saved' };
  }

  const sanitizedCardNumber = String(cardNumber).replace(/\D/g, '');
  if (sanitizedCardNumber.length !== 16) {
    return { status: 'failed', message: 'Card number must be 16 digits' };
  }

  const last4Digits = sanitizedCardNumber.slice(-4);
  const alreadySaved = user.savedCards.some((card) => card.last4Digits === last4Digits);
  if (alreadySaved) {
    return { status: 'already_saved', last4Digits };
  }

  user.savedCards.push({
    last4Digits,
    encryptedData: encryptCard(
      JSON.stringify({
        cardNumber: sanitizedCardNumber,
        expiry,
      })
    ),
  });

  await user.save();
  return { status: 'saved', last4Digits };
};

const buildEmailTicketHtml = ({ user, tickets, selectedDate, subscriptionPlan }) => {
  const validity =
    subscriptionPlan === 'monthly'
      ? 'Valid for 30 days from today.'
      : `Valid strictly on <strong>${new Date(selectedDate).toLocaleDateString()}</strong>.`;

  const ticketItems = tickets
    .map(
      (ticket) => `
    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
      <div style="flex: 1;">
        <p style="margin: 0; font-size: 12px; font-weight: 800; color: #80C241; text-transform: uppercase; letter-spacing: 0.1em;">${ticket.ticketType} Pass</p>
        <h3 style="margin: 4px 0 12px 0; font-size: 20px; font-weight: 900; color: #111827; font-style: italic;">Ticket ID: ${ticket._id.toString().slice(-8).toUpperCase()}</h3>
        <div style="display: flex; gap: 16px;">
          <div>
            <p style="margin: 0; font-size: 10px; color: #6b7280; font-weight: 700; text-transform: uppercase;">Price</p>
            <p style="margin: 2px 0 0 0; font-size: 16px; font-weight: 800; color: #111827;">${ticket.price} EGP</p>
          </div>
        </div>
      </div>
      <div style="margin-left: 20px; background-color: white; padding: 8px; border-radius: 12px; border: 2px solid #111827;">
        <img src="cid:qr-${ticket._id.toString()}" alt="QR Code" width="100" height="100" style="display: block;" />
      </div>
    </div>
  `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Smart Garden Tickets</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <tr>
          <td style="background-color: #111827; padding: 40px 40px 30px 40px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 900; font-style: italic; letter-spacing: -0.02em;">SMART <span style="color: #80C241;">GARDEN</span></h1>
            <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2em;">Official Confirmation</p>
          </td>
        </tr>
        
        <!-- Content -->
        <tr>
          <td style="padding: 40px;">
            <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 24px; font-weight: 800;">Hello ${user.name},</h2>
            <p style="margin: 0 0 32px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">Your booking is confirmed! We've generated your entry passes below. Please show these QR codes at the gate for scanning.</p>
            
            <div style="margin-bottom: 32px; padding: 16px; background-color: #f0fdf4; border-left: 4px solid #80C241; border-radius: 4px;">
              <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">${validity}</p>
            </div>

            <!-- Ticket List -->
            ${ticketItems}

            <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">Questions? Reply to this email or visit our help center.</p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">&copy; 2026 Smart Garden IoT. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

const sendTicketsViaEmail = async ({ user, tickets, selectedDate, subscriptionPlan }) => {
  if (!tickets || !tickets.length) {
    console.log('Skipping email: No tickets provided.');
    return { status: 'skipped', reason: 'No tickets were created' };
  }

  if (!user || !user.email) {
    console.log('Skipping email: User has no email address.');
    return { status: 'skipped', reason: 'User has no email address' };
  }

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

  try {
    // Verify connection configuration
    await transporter.verify();
    console.log('SMTP server connection verified successfully.');
  } catch (verifyError) {
    console.error('SMTP Verification Failed:', verifyError);
    return { status: 'failed', error: 'SMTP connection failed', details: verifyError.message };
  }

  const attachmentPromises = tickets.map(async (ticket) => {
    try {
      const qrData = JSON.stringify({
        ticketId: ticket._id.toString(),
        userId: user._id.toString(),
        ticketType: ticket.ticketType,
        subscriptionPlan: ticket.subscriptionPlan,
        validFrom: ticket.validFrom,
        validUntil: ticket.validUntil,
      });

      const qrImage = await QRCode.toBuffer(qrData);
      const ticketIdStr = ticket._id.toString();

      return {
        filename: `ticket-${ticketIdStr}.png`,
        content: qrImage,
        contentType: 'image/png',
        cid: `qr-${ticketIdStr}`, // Unique CID for this specific ticket
      };
    } catch (qrErr) {
      console.error(`Failed to generate QR for ticket ${ticket._id}:`, qrErr);
      return null;
    }
  });

  const attachments = (await Promise.all(attachmentPromises)).filter((a) => a !== null);

  console.log(
    `Attempting to send ticket email to ${user.email} with ${attachments.length} inline QR codes...`
  );

  try {
    const info = await transporter.sendMail({
      from: `"Smart Garden" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Your Smart Garden Ticket Confirmation',
      html: buildEmailTicketHtml({ user, tickets, selectedDate, subscriptionPlan }),
      attachments,
    });

    console.log(`Email successfully sent to ${user.email}. MessageID: ${info.messageId}`);
    return {
      status: 'sent',
      messageId: info.messageId,
      to: user.email,
    };
  } catch (sendError) {
    console.error('Email failed to send:', sendError);
    return {
      status: 'failed',
      error: 'sendMail failed',
      details: sendError.message,
    };
  }
};

const checkout = async (req, res) => {
  try {
    if (!req.body.quantities || !req.body.subscriptionPlan) {
      return res.status(400).json({ message: 'Missing quantities or subscription plan' });
    }

    const {
      quantities,
      selectedDate,
      subscriptionPlan,
      cardNumber,
      expiry,
      saveCard,
      useSavedCard,
      savedCardId,
      promoCode,
      paymentMethod,
    } = req.body;

    const isCashPayment = paymentMethod === 'CASH';

    let requestedCount = 0;
    const validTypes = ['child', 'adult', 'senior'];
    for (const [type, rawCount] of Object.entries(quantities)) {
      if (validTypes.includes(type)) {
        requestedCount += Number(rawCount) || 0;
      }
    }

    if (subscriptionPlan === 'one-time') {
      if (!selectedDate) {
        return res.status(400).json({ message: 'Selected date is required for one-time tickets' });
      }

      if (!isDateValidForBooking(selectedDate)) {
        return res.status(400).json({
          message: 'Date must be today or within the next 30 days',
        });
      }

      const selectedDateStr = formatDateLocal(selectedDate);
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(selectedDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Run capacity check and user ticket limit check concurrently
      const [ticketCountMap, userTicketsForDate] = await Promise.all([
        Ticket.countTicketsByDateRange(dayStart.getTime(), dayEnd.getTime()),
        Ticket.countDocuments({
          userId: req.user._id,
          validFrom: { $gte: dayStart, $lte: dayEnd },
          subscriptionPlan: 'one-time',
          status: { $in: ['ACTIVE', 'USED'] },
        }),
      ]);

      const currentCount = ticketCountMap[selectedDateStr] || 0;

      if (currentCount + requestedCount > DAILY_CAPACITY) {
        return res.status(400).json({
          message: `This date does not have enough capacity for ${requestedCount} tickets. Only ${Math.max(0, DAILY_CAPACITY - currentCount)} left.`,
          date: selectedDateStr,
          currentCount,
          capacity: DAILY_CAPACITY,
        });
      }

      const maxTicketsPerTransaction = parseInt(process.env.MAX_TICKETS_PER_TRANSACTION) || 200;
      if (userTicketsForDate + requestedCount > maxTicketsPerTransaction) {
        return res.status(400).json({
          message: `You can only buy a maximum of ${maxTicketsPerTransaction} tickets per day. You already have ${userTicketsForDate} ticket(s) for this date.`,
        });
      }
    } else if (subscriptionPlan === 'monthly') {
      const maxTicketsPerTransaction = parseInt(process.env.MAX_TICKETS_PER_TRANSACTION) || 200;
      if (requestedCount > maxTicketsPerTransaction) {
        return res.status(400).json({
          message: `You can only buy a maximum of ${maxTicketsPerTransaction} tickets per transaction.`,
        });
      }
    }

    const newTickets = [];
    const prices = {
      child:
        subscriptionPlan === 'monthly'
          ? parseInt(process.env.TICKET_PRICE_CHILD_MONTHLY) || 1500
          : parseInt(process.env.TICKET_PRICE_CHILD_DAILY) || 100,
      adult:
        subscriptionPlan === 'monthly'
          ? parseInt(process.env.TICKET_PRICE_ADULT_MONTHLY) || 3000
          : parseInt(process.env.TICKET_PRICE_ADULT_DAILY) || 200,
      senior:
        subscriptionPlan === 'monthly'
          ? parseInt(process.env.TICKET_PRICE_SENIOR_MONTHLY) || 2000
          : parseInt(process.env.TICKET_PRICE_SENIOR_DAILY) || 150,
    };

    // PROMO CODE LOGIC
    let discountMultiplier = 1;
    let validPromo = null;

    if (promoCode) {
      validPromo = await PromoCode.findOne({ code: promoCode.toUpperCase() });
      if (validPromo) {
        discountMultiplier = (100 - (validPromo.discount || 10)) / 100;
      }
    }

    for (const [type, rawCount] of Object.entries(quantities)) {
      const count = Number(rawCount);
      if (!prices[type] || count <= 0) {
        continue;
      }

      for (let i = 0; i < count; i += 1) {
        let validFrom = new Date();
        let validUntil = new Date();

        if (subscriptionPlan === 'monthly') {
          validUntil.setDate(validUntil.getDate() + 30);
        } else {
          validFrom = new Date(selectedDate);
          validFrom.setUTCHours(0, 0, 0, 0);
          validUntil = new Date(selectedDate);
          validUntil.setUTCHours(23, 59, 59, 999);
        }

        const originalPrice = prices[type];
        const finalPrice = validPromo ? Math.round(originalPrice * discountMultiplier) : originalPrice;

        newTickets.push({
          userId: req.user._id,
          ticketType: type,
          price: finalPrice,
          originalPrice: validPromo ? originalPrice : undefined,
          isPromoApplied: !!validPromo,
          promoCodeName: validPromo ? validPromo.code : '',
          subscriptionPlan,
          validFrom,
          validUntil,
          status: isCashPayment ? 'INACTIVE' : 'ACTIVE',
          paymentMethod: isCashPayment ? 'CASH' : 'ONLINE',
          paymentStatus: isCashPayment ? 'PENDING' : 'PAID',
        });
      }
    }

    if (!newTickets.length) {
      return res.status(400).json({ message: 'Please select at least one ticket to checkout' });
    }

    const cardResult = await savePaymentCardIfRequested({
      user: req.user,
      cardNumber,
      expiry,
      saveCard,
      useSavedCard,
      savedCardId,
    });

    if (cardResult.status === 'failed') {
      return res.status(400).json({ message: cardResult.message });
    }

    const savedTickets = await Ticket.insertMany(newTickets);

    // BACKGROUND TASKS: We fire these off and don't await them so the user gets an immediate response.
    // Errors are caught internally to prevent the main process from crashing.
    setImmediate(async () => {
      try {
        const io = req.app.get('io');
        if (io) {
          const [totalTicketsSold, purchasingUsersAgg, salesAgg, mostSoldAgg] = await Promise.all([
            Ticket.countDocuments(),
            Ticket.aggregate([{ $group: { _id: '$userId' } }, { $count: 'totalPurchasingUsers' }]),
            Ticket.aggregate([
              { $match: { status: { $ne: 'CANCELLED' } } },
              {
                $group: {
                  _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                  totalTickets: { $sum: 1 },
                  revenue: { $sum: '$price' },
                },
              },
              { $sort: { '_id.year': -1, '_id.month': -1 } },
              { $limit: 12 },
            ]),
            Ticket.aggregate([
              {
                $group: {
                  _id: { type: '$ticketType', plan: '$subscriptionPlan' },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 1 },
            ]),
          ]);

          const purchasingUsers =
            purchasingUsersAgg.length > 0 ? purchasingUsersAgg[0].totalPurchasingUsers : 0;

          let mostSoldTicket = 'None yet';
          if (mostSoldAgg.length > 0) {
            const top = mostSoldAgg[0];
            const typeCap = top._id.type
              ? top._id.type.charAt(0).toUpperCase() + top._id.type.slice(1)
              : 'Unknown';
            mostSoldTicket = `${typeCap} (${top._id.plan || 'unknown'})`;
          }
          io.emit('totalTicketsUpdate', { totalTicketsSold, purchasingUsers, mostSoldTicket });

          if (isCashPayment && savedTickets.length > 0) {
            const populatedTickets = await Ticket.find({
              _id: { $in: savedTickets.map((t) => t._id) },
            }).populate('userId', 'name email phone');

            populatedTickets.forEach((t) => {
              io.to('admin-room').emit('newCashTicket', t);
            });
          }

          const formattedSales = salesAgg            .map((s) => ({
              month: new Date(s._id.year, s._id.month - 1).toLocaleString('default', {
                month: 'short',
                year: 'numeric',
              }),
              totalTickets: s.totalTickets,
              revenue: s.revenue,
            }))
            .reverse();
          io.emit('monthlySalesUpdate', formattedSales);

          // Global broadcast for availability window (public & admin)
          io.emit('crowdDataUpdated');
        }

        // NEW: Emit targeted update to the specific user's room for Profile page real-time refresh
        if (io) {
          savedTickets.forEach((ticket) => {
            const roomName = `user-${req.user._id.toString()}-tickets`;
            console.log(`[Socket Debug] Checkout: Emitting TICKET_STATUS_UPDATED to room: ${roomName} for ticket: ${ticket._id}`);
            io.to(roomName).emit('TICKET_STATUS_UPDATED', {
              ticketId: ticket._id.toString(),
              userId: req.user._id.toString(),
              status: ticket.status,
              updatedAt: ticket.createdAt,
              ticket: ticket,
            });
          });
        }

        // Trigger email in background
        await sendTicketsViaEmail({
          user: req.user,
          tickets: savedTickets,
          selectedDate,
          subscriptionPlan,
        });
      } catch (bgError) {
        console.error('Post-Checkout Background Task Error:', bgError);
      }
    });

    return res.status(200).json({
      message: 'Checkout successful. Your tickets are being generated and sent to your email.',
      tickets: savedTickets,
      card: cardResult,
    });
  } catch (error) {
    console.error('Checkout Error:', error);
    return res.status(500).json({ message: 'Server error during checkout' });
  }
};

const getTicketHistory = async (req, res) => {
  try {
    // Use .lean() for faster JSON transformation on read-only queries
    const tickets = await Ticket.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getTicketInsights = async (req, res) => {
  try {
    let weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);

    if (req.query.startDate) {
      const parsed = new Date(req.query.startDate);
      if (!isNaN(parsed.getTime())) {
        weekStart = parsed;
        weekStart.setUTCHours(0, 0, 0, 0);
      }
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    const ticketCountMap = await Ticket.countTicketsByDateRange(
      weekStart.getTime(),
      weekEnd.getTime()
    );
    const days = [];

    for (let i = 0; i < 7; i += 1) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = formatDateLocal(currentDate);
      const count = ticketCountMap[dateStr] || 0;

      days.push({
        date: dateStr,
        dayName: currentDate.toLocaleDateString('en-US', { weekday: 'short' }),
        displayDate: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count,
        crowdLevel: getCrowdLevel(count),
        isToday: currentDate.toDateString() === new Date().toDateString(),
      });
    }

    // Prevent Response Caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      days,
      capacity: DAILY_CAPACITY,
    });
  } catch (error) {
    console.error('Ticket Insights Error:', error);
    res.status(500).json({ message: error.message });
  }
};

const cancelTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.id, userId: req.user._id });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Requirement: If ticket.status === 'EXPIRED' or if the validUntil date has already passed compared to the start of today
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (ticket.status === 'EXPIRED' || ticket.validUntil < todayStart) {
      if (ticket.status !== 'EXPIRED') {
        ticket.status = 'EXPIRED';
        await ticket.save();
      }
      return res.status(400).json({ message: 'Cannot refund expired or past tickets' });
    }

    if (ticket.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Only active tickets can be cancelled.' });
    }

    ticket.status = 'CANCELLED';
    await ticket.save();

    const io = req.app.get('io');
    if (io) {
      // NEW: Emit targeted update to the specific user's room for real-time refresh
      io.to(`user-${req.user._id}-tickets`).emit('TICKET_STATUS_UPDATED', {
        ticketId: ticket._id,
        userId: req.user._id,
        status: 'CANCELLED',
        updatedAt: ticket.updatedAt,
        ticket: ticket,
      });

      const salesAgg = await Ticket.aggregate([
        { $match: { status: { $ne: 'CANCELLED' } } },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            totalTickets: { $sum: 1 },
            revenue: { $sum: '$price' },
          },
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 },
      ]);
      const formattedSales = salesAgg
        .map((s) => ({
          month: new Date(s._id.year, s._id.month - 1).toLocaleString('default', {
            month: 'short',
            year: 'numeric',
          }),
          totalTickets: s.totalTickets,
          revenue: s.revenue,
        }))
        .reverse();
      io.emit('monthlySalesUpdate', formattedSales);
      io.emit('dataRefresh');
    }

    res.json({ message: 'Ticket cancelled successfully. Refund initiated.' });
  } catch (error) {
    console.error('Cancel Ticket Error:', error);
    res.status(500).json({ message: 'Server error cancelling ticket' });
  }
};

const rescheduleTicket = async (req, res) => {
  try {
    const { newDate } = req.body;
    if (!newDate) {
      return res.status(400).json({ message: 'New date is required' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 4);

    let checkDate;
    if (typeof newDate === 'string' && newDate.includes('-')) {
      const [year, month, day] = newDate.split('-').map(Number);
      checkDate = new Date(year, month - 1, day);
    } else {
      checkDate = new Date(newDate);
      checkDate.setHours(0, 0, 0, 0);
    }

    if (checkDate < today || checkDate > maxDate) {
      return res.status(400).json({
        message: `You can only reschedule to a date between today and ${maxDate.toLocaleDateString()}.`,
      });
    }

    const ticket = await Ticket.findOne({ _id: req.params.id, userId: req.user._id });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (ticket.subscriptionPlan !== 'one-time') {
      return res.status(400).json({ message: 'Only one-time tickets can be rescheduled' });
    }

    if (ticket.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Only active tickets can be rescheduled' });
    }

    if (ticket.hasRescheduled) {
      return res.status(400).json({ message: 'Ticket has already been rescheduled once' });
    }

    const selectedDateStr = formatDateLocal(newDate);
    const dayStart = new Date(newDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(newDate);
    dayEnd.setHours(23, 59, 59, 999);

    const ticketCountMap = await Ticket.countTicketsByDateRange(dayStart.getTime(), dayEnd.getTime());
    const currentCount = ticketCountMap[selectedDateStr] || 0;

    if (currentCount + 1 > DAILY_CAPACITY) {
      return res.status(400).json({
        message: `This date does not have enough capacity. Only ${Math.max(0, DAILY_CAPACITY - currentCount)} left.`,
      });
    }

    ticket.validFrom = dayStart;
    ticket.validUntil = dayEnd;
    ticket.hasRescheduled = true;
    await ticket.save();

    // NEW: Emit targeted update to the specific user's room for real-time refresh
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${req.user._id}-tickets`).emit('TICKET_STATUS_UPDATED', {
        ticketId: ticket._id,
        userId: req.user._id,
        status: ticket.status,
        updatedAt: new Date(),
        ticket: ticket,
      });
    }

    res.json({ message: 'Ticket rescheduled successfully', ticket });
  } catch (error) {
    console.error('Reschedule Ticket Error:', error);
    res.status(500).json({ message: 'Server error rescheduling ticket' });
  }
};

module.exports = {
  checkout,
  getTicketHistory,
  getTicketInsights,
  cancelTicket,
  rescheduleTicket,
};
