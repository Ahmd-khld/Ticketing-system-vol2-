const mongoose = require('mongoose');

const hardwareAlertSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },
    sensor: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['info', 'warning', 'action', 'success', 'error'],
      required: true,
    },
    timeString: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Performance Indexes for rapid sorting and filtering
hardwareAlertSchema.index({ createdAt: -1 });
hardwareAlertSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('HardwareAlert', hardwareAlertSchema);
