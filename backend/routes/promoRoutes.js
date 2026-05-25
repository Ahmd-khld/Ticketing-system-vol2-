const express = require('express');
const router = express.Router();
const { validatePromoCode } = require('../controllers/promoController');
const { protect } = require('../middleware/authMiddleware');
const { promoLimiter } = require('../middleware/rateLimiters');

router.post('/validate', protect, promoLimiter, validatePromoCode);

module.exports = router;
