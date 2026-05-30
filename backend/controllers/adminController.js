const Ticket = require('../models/Ticket');
const User = require('../models/User');
const HardwareAlert = require('../models/HardwareAlert');
const AdminAuditLog = require('../models/AdminAuditLog');
const BannedIP = require('../models/BannedIP');
const WhitelistedIP = require('../models/WhitelistedIP');
const PromoCode = require('../models/PromoCode');
const Risk = require('../models/Risk');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const grcService = require('../utils/grcService');

const failedScans = new Map(); // Track failed scan attempts to prevent brute force

const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase().trim();

const isSuperAdmin = (req) => {
  if (!req.user || !req.user.email) return false;
  return req.user.email.toLowerCase().trim() === superAdminEmail;
};

const logAdminAction = async (req, actionDesc) => {
  try {
    if (!req.user || !req.user.email) return;
    const log = await AdminAuditLog.create({
      email: req.user.email,
      ipAddress: req.ip || 'unknown-client',
      status: 'success',
      statusCode: 200,
      action: actionDesc,
      userAgent: req.get('User-Agent') || 'Unknown',
    });
    const io = req.app.get('io');
    if (io) io.emit('auditLogUpdate', log);

    // Live GRC Integration: Trigger risk assessment update on every admin action
    grcService.triggerGRCUpdate();
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
};

const broadcastOccupancy = async (req) => {
  const io = req.app.get('io');
  if (!io) return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Robust occupancy calculation:
  // 1. One-time tickets marked as 'USED' today
  // 2. Monthly passes with a scan entry recorded today
  const currentOccupancy = await Ticket.countDocuments({
    $or: [
      { status: 'USED', updatedAt: { $gte: startOfDay, $lte: endOfDay } },
      { scanHistory: { $elemMatch: { $gte: startOfDay, $lte: endOfDay } } },
    ],
  });
  const maxCapacity = parseInt(process.env.DAILY_CAPACITY) || 1000;
  const capacityPercentage = Math.round((currentOccupancy / maxCapacity) * 100);

  // Broadcast to everyone (legacy)
  io.emit('occupancyUpdate', { currentOccupancy, capacityPercentage });

  // Broadcast specifically to admin room (new)
  io.to('admin-room').emit('occupancyUpdated', {
    currentOccupancy,
    capacityPercentage,
    maxCapacity,
    updatedAt: new Date(),
  });
};

// Helper to broadcast ticket status changes in real-time
const broadcastTicketStatus = (req, ticket) => {
  const io = req.app.get('io');
  if (!io) return;

  const ticketData = typeof ticket.toObject === 'function' ? ticket.toObject() : ticket;

  const payload = {
    ticketId: ticket._id.toString(),
    userId: ticket.userId.toString(),
    status: ticket.status,
    paymentStatus: ticket.paymentStatus,
    updatedAt: ticket.updatedAt,
    ticket: ticketData,
  };

  const roomName = `user-${ticket.userId.toString()}-tickets`;
  console.log(`[Socket Debug] broadcastTicketStatus: Sending TICKET_STATUS_UPDATED to ${roomName}`);

  // Send the specific update
  io.to(roomName).emit('TICKET_STATUS_UPDATED', payload);

  // Fallback: Notify the client to re-fetch if they missed the specific update
  io.to(roomName).emit('dataRefresh');

  // Global/Legacy broadcasts
  io.to(roomName).emit('ticketScanned', payload);
  io.emit('globalTicketUpdate', payload);
};

// Helper to save and broadcast hardware alerts from the Gate Scanner
const createHardwareAlert = async (req, message, type) => {
  try {
    const timeString = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const newAlert = new HardwareAlert({ message, type, timeString });
    await newAlert.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('hardwareAlert', {
        id: newAlert._id,
        time: timeString,
        message: newAlert.message,
        type: newAlert.type,
      });
    }
  } catch (err) {
    console.error('Failed to create hardware alert:', err);
  }
};

const getAdminStats = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // Run all 5 database queries in parallel for maximum performance
    const [totalTicketsSold, mostSoldAgg, activeUsers, purchasingUsersAgg, currentOccupancy] =
      await Promise.all([
        Ticket.countDocuments(),
        Ticket.aggregate([
          {
            $group: { _id: { type: '$ticketType', plan: '$subscriptionPlan' }, count: { $sum: 1 } },
          },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ]),
        User.countDocuments({ role: 'user' }),
        Ticket.aggregate([{ $group: { _id: '$userId' } }, { $count: 'totalPurchasingUsers' }]),
        Ticket.countDocuments({
          $or: [
            { status: 'USED', updatedAt: { $gte: startOfDay, $lte: endOfDay } },
            { scanHistory: { $elemMatch: { $gte: startOfDay, $lte: endOfDay } } },
          ],
        }),
      ]);

    let mostSoldTicket = 'None yet';
    if (mostSoldAgg.length > 0) {
      const top = mostSoldAgg[0];
      const typeCap = top._id.type
        ? top._id.type.charAt(0).toUpperCase() + top._id.type.slice(1)
        : 'Unknown';
      mostSoldTicket = `${typeCap} (${top._id.plan || 'unknown'})`;
    }

    // Extract the counted value from the aggregation array safely
    const purchasingUsers =
      purchasingUsersAgg.length > 0 ? purchasingUsersAgg[0].totalPurchasingUsers : 0;
    const maxCapacity = parseInt(process.env.DAILY_CAPACITY) || 1000;
    const capacityPercentage = Math.round((currentOccupancy / maxCapacity) * 100);

    // Prevent Response Caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      totalTicketsSold,
      mostSoldTicket,
      activeUsers,
      purchasingUsers,
      currentOccupancy: currentOccupancy,
      capacityPercentage: capacityPercentage,
      maxCapacity: maxCapacity, // Explicitly include capacity for frontend use
    });
  } catch (error) {
    console.error('Admin Stats Error:', error);
    res.status(500).json({ message: 'Server error retrieving stats' });
  }
};

