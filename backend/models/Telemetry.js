const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema(
  {
    moisture: { type: Number, required: true },
    humidity: { type: Number, required: true },
    temperature: { type: Number, required: true },
    rgbDistance: { type: Number, required: true },
    servoDistance: { type: Number, required: true },
    ldrStatus: { type: String, enum: ['ON', 'OFF'], default: 'OFF' },
    pumpStatus: { type: String, enum: ['ON', 'OFF'], default: 'OFF' },
    servoStatus: { type: String, enum: ['OPEN', 'CLOSED'], default: 'CLOSED' },
    lastUpdated: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
  }
);

// Index for rapid retrieval of latest data
telemetrySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Telemetry', telemetrySchema);
