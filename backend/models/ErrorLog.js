const mongoose = require('mongoose');

const errorLogSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    stack: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ErrorLog', errorLogSchema);