const scanTicket = async (req, res) => {
  try {
    const clientIp = req.ip || 'gate-scanner';
    const scanStatus = failedScans.get(clientIp) || { count: 0, lockoutUntil: null };

    // Check if currently locked out
    if (scanStatus.lockoutUntil && new Date() < scanStatus.lockoutUntil) {
      const remaining = Math.ceil((scanStatus.lockoutUntil - new Date()) / 1000 / 60);
      return res
        .status(429)
        .json({ message: `Scanner locked. Try again in ${remaining} minute(s).` });
    } else if (scanStatus.lockoutUntil && new Date() >= scanStatus.lockoutUntil) {
      // Reset if lockout period has expired
      scanStatus.count = 0;
      scanStatus.lockoutUntil = null;
      failedScans.set(clientIp, scanStatus);
    }

    const handleFailure = async (alertMsg, alertType, resMsg, statusCode = 400) => {
      scanStatus.count += 1;
      if (scanStatus.count >= 5) {
        scanStatus.lockoutUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minute lockout
        failedScans.set(clientIp, scanStatus);
        await createHardwareAlert(
          req,
          'SECURITY LOCKOUT: Gate scanner disabled for 5 minutes due to multiple failed scans.',
          'error'
        );
        return res
          .status(429)
          .json({
            message: 'Scanner locked due to multiple failed attempts. Try again in 5 minutes.',
          });
      }
      failedScans.set(clientIp, scanStatus);
      if (alertMsg) await createHardwareAlert(req, alertMsg, alertType);
      return res.status(statusCode).json({ message: resMsg });
    };

    const handleSuccess = async (alertMsg, resMsg) => {
      failedScans.delete(clientIp); // Reset fail counter on success
      await createHardwareAlert(req, alertMsg, 'success');
      return res.status(200).json({ message: resMsg });
    };

    console.log('Attempting to scan data:', req.body.ticketId);
    let { ticketId } = req.body;

    if (!ticketId) {
      return handleFailure(null, null, 'ticketId is required');
    }

    // NEW: Handle JSON formatted QR data from email
    if (typeof ticketId === 'string' && ticketId.startsWith('{')) {
      try {
        const parsedData = JSON.parse(ticketId);
        if (parsedData.ticketId) {
          ticketId = parsedData.ticketId;
          console.log('Extracted ticketId from JSON:', ticketId);
        }
      } catch (e) {
        console.error('Failed to parse JSON QR data:', e.message);
      }
    }

    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return handleFailure(
        'Invalid QR format scanned at Gate.',
        'error',
        'Invalid Ticket ID format'
      );
    }

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return handleFailure(
        'Unrecognized Ticket ID scanned at Gate.',
        'error',
        'Ticket not found',
        404
      );
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const ticketDate = new Date(ticket.validFrom);
    ticketDate.setUTCHours(0, 0, 0, 0);

    if (ticketDate.getTime() > today.getTime()) {
      return handleFailure(
        `Premature entry attempt. Ticket valid from: ${ticketDate.toLocaleDateString()}`,
        'warning',
        `Ticket is not valid yet. Valid starting: ${ticketDate.toLocaleDateString()}`
      );
    }

    if (ticketDate.getTime() < today.getTime() && ticket.subscriptionPlan === 'one-time') {
      if (ticket.status !== 'EXPIRED') {
        ticket.status = 'EXPIRED';
        await ticket.save();
      }
      return handleFailure(
        'Expired ticket scanned at Gate.',
        'warning',
        `Ticket has expired on ${ticketDate.toLocaleDateString()}`
      );
    }

    if (ticket.status === 'EXPIRED') {
      return handleFailure('Expired ticket scanned at Gate.', 'warning', 'Ticket is expired');
    }

    // STRICT STATUS & PAYMENT CHECKS
    if (ticket.paymentStatus !== 'PAID') {
      if (ticket.paymentMethod === 'CASH') {
        return res.status(200).json({
          actionRequired: 'COLLECT_CASH',
          amountToCollect: ticket.price,
          message: 'Please collect cash to activate this ticket.',
          ticket,
        });
      }
      return handleFailure(
        'Unpaid ticket scanned at Gate.',
        'error',
        'Payment not completed for this ticket.'
      );
    }

    if (ticket.status !== 'ACTIVE') {
      if (ticket.status === 'USED') {
        return handleFailure(
          'Duplicate entry attempt: Ticket already used.',
          'warning',
          'Ticket already scanned and used.'
        );
      }
      return handleFailure(
        `Invalid ticket status: ${ticket.status}`,
        'error',
        'Invalid ticket status'
      );
    }

    const subType = ticket.subscriptionPlan || 'one-time';

    if (subType === 'monthly') {
      // Monthly pass logic: status must be ACTIVE, payment must be PAID
      // We don't mark it as USED, we just add to scanHistory
      if (!ticket.scanHistory) {
        ticket.scanHistory = [];
      }
      ticket.scanHistory.push(new Date());
      await ticket.save();

      await broadcastOccupancy(req);
      broadcastTicketStatus(req, ticket);

      return handleSuccess(
        'Monthly pass validated successfully at Gate.',
        'Monthly Pass Validated'
      );
    } else {
      // One-time ticket logic: mark as USED
      ticket.status = 'USED';
      if (!ticket.scanHistory) {
        ticket.scanHistory = [];
      }
      ticket.scanHistory.push(new Date());
      await ticket.save();

      await broadcastOccupancy(req);
      broadcastTicketStatus(req, ticket);

      return handleSuccess(
        'Ticket scanned successfully. Access granted.',
        'Ticket scanned successfully. Access granted.'
      );
    }
  } catch (error) {
    console.error('Scan Ticket Error:', error);
    await createHardwareAlert(req, 'Internal scanner error at Gate.', 'error');
    res.status(500).json({ message: 'Server error scanning ticket' });
  }
};

