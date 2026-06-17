/**
 * Shared helpers for the admin controllers.
 *
 * Extracted from the former 2,278-line adminController.js so the same audit /
 * realtime-broadcast logic is defined once and can be reused as the admin
 * surface is split into domain modules.
 */

const Ticket = require('../../models/Ticket');
const HardwareAlert = require('../../models/HardwareAlert');
const AdminAuditLog = require('../../models/AdminAuditLog');
const grcService = require('../../utils/grcService');
const logger = require('../../utils/logger');

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

    // Live GRC Integration: trigger a risk re-assessment on every admin action.
    grcService.triggerGRCUpdate();
  } catch (err) {
    logger.error('Audit Log Error:', err.message);
  }
};

const broadcastOccupancy = async (req) => {
  const io = req.app.get('io');
  if (!io) return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Robust occupancy: one-time tickets marked USED today + monthly passes scanned today.
  const currentOccupancy = await Ticket.countDocuments({
    $or: [
      { status: 'USED', updatedAt: { $gte: startOfDay, $lte: endOfDay } },
      { scanHistory: { $elemMatch: { $gte: startOfDay, $lte: endOfDay } } },
    ],
  });
  const maxCapacity = parseInt(process.env.DAILY_CAPACITY) || 1000;
  const capacityPercentage = Math.round((currentOccupancy / maxCapacity) * 100);

  io.emit('occupancyUpdate', { currentOccupancy, capacityPercentage });
  io.to('admin-room').emit('occupancyUpdated', {
    currentOccupancy,
    capacityPercentage,
    maxCapacity,
    updatedAt: new Date(),
  });
};

// Broadcast ticket status changes in real-time to the owner's room + global listeners.
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
  logger.debug(`broadcastTicketStatus -> ${roomName}`);

  io.to(roomName).emit('TICKET_STATUS_UPDATED', payload);
  io.to(roomName).emit('dataRefresh');
  io.to(roomName).emit('ticketScanned', payload);
  io.emit('globalTicketUpdate', payload);
};

// Save and broadcast a hardware alert from the gate scanner.
const createHardwareAlert = async (req, message, type) => {
  try {
    const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
    logger.error('Failed to create hardware alert:', err.message);
  }
};

module.exports = {
  superAdminEmail,
  isSuperAdmin,
  logAdminAction,
  broadcastOccupancy,
  broadcastTicketStatus,
  createHardwareAlert,
};
