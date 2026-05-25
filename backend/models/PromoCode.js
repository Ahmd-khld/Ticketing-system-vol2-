const mongoose = require('mongoose');

const promoCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      unique: true,
      required: true,
    },
    discount: {
      type: Number,
      default: 10,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const PromoCode = mongoose.model('PromoCode', promoCodeSchema);
module.exports = PromoCode;
