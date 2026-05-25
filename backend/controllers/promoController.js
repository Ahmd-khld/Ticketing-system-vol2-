const PromoCode = require('../models/PromoCode');

// @desc    Validate a promo code
// @route   POST /api/promo/validate
const validatePromoCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Promo code is required' });
    }

    const promo = await PromoCode.findOne({
      code,
      userId: req.user._id,
    });

    if (!promo) {
      return res.status(404).json({ message: 'Invalid or already used promo code' });
    }

    res.json({
      message: 'Promo code validated successfully',
      discount: promo.discount,
      code: promo.code,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error validating promo code', error: error.message });
  }
};

module.exports = {
  validatePromoCode,
};
