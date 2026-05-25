const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/superAdminMiddleware');
const Telemetry = require('../models/Telemetry');
const HardwareAlert = require('../models/HardwareAlert');

let mockMode = false;
let mockInterval = null;

// Function to generate randomized mock data and persist it
const generateMockData = async (io) => {
  try {
    const mockData = {
      moisture: Math.floor(Math.random() * 1024),
      humidity: parseFloat((40 + Math.random() * 40).toFixed(2)),
      temperature: parseFloat((20 + Math.random() * 15).toFixed(2)),
      rgbDistance: Math.floor(Math.random() * 100),
      servoDistance: parseFloat((Math.random() * 50).toFixed(2)),
      ldrStatus: Math.random() > 0.5 ? 'ON' : 'OFF',
      pumpStatus: Math.random() > 0.8 ? 'ON' : 'OFF',
      servoStatus: Math.random() > 0.5 ? 'OPEN' : 'CLOSED',
    };

    // Persist to DB
    const telemetry = new Telemetry(mockData);
    await telemetry.save();

    if (io) {
      // Emit telemetry update for any listeners
      io.emit('telemetryUpdate', { ...mockData, lastUpdated: telemetry.createdAt });

      // Periodically emit and save a mock hardware alert
      if (Math.random() > 0.7) {
        const demoEvents = [
          { sensor: 'Soil Moisture', type: 'success', message: 'Simulation: Irrigation cycle completed in Sector 2.' },
          { sensor: 'Gate Ultrasonic', type: 'error', message: 'Simulation: Unrecognized QR code at Staff Entrance.' },
          { sensor: 'RGB Ultrasonic', type: 'warning', message: 'Simulation: Smart Bin #4 is at 95% capacity.' },
          { sensor: 'Gate Servo', type: 'info', message: 'Simulation: Gate deployed successfully.' },
          { sensor: 'LDR', type: 'info', message: 'Simulation: Pathway lamps activated.' },
        ];
        const event = demoEvents[Math.floor(Math.random() * demoEvents.length)];
        
        const timeString = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const newAlert = new HardwareAlert({
          message: event.message,
          type: event.type,
          sensor: event.sensor,
          timeString: timeString
        });
        
        await newAlert.save();
        
        io.to('admin-room').emit('hardwareAlert', {
          id: newAlert._id,
          time: timeString,
          message: newAlert.message,
          type: newAlert.type,
          sensor: newAlert.sensor,
          createdAt: newAlert.createdAt
        });
      }
    }
  } catch (err) {
    console.error('[Telemetry Mock] Error saving mock data:', err);
  }
};

// @route   POST /api/hardware/telemetry
// @desc    Receive telemetry from Arduino (Public for IoT device)
router.post('/hardware/telemetry', async (req, res) => {
  if (mockMode) {
    return res.status(200).json({ message: 'Mock Mode Active. Ignoring real data.' });
  }

  const {
    moisture,
    humidity,
    temperature,
    rgbDistance,
    servoDistance,
    ldrStatus,
    pumpStatus,
    servoStatus
  } = req.body;

  // Basic Validation
  if (
    moisture === undefined ||
    humidity === undefined ||
    temperature === undefined ||
    rgbDistance === undefined ||
    servoDistance === undefined
  ) {
    return res.status(400).json({ message: 'Invalid telemetry payload structure' });
  }

  try {
    // Persist to DB
    const telemetry = new Telemetry({
      moisture,
      humidity,
      temperature,
      rgbDistance,
      servoDistance,
      ldrStatus: ldrStatus || 'OFF',
      pumpStatus: pumpStatus || 'OFF',
      servoStatus: servoStatus || 'CLOSED',
    });
    await telemetry.save();

    // Broadcast real data via socket
    const io = req.app.get('io');
    if (io) io.emit('telemetryUpdate', { ...req.body, lastUpdated: telemetry.createdAt });

    res.status(200).json({ message: 'Telemetry received and persisted successfully' });
  } catch (err) {
    console.error('[Telemetry] Error persisting real data:', err);
    res.status(500).json({ message: 'Internal server error saving telemetry' });
  }
});

// @route   GET /api/telemetry/latest
// @desc    Get the latest stored telemetry data
router.get('/telemetry/latest', protect, async (req, res) => {
  try {
    const latest = await Telemetry.findOne().sort({ createdAt: -1 });
    if (!latest) {
      return res.status(200).json({
        moisture: 0,
        humidity: 0,
        temperature: 0,
        rgbDistance: 0,
        servoDistance: 0,
        ldrStatus: 'OFF',
        pumpStatus: 'OFF',
        servoStatus: 'CLOSED',
        lastUpdated: new Date()
      });
    }
    res.status(200).json(latest);
  } catch (err) {
    console.error('[Telemetry] Error fetching latest data:', err);
    res.status(500).json({ message: 'Error fetching telemetry data' });
  }
});

// @route   POST /api/telemetry/toggle-mock
// @desc    Toggle Mock Mode for telemetry
router.post('/telemetry/toggle-mock', protect, requireAdmin, (req, res) => {
  mockMode = !mockMode;
  const io = req.app.get('io');

  if (mockMode) {
    console.log('[Telemetry] Mock Mode Enabled');
    // Generate first batch immediately
    generateMockData(io);
    // Start interval (every 3 seconds)
    if (!mockInterval) {
      mockInterval = setInterval(() => generateMockData(io), 3000);
    }
  } else {
    console.log('[Telemetry] Mock Mode Disabled');
    if (mockInterval) {
      clearInterval(mockInterval);
      mockInterval = null;
    }
  }

  res.status(200).json({ mockMode, message: `Mock Mode ${mockMode ? 'Enabled' : 'Disabled'}` });
});


// @route   GET /api/telemetry/mock-status
// @desc    Check if Mock Mode is active
router.get('/telemetry/mock-status', protect, requireAdmin, (req, res) => {
  res.status(200).json({ mockMode });
});

module.exports = router;
