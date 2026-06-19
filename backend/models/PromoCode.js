const mongoose = require('mongoose');
const crypto = require('crypto');

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
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

promoCodeSchema.pre('save', function () {
  if (this.isModified('code')) {
    this.code = crypto.createHash('sha256').update(this.code.toUpperCase()).digest('hex');
  }
});

const PromoCode = mongoose.model('PromoCode', promoCodeSchema);
module.exports = PromoCode;