const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search, status } = req.query;

    // Strictly fetch only accounts with the 'user' role to separate from admins
    const query = { role: 'user' };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      const s = status.toLowerCase();
      if (s === 'active') {
        query.isRestricted = false;
      } else if (s === 'restricted') {
        query.isRestricted = true;
      }
    }

    const [usersRaw, total] = await Promise.all([
      User.find(query)
        .select('-password -savedCards')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Efficiently fetch ticket counts for all users in the current page
    const userIds = usersRaw.map((u) => u._id);
    const ticketCounts = await Ticket.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);

    const countMap = {};
    ticketCounts.forEach((c) => {
      countMap[c._id.toString()] = c.count;
    });

    const users = usersRaw.map((u) => ({
      ...u,
      ticketCount: countMap[u._id.toString()] || 0,
    }));

    res.status(200).json({
      users,
      totalUsers: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Users Error:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// @desc    Get all administrative accounts (Admin, Sub-Admin)
// @route   GET /api/admin/admins
// @access  Private (Admin)
const getAdmins = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const { search, status } = req.query;

    const query = { role: { $in: ['admin', 'sub-admin'] } };

    // Security: Non-SuperAdmins can only see their own administrative profile
    if (!isSuperAdmin(req)) {
      query._id = req.user._id;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (status) {
      const s = status.toLowerCase();
      if (s === 'active') {
        query.isRestricted = false;
      } else if (s === 'restricted') {
        query.isRestricted = true;
      }
    }

    const [adminsRaw, total] = await Promise.all([
      User.find(query)
        .select('-password -savedCards')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      users: adminsRaw,
      totalUsers: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Admins Error:', error);
    res.status(500).json({ message: 'Error fetching administrative accounts' });
  }
};

// @desc    Get all tickets for a specific user
// @route   GET /api/admin/users/:userId/tickets
// @access  Private (Admin)
const getUserTickets = async (req, res) => {
  try {
    const { userId: rawUserId } = req.params;
    const userId = (rawUserId || '').trim();

    // 1. Resolve the User
    let targetUser = await User.findById(userId).lean();
    if (!targetUser) {
      targetUser = await User.findOne({ _id: userId }).lean();
    }

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // 2. Ticket Search
    const possibleOwnerIds = [targetUser._id];
    const siblingUsers = await User.find({ email: targetUser.email }).select('_id').lean();
    siblingUsers.forEach(u => {
      if (u._id.toString() !== targetUser._id.toString()) {
        possibleOwnerIds.push(u._id);
      }
    });

    const tickets = await Ticket.find({
      userId: { $in: [...possibleOwnerIds, userId] }
    }).sort({ createdAt: -1 }).lean();

    res.status(200).json({
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
      },
      tickets: tickets || [],
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error retrieving user tickets', error: error.message });
  }
};

// @desc    Scan and expire a specific user ticket
// @route   POST /api/admin/users/:userId/tickets/:ticketId/scan
// @access  Private (Admin)
const scanUserTicket = async (req, res) => {
  try {
    const { userId: rawUserId, ticketId } = req.params;
    const userId = rawUserId.trim();

    const ticket = await Ticket.findOne({
      _id: ticketId,
      $or: [{ userId: userId }, { userId: new mongoose.Types.ObjectId(userId) }],
    });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found for this user' });

    if (ticket.status === 'USED' || ticket.status === 'EXPIRED') {
      return res.status(400).json({ message: `Ticket is already ${ticket.status}` });
    }

    // CASH PAYMENT HANDLING
    if (ticket.paymentStatus === 'PENDING' && ticket.paymentMethod === 'CASH') {
      return res.status(200).json({
        actionRequired: 'COLLECT_CASH',
        amountToCollect: ticket.price,
        message: 'Please collect cash to activate this ticket.',
        ticket,
      });
    }

    const subType = ticket.subscriptionPlan || 'one-time';
    if (subType === 'monthly') {
      // Monthly pass: don't mark as USED
    } else {
      ticket.status = 'USED';
    }

    ticket.scanHistory = ticket.scanHistory || [];
    ticket.scanHistory.push(new Date());
    await ticket.save();

    // Emit targeted socket event to the user's specific room
    const io = req.app.get('io');
    if (io) {
      const payload = {
        ticketId: ticket._id,
        status: ticket.status,
        updatedAt: ticket.updatedAt,
        ticket,
      };
      io.to(`user-${userId}-tickets`).emit('TICKET_STATUS_UPDATED', payload);
      io.to(`user-${userId}-tickets`).emit('ticketScanned', payload);
    }

    await logAdminAction(req, `Scanned ticket ${ticketId} for user ${userId}`);

    await broadcastOccupancy(req);

    res.status(200).json({ message: 'Ticket scanned successfully', ticket });
  } catch (error) {
    console.error('Scan User Ticket Error:', error);
    res.status(500).json({ message: 'Server error scanning user ticket' });
  }
};

const toggleRestrictUser = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  // Validate ObjectId to prevent CastErrors
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid User ID format' });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.email === superAdminEmail) {
      return res.status(403).json({ message: 'The Super Admin account cannot be restricted.' });
    }

    if ((user.role === 'admin' || user.role === 'sub-admin') && !isSuperAdmin(req)) {
      return res
        .status(403)
        .json({ message: 'Only the Super Admin can restrict sub-admins.' });
    }

    const originallyRestricted = user.isRestricted;
    user.isRestricted = !user.isRestricted;
    user.restrictionReason = user.isRestricted ? (reason || 'No reason provided') : '';
    await user.save();

    const io = req.app.get('io');

    // Insider Threat Detection Policy: Track admin restriction actions
    if (!originallyRestricted && user.isRestricted && req.user) {
      const admin = await User.findById(req.user._id);
      if (admin) {
        admin.restrictedAccountsCount = (admin.restrictedAccountsCount || 0) + 1;
        await admin.save();

        if (admin.restrictedAccountsCount > 5) {
          const riskId = `RISK-INSIDER-${Date.now()}`;

          await Risk.findOneAndUpdate(
            { id: riskId },
            {
              id: riskId,
              category: 'INSIDER THREAT',
              description: `Admin [${admin.email}] has restricted [${admin.restrictedAccountsCount}] users.`,
              asset: `Admin: ${admin.email}`,
              likelihood: 5,
              impact: 5,
              status: 'Open',
              recommendations: [{
                title: 'Revoke Administrative Access',
                body: 'Immediately restrict this administrator account and terminate all active sessions to prevent further unauthorized actions.',
                priority: 'Critical',
                action: 'RESOLVE_INSIDER_THREAT',
                params: { adminEmail: admin.email }
              }]
            },
            { upsert: true, new: true }
          );

          if (io) {
            io.emit('new_risk_detected', {
              message: `Insider Threat Flagged: Admin ${admin.email} has restricted ${admin.restrictedAccountsCount} users.`,
              category: 'INSIDER THREAT',
              intensity: 25
            });
          }
        }
      }
    }

    if (io) {
      io.emit('userUpdated', {
        _id: user._id.toString(),
        isRestricted: user.isRestricted,
        restrictionReason: user.restrictionReason,
      });

      if (user.isRestricted) {
        io.emit('accountRestricted', {
          userId: user._id.toString(),
          message: user.restrictionReason || 'Your account has been restricted. Please contact support.',
        });
      }

      // Global refresh signal for all admin dashboards
      io.emit('dataRefresh');
    }

    await logAdminAction(
      req,
      `${user.isRestricted ? 'Restricted' : 'Unrestricted'} user: ${user.email}${user.isRestricted ? ' Reason: ' + user.restrictionReason : ''}`
    );

    res.status(200).json({
      message: `User has been ${user.isRestricted ? 'restricted' : 'unrestricted'}`,
      isRestricted: user.isRestricted,
      restrictionReason: user.restrictionReason,
    });
  } catch (error) {
    console.error('Toggle Restrict User Fatal Error:', error);
    res.status(500).json({
      message: 'Error updating user restriction status',
      details: error.message
    });
  }
};

const resolveRisk = async (req, res) => {
  const { riskId } = req.params;

  try {
    const Risk = require('../models/Risk');
    const risk = await Risk.findOne({ id: riskId });
    if (!risk) return res.status(404).json({ message: 'Risk record not found' });

    if (risk.status === 'Resolved') {
      return res.status(400).json({ message: 'This risk is already resolved.' });
    }

    // Identify playbook action
    const bruteForceRecommendation = risk.recommendations.find(r => r.action === 'RESOLVE_BRUTE_FORCE');
    if (!bruteForceRecommendation) {
      return res.status(400).json({ message: 'No automated resolution playbook found for this risk type.' });
    }

    const { userId } = bruteForceRecommendation.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Target user not found' });

    // Execute Playbook
    // 1. Access Control: Restrict
    user.isRestricted = true;
    user.restrictionReason = 'Security incident: 2FA threshold exceeded and administrative reset executed.';

    // 2. Mandate Password Reset
    user.requiresPasswordReset = true;

    // 3. Invalidate current session (Increment Token Version)
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.otpAttempts = 0; // Reset counter for next cycle
    await user.save();

    // Track this restriction for Insider Threat detection
    if (req.user) {
      const admin = await User.findById(req.user._id);
      if (admin) {
        admin.restrictedAccountsCount = (admin.restrictedAccountsCount || 0) + 1;
        await admin.save();

        if (admin.restrictedAccountsCount > 5) {
          const riskId = `RISK-INSIDER-${Date.now()}`;
          const Risk = require('../models/Risk');

          await Risk.findOneAndUpdate(
            { id: riskId },
            {
              id: riskId,
              category: 'INSIDER THREAT',
              description: `Admin [${admin.email}] has restricted [${admin.restrictedAccountsCount}] users.`,
              asset: `Admin: ${admin.email}`,
              likelihood: 5,
              impact: 5,
              status: 'Open',
              recommendations: [{
                title: 'Revoke Administrative Access',
                body: 'Immediately restrict this administrator account and terminate all active sessions to prevent further unauthorized actions.',
                priority: 'Critical',
                action: 'RESOLVE_INSIDER_THREAT',
                params: { adminEmail: admin.email }
              }]
            },
            { upsert: true, new: true }
          );

          const io = req.app.get('io');
          if (io) {
            io.emit('new_risk_detected', {
              message: `Insider Threat Flagged: Admin ${admin.email} has restricted ${admin.restrictedAccountsCount} users.`,
              category: 'INSIDER THREAT',
              intensity: 25
            });
          }
        }
      }
    }

    // 4. Real-time Logout (Socket.io)
    const io = req.app.get('io');
    if (io) {
      const targetedRoom = `user-${user._id.toString()}-tickets`;
      io.to(targetedRoom).emit('force_logout', {
        userId: user._id.toString(),
        email: user.email.toLowerCase(),
        message: 'Your account has been restricted for security reasons. Please contact an administrator and reset your password.',
      });
    }

    // 5. Update Risk State
    risk.status = 'Resolved';
    risk.resolvedAt = new Date();
    risk.resolvedBy = req.user.email;
    await risk.save();

    await logAdminAction(
      req,
      `Executed Security Playbook for Risk ${riskId}: Restricted user ${user.email} and mandated password reset.`
    );

    res.status(200).json({
      message: `Security playbook executed successfully. User ${user.email} restricted and sessions terminated.`,
      user: { email: user.email, isRestricted: user.isRestricted }
    });
  } catch (error) {
    console.error('Resolve Risk Error:', error);
    res.status(500).json({ message: 'Error executing security playbook' });
  }
};

const resolveInsiderThreat = async (req, res) => {
  const { riskId } = req.params;

  try {
    const Risk = require('../models/Risk');
    const risk = await Risk.findOne({ id: riskId });
    if (!risk) return res.status(404).json({ message: 'Risk record not found' });

    if (risk.status === 'Resolved') {
      return res.status(400).json({ message: 'This risk is already resolved.' });
    }

    if (risk.category !== 'INSIDER THREAT') {
      return res.status(400).json({ message: 'This endpoint is specifically for Insider Threat resolution.' });
    }

    // Extract admin email from description: "Admin [email@example.com] has restricted [X] users."
    const emailMatch = risk.description.match(/\[(.*?)\]/);
    if (!emailMatch || !emailMatch[1]) {
      return res.status(400).json({ message: 'Offending admin email could not be parsed from risk description.' });
    }
    const adminEmail = emailMatch[1];

    const offendingAdmin = await User.findOne({ email: adminEmail });
    if (!offendingAdmin) {
      return res.status(404).json({ message: `Offending admin [${adminEmail}] not found in database.` });
    }

    // Security Check: Even a Super Admin can't restrict themselves via this route
    if (offendingAdmin.email === superAdminEmail) {
      return res.status(403).json({ message: 'Critical protection error: The Super Admin account cannot be restricted.' });
    }

    // 1. Restrict Account
    offendingAdmin.isRestricted = true;
    offendingAdmin.restrictionReason = `Insider Threat Manual Intervention: High volume account restriction activity detected and confirmed by ${req.user.email}.`;

    // 2. Terminate Sessions
    offendingAdmin.tokenVersion = (offendingAdmin.tokenVersion || 0) + 1;
    await offendingAdmin.save();

    // 3. Real-time Kick-out
    const io = req.app.get('io');
    if (io) {
      const targetedRoom = `user-${offendingAdmin._id.toString()}-tickets`;
      io.to(targetedRoom).emit('force_logout', {
        userId: offendingAdmin._id.toString(),
        email: offendingAdmin.email.toLowerCase(),
        message: 'Your administrative access has been revoked due to an Insider Threat flag. Your session has been terminated.',
      });
      // Global refresh for dashboards
      io.emit('dataRefresh');
    }

    // 4. Update Risk Status
    risk.status = 'Resolved';
    risk.resolvedAt = new Date();
    risk.resolvedBy = req.user.email;
    await risk.save();

    await logAdminAction(
      req,
      `Resolved Insider Threat ${riskId}: Revoked administrative access for ${adminEmail}.`
    );

    res.status(200).json({
      message: `Insider threat neutralized. Admin ${adminEmail} restricted and sessions terminated.`,
      status: 'Resolved'
    });
  } catch (error) {
    console.error('Resolve Insider Threat Error:', error);
    res.status(500).json({ message: 'Error resolving insider threat security risk' });
  }
};

const createSubAdmin = async (req, res) => {
  try {
    const { name, email, password, ipAddress, macAddress } = req.body;

    // Strict validation to reject null, undefined, or empty strings
    if (!name || !email || !password || !ipAddress ||
      name.trim() === '' || email.trim() === '' || password.trim() === '' || ipAddress.trim() === '') {
      return res
        .status(400)
        .json({ message: 'Name, email, password, and bound IP Address are required and cannot be empty' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const ipExists = await WhitelistedIP.findOne({ ipAddress });
    if (ipExists) {
      return res
        .status(400)
        .json({ message: 'This IP Address is already in use by another whitelist entry' });
    }

    const emailWhitelisted = await WhitelistedIP.findOne({ adminEmail: email });
    if (emailWhitelisted) {
      return res.status(400).json({ message: 'This email is already bound to a whitelisted IP' });
    }

    const newAdmin = new User({
      name,
      email,
      phone: 'N/A',
      password, // Hashing is handled by the User model's pre-save middleware
      age: 30,
      role: 'sub-admin',
    });

    await newAdmin.save();

    const newIP = await WhitelistedIP.create({
      ipAddress,
      macAddress: macAddress || '',
      description: `Sub-Admin: ${name}`,
      adminEmail: email,
    });

    const io = req.app.get('io');
    if (io) {
      // Instantly display the new admin on the dashboard
      const safeUser = {
        _id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        phone: newAdmin.phone,
        role: newAdmin.role,
        isRestricted: newAdmin.isRestricted,
        hasDisability: newAdmin.hasDisability,
        createdAt: newAdmin.createdAt,
      };
      io.emit('subAdminCreated', safeUser);
      io.emit('whitelistIpAdded', newIP);
    }

    await logAdminAction(req, `Provisioned new sub-admin: ${email}`);
    res.status(201).json({ message: 'Sub-Admin successfully provisioned and bound to network.' });
  } catch (error) {
    console.error('Create Sub-Admin Error:', error);
    res.status(500).json({ message: 'Error creating sub-admin' });
  }
};

const forceLogoutAnd2FA = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid User ID format' });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role !== 'admin' && user.role !== 'sub-admin') {
      return res.status(400).json({ message: 'This operation is restricted to administrative accounts.' });
    }

    // 1. Force 2FA on next login by simulating extreme inactivity
    user.lastLogin = new Date(0); // Set to 1970 to guarantee it triggers the 10-day inactivity 2FA
    user.twoFactorExpires = null; // Invalidate any "Remember Me" period
    user.otpAttempts = 0;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate current JWT
    await user.save();

    // 2. Emit socket event specifically to the user's room for instant logout
    const io = req.app.get('io');
    if (io) {
      const targetedRoom = `user-${user._id.toString()}-tickets`;
      io.to(targetedRoom).emit('force_logout', {
        userId: user._id.toString(),
        email: user.email.toLowerCase(),
        message: 'A security reset was triggered by an administrator. Your session has been terminated and 2FA is now required.',
      });
    }

    await logAdminAction(
      req,
      `Triggered emergency security reset and forced logout for administrative account: ${user.email}`
    );

    res.status(200).json({
      message: `Emergency reset successful. ${user.name}'s session has been invalidated and 2FA is now mandated.`,
    });
  } catch (error) {
    console.error('Force Logout Error:', error);
    res.status(500).json({ message: 'Error triggering forced logout' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userCheck = await User.findById(req.params.id);
    if (!userCheck) return res.status(404).json({ message: 'User not found' });
    if (userCheck.email === superAdminEmail) {
      return res.status(403).json({ message: 'The Super Admin account cannot be deleted.' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Cascade delete user tickets to accurately update park stats
    await Ticket.deleteMany({ userId: user._id });

    const io = req.app.get('io');

    // Automatically clean up the IP Whitelist if a Sub-Admin is deleted
    if (user.role === 'admin' || user.role === 'sub-admin') {
      const deletedIp = await WhitelistedIP.findOneAndDelete({ adminEmail: user.email });
      if (io && deletedIp) io.emit('whitelistIpRemoved', deletedIp._id);
    }

    if (io) {
      if (user.role === 'admin' || user.role === 'sub-admin') {
        io.emit('subAdminDeleted', user._id.toString());
      } else {
        io.emit('userDeleted', user._id.toString());
      }

      // Broadcast updated ticket stats
      const [totalTicketsSold, purchasingUsersAgg, mostSoldAgg, salesAgg] = await Promise.all([
        Ticket.countDocuments(),
        Ticket.aggregate([{ $group: { _id: '$userId' } }, { $count: 'totalPurchasingUsers' }]),
        Ticket.aggregate([
          {
            $group: { _id: { type: '$ticketType', plan: '$subscriptionPlan' }, count: { $sum: 1 } },
          },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ]),
        Ticket.aggregate([
          { $match: { status: { $ne: 'cancelled' } } },
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
    }

    await logAdminAction(req, `Deleted user account: ${userCheck.email}`);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete User Error:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

const resetOccupancy = async (req, res) => {
  try {
    const result = await Ticket.updateMany({ status: 'USED' }, { $set: { status: 'EXPIRED' } });

    await broadcastOccupancy(req);

    await logAdminAction(
      req,
      `Manually reset park occupancy. Archived ${result.modifiedCount} tickets.`
    );
    res.status(200).json({
      message:
        'Park occupancy has been reset successfully. All used tickets are now archived/expired.',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error('Reset Occupancy Error:', error);
    res.status(500).json({ message: 'Server error while resetting occupancy' });
  }
};

const getHardwareAlerts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.date) {
      const startOfDay = new Date(req.query.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(req.query.date);
      endOfDay.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: startOfDay, $lte: endOfDay };
    }

    if (req.query.type && req.query.type !== 'all') {
      query.type = req.query.type;
    }

    const [alerts, total] = await Promise.all([
      HardwareAlert.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      HardwareAlert.countDocuments(query),
    ]);

    res.status(200).json({
      alerts,
      totalAlerts: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Alerts Error:', error);
    res.status(500).json({ message: 'Error fetching hardware alerts' });
  }
};

const unlockScanner = async (req, res) => {
  try {
    failedScans.clear();
    await createHardwareAlert(req, 'Admin manually unlocked the gate scanner.', 'info');
    await logAdminAction(req, 'Manually unlocked the gate scanner.');
    res.status(200).json({ message: 'Scanner unlocked successfully.' });
  } catch (error) {
    console.error('Unlock Scanner Error:', error);
    res.status(500).json({ message: 'Error unlocking scanner' });
  }
};

const getAuditLogs = async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Super Admin access required.' });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AdminAuditLog.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminAuditLog.countDocuments(),
    ]);

    res.status(200).json({
      logs,
      totalLogs: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Audit Logs Error:', error);
    res.status(500).json({ message: 'Error fetching audit logs' });
  }
};

const getBannedIPs = async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ message: 'Super Admin access required.' });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.search) {
      query.$or = [
        { ipAddress: { $regex: req.query.search, $options: 'i' } },
        { reason: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [bannedIPs, total] = await Promise.all([
      BannedIP.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      BannedIP.countDocuments(query),
    ]);

    res.status(200).json({
      bannedIPs,
      totalBannedIPs: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Banned IPs Error:', error);
    res.status(500).json({ message: 'Error fetching banned IPs' });
  }
};

const unbanIP = async (req, res) => {
  try {
    const deleted = await BannedIP.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Banned IP not found' });

    const io = req.app.get('io');
    if (io) io.emit('bannedIpRemoved', req.params.id);

    await logAdminAction(req, `Unbanned IP Address: ${deleted.ipAddress}`);
    res.status(200).json({ message: 'IP unbanned successfully' });
  } catch (error) {
    console.error('Unban IP Error:', error);
    res.status(500).json({ message: 'Error unbanning IP' });
  }
};

const getWhitelistedIPs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.search) {
      query.$or = [
        { ipAddress: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [ips, total] = await Promise.all([
      WhitelistedIP.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WhitelistedIP.countDocuments(query),
    ]);

    res.status(200).json({
      ips,
      totalIps: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Whitelist Error:', error);
    res.status(500).json({ message: 'Error fetching whitelisted IPs' });
  }
};

const addWhitelistedIP = async (req, res) => {
  try {
    const { ipAddress, description, macAddress } = req.body;
    if (!ipAddress) return res.status(400).json({ message: 'IP Address is required' });

    const exists = await WhitelistedIP.findOne({ ipAddress });
    if (exists) return res.status(400).json({ message: 'IP is already whitelisted' });

    const newIP = await WhitelistedIP.create({ ipAddress, description, macAddress });
    const io = req.app.get('io');
    if (io) io.emit('whitelistIpAdded', newIP);

    await logAdminAction(req, `Whitelisted IP Address: ${ipAddress}`);
    res.status(201).json(newIP);
  } catch (error) {
    console.error('Add Whitelist Error:', error);
    res.status(500).json({ message: 'Error adding to whitelist' });
  }
};

const removeWhitelistedIP = async (req, res) => {
  try {
    const deleted = await WhitelistedIP.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Whitelisted IP not found' });

    // If the removed IP was bound to a sub-admin, we must also delete the sub-admin
    // to prevent orphaning their account, which would make them unable to log in.
    if (deleted.adminEmail) {
      const subAdminUser = await User.findOneAndDelete({
        email: deleted.adminEmail,
        role: 'admin',
      });
      if (subAdminUser) {
        // Also cascade delete their tickets to keep stats accurate
        await Ticket.deleteMany({ userId: subAdminUser._id });
        const io = req.app.get('io');
        if (io) io.emit('subAdminDeleted', subAdminUser._id);
        await logAdminAction(
          req,
          `Deleted sub-admin account (${deleted.adminEmail}) due to IP whitelist removal.`
        );
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('whitelistIpRemoved', req.params.id);

    await logAdminAction(req, `Removed Whitelisted IP: ${deleted.ipAddress}`);
    res.status(200).json({ message: 'IP removed from whitelist' });
  } catch (error) {
    console.error('Remove Whitelist Error:', error);
    res.status(500).json({ message: 'Error removing IP from whitelist' });
  }
};

const getMonthlySales = async (req, res) => {
  try {
    const matchStage = { status: { $ne: 'cancelled' } };

    if (req.query.startDate || req.query.endDate) {
      matchStage.createdAt = {};
      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        start.setHours(0, 0, 0, 0);
        matchStage.createdAt.$gte = start;
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setMonth(end.getMonth() + 1); // Move to next month
        end.setDate(0); // Roll back 1 day to get the last day of the specified month
        end.setHours(23, 59, 59, 999);
        matchStage.createdAt.$lte = end;
      }
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          totalTickets: { $sum: 1 },
          revenue: { $sum: '$price' },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ];

    // Only limit to 12 months if no custom date range is provided
    if (!req.query.startDate && !req.query.endDate) {
      pipeline.push({ $limit: 12 });
    }

    const sales = await Ticket.aggregate(pipeline);

    const formattedSales = sales
      .map((s) => ({
        month: new Date(s._id.year, s._id.month - 1).toLocaleString('default', {
          month: 'short',
          year: 'numeric',
        }),
        totalTickets: s.totalTickets,
        revenue: s.revenue,
      }))
      .reverse(); // Reverse for chronological order (left to right) in the chart

    // Prevent Response Caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json(formattedSales);
  } catch (error) {
    console.error('Monthly Sales Error:', error);
    res.status(500).json({ message: 'Error fetching monthly sales' });
  }
};

const clearAuditLogs = async (req, res) => {
  try {
    let query = {};
    if (req.query.olderThan) {
      const days = parseInt(req.query.olderThan, 10);
      if (!isNaN(days)) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        query = { createdAt: { $lt: cutoffDate } };
      }
    }

    await AdminAuditLog.deleteMany(query);

    const io = req.app.get('io');
    if (io) {
      io.emit('auditLogsCleared', { partial: !!req.query.olderThan });
    }

    await logAdminAction(
      req,
      `Cleared security audit logs${req.query.olderThan ? ` older than ${req.query.olderThan} days` : ' (All)'}`
    );
    res.status(200).json({ message: 'Audit logs cleared successfully' });
  } catch (error) {
    console.error('Clear Audit Logs Error:', error);
    res.status(500).json({ message: 'Error clearing audit logs' });
  }
};

const clearHardwareAlerts = async (req, res) => {
  try {
    let query = {};
    if (req.query.olderThan) {
      const days = parseInt(req.query.olderThan, 10);
      if (!isNaN(days)) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        query = { createdAt: { $lt: cutoffDate } };
      }
    }

    await HardwareAlert.deleteMany(query);

    const io = req.app.get('io');
    if (io) {
      io.emit('hardwareAlertsCleared', { partial: !!req.query.olderThan });
    }

    await logAdminAction(
      req,
      `Cleared hardware alerts${req.query.olderThan ? ` older than ${req.query.olderThan} days` : ' (All)'}`
    );
    res.status(200).json({ message: 'Hardware alerts cleared successfully' });
  } catch (error) {
    console.error('Clear Hardware Alerts Error:', error);
    res.status(500).json({ message: 'Error clearing hardware alerts' });
  }
};

const createBackup = (req, res) => {
  // Resolve path to the backend/backups folder
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  const date = new Date();
  const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
  const archivePath = path.join(backupDir, `smart-park-manual-${timestamp}.gzip`);
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';

  const runJSBackup = async () => {
    try {
      const zlib = require('zlib');
      const models = mongoose.modelNames();
      const backupData = {};
      
      for (const modelName of models) {
        const model = mongoose.model(modelName);
        const docs = await model.find({}).lean();
        backupData[modelName] = docs;
      }
      
      const jsonString = JSON.stringify(backupData, null, 2);
      const gzipBuffer = zlib.gzipSync(jsonString);
      fs.writeFileSync(archivePath, gzipBuffer);
      
      await logAdminAction(
        req,
        `Created manual database backup (JS Fallback): smart-park-manual-${timestamp}.gzip`
      );
      res.status(200).json({ message: 'Database backed up successfully (using JS fallback)!' });
    } catch (jsErr) {
      console.error('JS Backup Fallback failed:', jsErr);
      res.status(500).json({ message: 'Backup failed to complete.' });
    }
  };

  let hasResponded = false;

  // Use spawn instead of exec to prevent command injection
  const child = spawn('mongodump', [
    `--uri=${mongoUri}`,
    `--archive=${archivePath}`,
    '--gzip',
  ]);

  let stderrData = '';
  child.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  child.on('close', async (code) => {
    if (hasResponded) return;
    if (code !== 0) {
      console.warn(`mongodump failed with code ${code}. Trying JS backup fallback...`);
      hasResponded = true;
      return runJSBackup();
    }

    hasResponded = true;
    await logAdminAction(
      req,
      `Created manual database backup: smart-park-manual-${timestamp}.gzip`
    );
    res.status(200).json({ message: 'Database backed up successfully!' });
  });

  child.on('error', (err) => {
    if (hasResponded) return;
    console.warn('mongodump failed to start. Trying JS backup fallback...', err.message);
    hasResponded = true;
    runJSBackup();
  });
};

const getBackups = (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) return res.json({
      backups: [],
      totalBackups: 0,
      currentPage: 1,
      totalPages: 1
    });

    const allFiles = fs
      .readdirSync(backupDir)
      .filter((file) => file.endsWith('.gzip'))
      .map((file) => {
        const stats = fs.statSync(path.join(backupDir, file));
        return {
          filename: file,
          size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          createdAt: stats.ctime,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = allFiles.length;
    const paginatedFiles = allFiles.slice(skip, skip + limit);

    res.status(200).json({
      backups: paginatedFiles,
      totalBackups: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Backups Error:', error);
    res.status(500).json({ message: 'Error fetching backups' });
  }
};

const downloadBackup = (req, res) => {
  try {
    const filename = req.params.filename;
    if (
      !filename ||
      !filename.endsWith('.gzip') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return res.status(400).json({ message: 'Invalid or unauthorized filename' });
    }
    const filePath = path.join(__dirname, '../backups', filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }
    res.download(filePath);
  } catch (error) {
    console.error('Download Backup Error:', error);
    res.status(500).json({ message: 'Error downloading backup' });
  }
};

const deleteBackup = async (req, res) => {
  try {
    const filename = req.params.filename;
    if (
      !filename ||
      !filename.endsWith('.gzip') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return res.status(400).json({ message: 'Invalid or unauthorized filename' });
    }
    const filePath = path.join(__dirname, '../backups', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      await logAdminAction(req, `Deleted database backup: ${filename}`);
    }
    res.status(200).json({ message: 'Backup deleted successfully' });
  } catch (error) {
    console.error('Delete Backup Error:', error);
    res.status(500).json({ message: 'Error deleting backup' });
  }
};

const restoreBackup = async (req, res) => {
  try {
    const filename = req.params.filename;
    if (
      !filename ||
      !filename.endsWith('.gzip') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      return res.status(400).json({ message: 'Invalid or unauthorized filename' });
    }
    const backupDir = path.join(__dirname, '../backups');
    const filePath = path.join(backupDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Backup file not found' });
    }

    const zlib = require('zlib');
    const fileBuffer = fs.readFileSync(filePath);
    let decompressed;
    try {
      decompressed = zlib.gunzipSync(fileBuffer);
    } catch (gzipErr) {
      return res.status(400).json({ message: 'Failed to decompress backup file' });
    }

    let backupData;
    let isJson = true;
    try {
      backupData = JSON.parse(decompressed.toString('utf8'));
    } catch (jsonErr) {
      isJson = false;
    }

    const ensureAccessAfterRestore = async () => {
      // Re-run initAdmin logic to make sure the superadmin exists
      try {
        const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
        const adminExists = await User.findOne({ email: superAdminEmail });
        if (!adminExists) {
          const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
          await User.create({
            name: 'System Administrator',
            email: superAdminEmail,
            phone: 'N/A',
            password: adminPassword,
            age: 30,
            role: 'admin',
            isVerified: true,
            hasDisability: false,
          });
          console.log('Post-restore: Admin user verified/created');
        }
      } catch (error) {
        console.error('Post-restore: Failed to initialize admin account:', error);
      }

      // Re-run initWhitelist to ensure localhost loopbacks are whitelisted
      try {
        const defaultIPs = [
          { ipAddress: '127.0.0.1', description: 'Localhost IPv4' },
          { ipAddress: '::1', description: 'Localhost IPv6' },
          { ipAddress: '::ffff:127.0.0.1', description: 'Localhost IPv4 mapped IPv6' }
        ];
        for (const ip of defaultIPs) {
          const exists = await WhitelistedIP.findOne({ ipAddress: ip.ipAddress });
          if (!exists) {
            await WhitelistedIP.create(ip);
            console.log(`Post-restore: Whitelisted local IP: ${ip.ipAddress}`);
          }
        }
      } catch (error) {
        console.error('Post-restore: Failed to initialize Whitelisted IPs:', error);
      }

      // Proactively whitelist the current requesting administrator's IP address
      try {
        const clientIp = req.ip || req.connection.remoteAddress;
        if (clientIp) {
          const exists = await WhitelistedIP.findOne({ ipAddress: clientIp });
          if (!exists) {
            await WhitelistedIP.create({
              ipAddress: clientIp,
              description: `Restoring Administrator Session IP (${req.user?.email || 'Unknown'})`
            });
            console.log(`Post-restore: Whitelisted restoring admin IP: ${clientIp}`);
          }
        }
      } catch (error) {
        console.error('Post-restore: Failed to auto-whitelist client IP:', error);
      }
    };

    if (isJson) {
      // Ensure all models are loaded
      const modelsToLoad = [
        'AdminAuditLog',
        'Backup',
        'BannedIP',
        'ComplianceControl',
        'HardwareAlert',
        'OTP',
        'PromoCode',
        'Risk',
        'Telemetry',
        'Ticket',
        'User',
        'WhitelistedIP'
      ];
      modelsToLoad.forEach(m => {
        try {
          require(`../models/${m}`);
        } catch (e) {}
      });

      // Loop through Mongoose models in backupData and replace current records
      for (const modelName of Object.keys(backupData)) {
        try {
          const Model = mongoose.model(modelName);
          await Model.deleteMany({});
          const docs = backupData[modelName];
          if (docs && docs.length > 0) {
            await Model.insertMany(docs);
          }
        } catch (modelErr) {
          console.error(`Failed to restore model ${modelName}:`, modelErr);
        }
      }

      // Ensure access
      await ensureAccessAfterRestore();

      await logAdminAction(
        req,
        `Restored database from backup (JS Fallback): ${filename}`
      );

      // Emit dataRefresh via socket
      const io = req.app.get('io');
      if (io) io.emit('dataRefresh');

      return res.status(200).json({ message: 'Database successfully restored (using JS Fallback)!' });
    } else {
      // Run mongorestore as binary fallback
      const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-park';
      const child = spawn('mongorestore', [
        `--uri=${mongoUri}`,
        `--archive=${filePath}`,
        '--gzip',
        '--drop',
      ]);

      let stderrData = '';
      child.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      child.on('close', async (code) => {
        if (code !== 0) {
          console.error(`mongorestore failed with code ${code}:`, stderrData);
          return res.status(500).json({ message: `Restore failed: mongorestore exited with code ${code}` });
        }

        // Ensure access
        await ensureAccessAfterRestore();

        await logAdminAction(
          req,
          `Restored database from backup: ${filename}`
        );

        // Emit dataRefresh via socket
        const io = req.app.get('io');
        if (io) io.emit('dataRefresh');

        return res.status(200).json({ message: 'Database successfully restored!' });
      });

      child.on('error', (err) => {
        console.error('mongorestore failed to start:', err.message);
        return res.status(500).json({ message: `Restore failed to start: ${err.message}` });
      });
    }
  } catch (error) {
    console.error('Restore Backup Error:', error);
    res.status(500).json({ message: 'Error restoring backup' });
  }
};


// @desc    Generate comprehensive mock data for the system
// @route   POST /api/admin/generate-mock-data
// @access  Private (Super Admin)
const generateMockData = async (req, res) => {
  try {
    // 0. PARAMETERIZED SCALE CONFIGURATION
    const dailyCapacity = parseInt(process.env.DAILY_CAPACITY) || 1000;

    const SCALE = {
      multiplier: 1.0,           // Adjust this to scale everything (e.g., 2.0 doubles volume)
      baseUserCount: Math.floor(dailyCapacity * 0.4), // Scale users relative to capacity
      adminCount: 10,            // Number of sub-admins
      historicalMonths: 12,      // How many months back to spread history
      ticketsPerMonth: Math.floor(dailyCapacity * 0.12), // Historical volume
      ticketsPerDayWeek: Math.floor(dailyCapacity * 0.35), // Scale current week volume to ~35% of capacity
      occupancyRate: 0.8,        // 80% of today's tickets will be 'used' (Occupancy)
      alertCount: 40,            // Hardware alerts
      auditCount: 60,            // Security audit logs
    };

    const targetUserCount = Math.floor(SCALE.baseUserCount * SCALE.multiplier);
    const targetHistoryTickets = Math.floor(SCALE.ticketsPerMonth * SCALE.historicalMonths * SCALE.multiplier);
    const targetWeekTickets = Math.floor(SCALE.ticketsPerDayWeek * 7 * SCALE.multiplier);

    console.log(`[MockDataHammer] Starting scaled seeding (${SCALE.multiplier}x)...`);

    // 1. CLEAR SLATE (Only for mock data to avoid destroying real data)
    try {
      await User.deleteMany({ email: /mockuser.*@example\.com/ });
      await Ticket.deleteMany({
        userId: { $nin: await User.find({ email: { $not: /mockuser.*@example\.com/ } }).select('_id') },
      });
      await HardwareAlert.deleteMany({ message: /Simulation alert/ });
      await AdminAuditLog.deleteMany({ email: /mockuser.*@example\.com/ });
      await BannedIP.deleteMany({ reason: /Simulation/ });
      await WhitelistedIP.deleteMany({ description: /Simulation/ });
      await PromoCode.deleteMany({ code: /MOCK/ });

      console.log('[MockDataHammer] Step 1: Cleared existing simulation data.');
    } catch (e) {
      console.error('[MockDataHammer] FAILED Step 1 (Clear):', e.message);
    }

    // 2. GENERATE USERS
    const names = [
      'James Smith', 'Maria Garcia', 'Robert Johnson', 'Maria Rodriguez', 'David Smith',
      'Mary Smith', 'Maria Hernandez', 'Maria Martinez', 'James Johnson', 'Robert Smith',
      'Michael Smith', 'Maria Lopez', 'David Johnson', 'Mary Johnson', 'William Smith',
      'Maria Gonzalez', 'Michael Johnson', 'James Williams', 'Mary Garcia', 'Maria Perez',
    ];
    const hashedPassword = await bcrypt.hash('password123', 12);

    const userDocs = [];
    const totalUsersToCreate = targetUserCount + SCALE.adminCount;
    for (let i = 0; i < totalUsersToCreate; i++) {
      const isLastFew = i >= targetUserCount;
      userDocs.push({
        name: names[i % names.length] + ' ' + (i + 1),
        email: `mockuser${i + 1}@example.com`,
        phone: `01${Math.floor(Math.random() * 900000000 + 100000000)}`,
        password: hashedPassword,
        age: Math.floor(Math.random() * 60 + 18),
        role: isLastFew ? 'admin' : 'user',
        isVerified: true,
        isRestricted: !isLastFew && Math.random() > 0.95,
        restrictionReason: !isLastFew && Math.random() > 0.95 ? 'Simulation: Automated restriction' : '',
        hasDisability: Math.random() > 0.9,
      });
    }

    const savedUsers = await User.insertMany(userDocs);
    const regularUsers = savedUsers.filter((u) => u.role === 'user');
    const adminUsers = savedUsers.filter((u) => u.role === 'admin');
    console.log(`[MockDataHammer] Step 2: Created ${savedUsers.length} users.`);

    // 3. GENERATE TICKETS
    const ticketTypes = ['child', 'adult', 'senior'];
    const plans = ['one-time', 'monthly'];
    const ticketStatuses = ['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'];
    const ticketPrices = { child: 100, adult: 200, senior: 150 };

    const ticketDocs = [];
    const now = new Date();

    // Task A: Historical Spread
    for (let m = 0; m < SCALE.historicalMonths; m++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 15);
      const ticketsInMonth = Math.floor(SCALE.ticketsPerMonth * SCALE.multiplier);

      for (let t = 0; t < ticketsInMonth; t++) {
        const user = regularUsers[Math.floor(Math.random() * regularUsers.length)];
        const plan = plans[Math.floor(Math.random() * plans.length)];
        const status = ticketStatuses[Math.floor(Math.random() * ticketStatuses.length)];
        const type = ticketTypes[Math.floor(Math.random() * ticketTypes.length)];

        let validFrom = new Date(monthDate);
        validFrom.setDate(Math.floor(Math.random() * 28) + 1);
        let validUntil = new Date(validFrom);

        if (plan === 'monthly') {
          validUntil.setDate(validFrom.getDate() + 30);
        } else {
          validUntil.setHours(23, 59, 59, 999);
        }

        const isCash = Math.random() > 0.7; // 30% are cash payments

        ticketDocs.push({
          userId: user._id,
          ticketType: type,
          subscriptionPlan: plan,
          price: ticketPrices[type] + (plan === 'monthly' ? 1000 : 0),
          status: status,
          validFrom,
          validUntil,
          paymentMethod: isCash ? 'CASH' : 'ONLINE',
          paymentStatus: 'PAID', // History is always paid
          createdAt: new Date(validFrom),
          updatedAt: new Date(validFrom), // Logical historical timestamps
        });
      }
    }

    // Task B: Current Week Cluster (High Volume)
    for (let d = 0; d < 7; d++) {
      const ticketsInDay = Math.floor(SCALE.ticketsPerDayWeek * SCALE.multiplier);

      for (let i = 0; i < ticketsInDay; i++) {
        const user = regularUsers[Math.floor(Math.random() * regularUsers.length)];
        const type = ticketTypes[Math.floor(Math.random() * ticketTypes.length)];

        const validFrom = new Date();
        validFrom.setDate(validFrom.getDate() + d);
        validFrom.setHours(0, 0, 0, 0);

        const validUntil = new Date(validFrom);
        validUntil.setHours(23, 59, 59, 999);

        // Logical occupancy for today vs future
        let currentStatus = 'ACTIVE';
        if (d === 0) {
          // Today: Apply high occupancy rate to simulate "busy" dashboard
          if (Math.random() < SCALE.occupancyRate) {
            currentStatus = 'USED';
          }
        } else {
          // Future: Some may already be cancelled or used (if simulated scan history existed)
          if (Math.random() > 0.9) currentStatus = 'CANCELLED';
        }

        const isCash = Math.random() > 0.7; // 30% are cash payments

        ticketDocs.push({
          userId: user._id,
          ticketType: type,
          subscriptionPlan: 'one-time',
          price: ticketPrices[type],
          status: isCash ? 'INACTIVE' : currentStatus,
          paymentMethod: isCash ? 'CASH' : 'ONLINE',
          paymentStatus: isCash ? 'PENDING' : 'PAID',
          validFrom,
          validUntil,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    const savedTickets = await Ticket.insertMany(ticketDocs, { timestamps: false });
    console.log(`[MockDataHammer] Step 3: Created ${savedTickets.length} tickets total.`);

    // 4. GENERATE HARDWARE ALERTS
    const alertTemplates = [
      { message: 'System initialized: Environmental Matrix online', type: 'success' },
      { message: 'Authentication Link: Access Control ready', type: 'info' },
      { message: 'Security Scan: Pathway Motion operational', type: 'info' },
      { message: 'Light Management: Ambient sensors calibrated', type: 'success' },
    ];
    const sensorsList = [
      'Gate Ultrasonic',
      'Gate Servo',
      'LDR',
      'LED Lamp',
      'Soil Moisture',
      'Water Pump',
      'DHT11',
      'RGB Ultrasonic',
      'RGB LED',
    ];
    const alertDocs = [];
    const totalAlerts = Math.floor(SCALE.alertCount * SCALE.multiplier);
    for (let l = 0; l < totalAlerts; l++) {
      const tpl = alertTemplates[l % alertTemplates.length];
      const sensor = sensorsList[l % sensorsList.length];
      alertDocs.push({
        sensor,
        message: tpl.message,
        type: tpl.type,
        timeString: new Date().toLocaleTimeString(),
      });
    }
    await HardwareAlert.insertMany(alertDocs);
    console.log(`[MockDataHammer] Step 4: Created ${alertDocs.length} hardware alerts.`);

    // 5. GENERATE ADMIN AUDIT LOGS
    const auditDocs = [];
    const actions = [
      'Scanned ticket',
      'Blocked user',
      'Created sub-admin',
      'Cleared occupancy',
      'Downloaded backup',
      'Updated system settings',
    ];
    const totalAudits = Math.floor(SCALE.auditCount * SCALE.multiplier);
    for (let a = 0; a < totalAudits; a++) {
      const admin = adminUsers[Math.floor(Math.random() * adminUsers.length)];
      auditDocs.push({
        email: admin?.email || 'system@smartpark.com',
        ipAddress: `192.168.1.${100 + (a % 150)}`,
        status: Math.random() > 0.1 ? 'success' : 'failed',
        statusCode: Math.random() > 0.1 ? 200 : 403,
        action: actions[Math.floor(Math.random() * actions.length)],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        createdAt: new Date(now.getTime() - Math.random() * 1000000000),
      });
    }
    await AdminAuditLog.insertMany(auditDocs);
    console.log(`[MockDataHammer] Step 5: Created ${auditDocs.length} audit logs.`);

    // 6. GENERATE BANNED & WHITELISTED IPS
    const bannedDocs = [];
    const whitelistDocs = [];
    for (let i = 0; i < 15; i++) {
      bannedDocs.push({
        ipAddress: `10.0.0.${10 + i}`,
        reason: 'Simulation: Brute force attempt',
      });
      whitelistDocs.push({
        ipAddress: `172.16.0.${50 + i}`,
        description: 'Simulation: Remote Office IP',
        macAddress: `00:1A:2B:3C:4D:${i.toString(16).padStart(2, '0')}`,
      });
    }
    await BannedIP.insertMany(bannedDocs);
    await WhitelistedIP.insertMany(whitelistDocs);
    console.log('[MockDataHammer] Step 6: Created banned and whitelisted IPs.');

    // 7. Trigger Global Refresh
    const io = req.app.get('io');
    if (io) {
      io.emit('dataRefresh');
      io.emit('dashboardStatsUpdated');
      io.emit('crowdDataUpdated');
    }

    res.status(200).json({
      message: `Scalable simulation seeding complete! (${SCALE.multiplier}x)
      - Users: ${savedUsers.length}
      - Tickets: ${savedTickets.length} (History + 7-Day Cluster)
      - Hardware Alerts: ${alertDocs.length}
      - Audit Logs: ${auditDocs.length}
      - IP Security: ${bannedDocs.length} Banned / ${whitelistDocs.length} Whitelisted`,
    });
  } catch (error) {
    console.error('[MockDataHammer] CRITICAL ERROR:', error.message);
    res.status(500).json({ message: 'Failed to generate mock data', error: error.message });
  }
};

const activateCashTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findById(id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    if (ticket.paymentMethod !== 'CASH') {
      return res.status(400).json({ message: 'This ticket is not a cash payment.' });
    }

    if (ticket.paymentStatus === 'PAID') {
      return res.status(400).json({ message: 'Ticket is already paid.' });
    }

    ticket.paymentStatus = 'PAID';
    ticket.status = 'ACTIVE';

    // Explicitly save before response or emissions
    await ticket.save();

    // Emit targeted socket event to the user's specific room using standard helper
    broadcastTicketStatus(req, ticket);

    // Notify admin room for real-time dashboard updates
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('cashTicketCollected', ticket._id);
      io.to('admin-room').emit('dashboardStatsUpdated');

      // Global broadcast for public availability window
      io.emit('crowdDataUpdated');
    }

    await logAdminAction(req, `Manually activated cash ticket ${id}`);

    res.status(200).json({ message: 'Ticket activated successfully', ticket });
  } catch (error) {
    console.error('Activate Cash Ticket Error:', error);
    res.status(500).json({ message: 'Server error activating ticket' });
  }
};

const getPendingCashTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { paymentMethod: 'CASH' };

    if (status === 'PAID') {
      query.paymentStatus = 'PAID';
    } else {
      query.paymentStatus = 'PENDING';
    }

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Ticket.countDocuments(query),
    ]);

    // Prevent Response Caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.status(200).json({
      tickets,
      totalTickets: total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    console.error('Fetch Cash Tickets Error:', error);
    res.status(500).json({ message: 'Error fetching cash tickets' });
  }
};

const getHardwareStats = async (req, res) => {
  try {
    const systemMapping = {
      'Ambient Lighting': ['LDR', 'LED Lamp'],
      'Automated Gate': ['Gate Ultrasonic', 'Gate Servo'],
      'Smart Irrigation': ['Soil Moisture', 'DHT11', 'Water Pump'],
      'Smart Recycle Bins': ['RGB Ultrasonic', 'RGB LED'],
    };

    const statsAgg = await HardwareAlert.aggregate([
      {
        $group: {
          _id: { sensor: '$sensor', type: '$type' },
          count: { $sum: 1 },
        },
      },
    ]);

    const stats = {};
    Object.keys(systemMapping).forEach((sys) => {
      stats[sys] = { error: 0, warning: 0, success: 0, info: 0, action: 0 };
    });

    // Helper to find system for a sensor
    const getSystemForSensor = (sensorName) => {
      for (const [sys, sensors] of Object.entries(systemMapping)) {
        if (sensors.includes(sensorName)) return sys;
      }
      return null;
    };

    statsAgg.forEach((item) => {
      const { sensor, type } = item._id;
      const system = getSystemForSensor(sensor);
      if (system) {
        stats[system][type] = (stats[system][type] || 0) + item.count;
      }
    });

    res.status(200).json(stats);
  } catch (error) {
    console.error('Hardware Stats Error:', error);
    res.status(500).json({ message: 'Error retrieving hardware stats' });
  }
};

const getAlertsBySensor = async (req, res) => {
  try {
    const { sensorName } = req.params;

    const systemMapping = {
      'Ambient Lighting': ['LDR', 'LED Lamp'],
      'Automated Gate': ['Gate Ultrasonic', 'Gate Servo'],
      'Smart Irrigation': ['Soil Moisture', 'DHT11', 'Water Pump'],
      'Smart Recycle Bins': ['RGB Ultrasonic', 'RGB LED'],
    };

    let sensorQuery = sensorName;
    if (systemMapping[sensorName]) {
      sensorQuery = { $in: systemMapping[sensorName] };
    }

    const alerts = await HardwareAlert.find({ sensor: sensorQuery })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json(alerts);
  } catch (error) {
    console.error('Fetch Sensor Alerts Error:', error);
    res.status(500).json({ message: 'Error fetching alerts for sensor' });
  }
};

module.exports = {
  getAdminStats,
  scanTicket,
  getUsers,
  getAdmins,
  toggleRestrictUser,
  resolveRisk,
  resolveInsiderThreat,
  forceLogoutAnd2FA,
  createSubAdmin,
  deleteUser,
  resetOccupancy,
  getHardwareAlerts,
  getHardwareStats,
  getAlertsBySensor,
  unlockScanner,
  getAuditLogs,
  getBannedIPs,
  unbanIP,
  getWhitelistedIPs,
  addWhitelistedIP,
  removeWhitelistedIP,
  getMonthlySales,
  clearAuditLogs,
  clearHardwareAlerts,
  createBackup,
  getBackups,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  getUserTickets,
  scanUserTicket,
  activateCashTicket,
  getPendingCashTickets,
  generateMockData,
};
