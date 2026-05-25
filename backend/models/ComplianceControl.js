const mongoose = require('mongoose');

const complianceControlSchema = new mongoose.Schema(
  {
    controlId: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['implemented', 'partial', 'not_implemented'],
      default: 'not_implemented',
    },
    default_status: {
      type: String,
    },
    default_evidence: {
      type: String,
    },
    description: {
      type: String,
    },
    evidence: {
      type: String,
    },
    framework: {
      type: String,
      default: 'CIS_V8',
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast lookups by ID and framework
complianceControlSchema.index({ controlId: 1, framework: 1 }, { unique: true });

module.exports = mongoose.model('ComplianceControl', complianceControlSchema);
