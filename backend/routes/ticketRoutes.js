const express = require('express');
const router = express.Router();
const {
  checkout,
  getTicketHistory,
  getTicketInsights,
  cancelTicket,
  rescheduleTicket,
} = require('../controllers/ticketController');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/authMiddleware');
const { promoLimiter } = require('../middleware/rateLimiters');
const { activateCashTicket } = require('../controllers/adminController');

router.post('/checkout', protect, promoLimiter, checkout);
router.get('/history', protect, getTicketHistory);
router.get('/insights', getTicketInsights);
router.patch('/:id/cancel', protect, cancelTicket);
router.put('/:id/reschedule', protect, rescheduleTicket);
router.put('/:id/confirm-cash', protect, admin, activateCashTicket);

module.exports = router;
