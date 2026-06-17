const express = require('express');
const router = express.Router();
const {
  getAdminStats,
  scanTicket,
  getUsers,
  getAdmins,
  toggleRestrictUser,
  toggleForce2FA,
  forceLogoutAnd2FA,
  createSubAdmin,
  deleteUser,
  resetOccupancy,
  getAuditLogs,
  getBannedIPs,
  unbanIP,
  getWhitelistedIPs,
  addWhitelistedIP,
  removeWhitelistedIP,
  getMonthlySales,
  clearAuditLogs,
  getHardwareAlerts,
  getHardwareStats,
  getAlertsBySensor,
  clearHardwareAlerts,
  resolveRisk,
  resolveInsiderThreat,
  createBackup,
  getBackups,
  downloadBackup,
  deleteBackup,
  restoreBackup,
  unlockScanner,
  getUserTickets,
  scanUserTicket,
  activateCashTicket,
  getPendingCashTickets,
  generateMockData,
} = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin, requireSuperAdmin } = require('../middleware/superAdminMiddleware');
const { verifyAdminWhitelist } = require('../middleware/ipControl');
const validateRequest = require('../middleware/validateRequest');
const { adminSearchSchema } = require('../validators/schemas');

// Apply whitelist check to all routes in this router
router.use(verifyAdminWhitelist);

router.get('/stats', requireAdmin, getAdminStats);
router.post('/scan', requireAdmin, scanTicket);
router.post('/reset-occupancy', requireSuperAdmin, resetOccupancy);
router.post('/generate-mock-data', protect, requireSuperAdmin, generateMockData);
router.get('/users', requireAdmin, validateRequest(adminSearchSchema), getUsers);
router.get('/admins', requireAdmin, validateRequest(adminSearchSchema), getAdmins);
router.get('/users/:userId/tickets', requireAdmin, getUserTickets);
router.post('/users/:userId/tickets/:ticketId/scan', requireAdmin, scanUserTicket);
router.put('/activate-cash-ticket/:id', requireAdmin, activateCashTicket);
router.get('/pending-cash-tickets', requireAdmin, getPendingCashTickets);
router.patch('/users/:id/restrict', requireAdmin, toggleRestrictUser);
router.patch('/users/:id/force-logout-2fa', requireSuperAdmin, forceLogoutAnd2FA);
router.delete('/users/:id', requireSuperAdmin, deleteUser);
router.post('/sub-admin', requireSuperAdmin, createSubAdmin);
router.get('/audit-logs', requireAdmin, validateRequest(adminSearchSchema), getAuditLogs);
router.delete('/audit-logs', requireSuperAdmin, clearAuditLogs);
router.get('/banned-ips', requireAdmin, validateRequest(adminSearchSchema), getBannedIPs);
router.delete('/banned-ips/:id', requireSuperAdmin, unbanIP);
router.get('/whitelisted-ips', requireAdmin, validateRequest(adminSearchSchema), getWhitelistedIPs);
router.post('/whitelisted-ips', requireSuperAdmin, addWhitelistedIP);
router.delete('/whitelisted-ips/:id', requireSuperAdmin, removeWhitelistedIP);
router.get('/monthly-sales', requireAdmin, getMonthlySales);
router.get('/hardware-stats', protect, requireAdmin, getHardwareStats);
router.get('/hardware-alerts', requireAdmin, validateRequest(adminSearchSchema), getHardwareAlerts);
router.get('/hardware-alerts/:sensorName', protect, requireAdmin, getAlertsBySensor);
router.delete('/hardware-alerts', requireSuperAdmin, clearHardwareAlerts);
router.post('/risk-register/resolve/:riskId', requireSuperAdmin, resolveRisk);
router.post('/risk-register/resolve-insider/:riskId', requireSuperAdmin, resolveInsiderThreat);
router.post('/unlock-scanner', requireAdmin, unlockScanner);
router.post('/backup', requireSuperAdmin, createBackup);
router.get('/backups', requireAdmin, getBackups);
router.get('/backups/download/:filename', requireAdmin, downloadBackup);
router.delete('/backups/:filename', requireSuperAdmin, deleteBackup);
router.post('/backups/:filename/restore', requireSuperAdmin, restoreBackup);

module.exports = router;
