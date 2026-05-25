const mongoose = require('mongoose');

const riskSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    category: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    asset: {
      type: String,
    },
    likelihood: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    impact: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    status: {
      type: String,
      enum: ['Open', 'Mitigating', 'Accepted', 'Resolved'],
      default: 'Open',
    },
    recommendations: [
      {
        title: String,
        body: String,
        priority: String,
        action: String,
        params: mongoose.Schema.Types.Mixed,
      },
    ],
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for rapid ID lookup
riskSchema.index({ id: 1 });

const Risk = mongoose.model('Risk', riskSchema);
module.exports = Risk;
