const PromoCode = require('../models/PromoCode');
const crypto = require('crypto');

// @desc    Validate a promo code
// @route   POST /api/promo/validate
const validatePromoCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Promo code is required' });
    }

    const hashedPromo = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');

    const promo = await PromoCode.findOne({
      code: hashedPromo,
      userId: req.user._id,
    });

    if (!promo) {
      return res.status(404).json({ message: 'Invalid or already used promo code' });
    }

    if (promo.expiresAt && new Date() > promo.expiresAt) {
      return res.status(400).json({ message: 'Promo code has expired' });
    }

    res.json({
      message: 'Promo code validated successfully',
      discount: promo.discount,
      code: code.toUpperCase(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error validating promo code', error: error.message });
  }
};

module.exports = {
  validatePromoCode,
};
