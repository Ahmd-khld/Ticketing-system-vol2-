const mongoose = require('mongoose');

const backupSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
  },
  data: {
    type: mongoose.Schema.Types.Mixed, // Allows storing flexible JSON object structures
    required: true,
  },
});

const Backup = mongoose.model('Backup', backupSchema);
module.exports = Backup;
