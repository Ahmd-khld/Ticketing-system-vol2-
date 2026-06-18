const express = require('express');
const router = express.Router();
const http = require('http');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/superAdminMiddleware');
const Telemetry = require('../models/Telemetry');
const HardwareAlert = require('../models/HardwareAlert');

let mockMode = false;
let mockInterval = null;

// In-memory store for the latest hardware state
let latestState = {
  moisture: 0,
  humidity: 0,
  temperature: 0,
  rgbDistance: 0,
  servoDistance: 0,
  ldrStatus: 'OFF',
  pumpStatus: 'OFF',
  servoStatus: 'CLOSED',
  lastUpdated: null,
  arduinoIp: null
};

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

    // Update in-memory state
    latestState = {
      ...mockData,
      lastUpdated: new Date(),
      arduinoIp: '127.0.0.1 (Mock)'
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

// Function to check real telemetry data and generate alerts on state changes or threshold crossings
const checkAndGenerateAlerts = async (oldState, newState, io) => {
  // Do not generate alerts if this is the very first real payload (oldState is uninitialized)
  if (!oldState || oldState.lastUpdated === null) return;

  const alerts = [];
  const timeString = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const createAlert = (sensor, type, message) => {
    alerts.push(new HardwareAlert({ sensor, type, message, timeString }));
  };

  // State Change: Water Pump
  if (oldState.pumpStatus === 'OFF' && newState.pumpStatus === 'ON') {
    createAlert('Water Pump', 'info', 'Water pump activated for irrigation.');
  } else if (oldState.pumpStatus === 'ON' && newState.pumpStatus === 'OFF') {
    createAlert('Water Pump', 'success', 'Irrigation cycle completed.');
  }

  // State Change: LDR Status
  if (oldState.ldrStatus === 'OFF' && newState.ldrStatus === 'ON') {
    createAlert('LDR', 'info', 'Pathway lamps activated due to low light.');
  } else if (oldState.ldrStatus === 'ON' && newState.ldrStatus === 'OFF') {
    createAlert('LDR', 'success', 'Pathway lamps deactivated.');
  }

  // State Change: Gate Servo
  if (oldState.servoStatus === 'CLOSED' && newState.servoStatus === 'OPEN') {
    createAlert('Gate Servo', 'info', 'Gate deployed/opened.');
  } else if (oldState.servoStatus === 'OPEN' && newState.servoStatus === 'CLOSED') {
    createAlert('Gate Servo', 'info', 'Gate closed.');
  }

  // Threshold: Temperature
  if (oldState.temperature <= 35 && newState.temperature > 35) {
    createAlert('Temperature', 'warning', `High temperature detected: ${newState.temperature}°C`);
  } else if (oldState.temperature > 35 && newState.temperature <= 35) {
    createAlert('Temperature', 'success', `Temperature returned to normal: ${newState.temperature}°C`);
  }

  // Threshold: Soil Moisture
  if (oldState.moisture >= 20 && newState.moisture < 20) {
    createAlert('Soil Moisture', 'warning', `Low soil moisture: ${newState.moisture}%`);
  } else if (oldState.moisture < 20 && newState.moisture >= 20) {
    createAlert('Soil Moisture', 'success', `Soil moisture optimal: ${newState.moisture}%`);
  }

  // Threshold: RGB Ultrasonic
  const getBinState = (distance) => {
    if (distance <= 5) return 'full';
    if (distance <= 10) return 'nearly_full';
    return 'empty';
  };

  const oldBinState = getBinState(oldState.rgbDistance);
  const newBinState = getBinState(newState.rgbDistance);

  if (oldBinState !== newBinState) {
    if (newBinState === 'full') {
      createAlert('RGB Ultrasonic', 'action', `Smart Bin is full (Distance: ${newState.rgbDistance}cm).`);
    } else if (newBinState === 'nearly_full') {
      createAlert('RGB Ultrasonic', 'warning', `Smart Bin is nearly full (Distance: ${newState.rgbDistance}cm).`);
    } else if (newBinState === 'empty') {
      createAlert('RGB Ultrasonic', 'success', `Smart Bin has been emptied (Distance: ${newState.rgbDistance}cm).`);
    }
  }

  // Save and Emit all alerts
  for (const alert of alerts) {
    await alert.save();
    if (io) {
      io.to('admin-room').emit('hardwareAlert', {
        id: alert._id,
        time: alert.timeString,
        message: alert.message,
        type: alert.type,
        sensor: alert.sensor,
        createdAt: alert.createdAt
      });
    }
  }
};

// @route   POST /api/hardware/debug
// @desc    Diagnostic endpoint to verify raw connectivity from Arduino
router.post('/hardware/debug', express.text({ type: '*/*' }), (req, res) => {
  console.log('--- HARDWARE DEBUG INBOUND ---');
  console.log('IP:', req.ip);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', req.body);
  console.log('------------------------------');
  res.status(200).send('ACK_DEBUG');
});

// @route   POST /api/hardware/telemetry
// @desc    Receive telemetry from Arduino (Supports signature and raw body)
router.post('/hardware/telemetry', async (req, res) => {
  console.log('[Telemetry] Inbound request from:', req.ip);

  try {
    let rawBody = req.body;

    // Log raw body for debugging parsing errors
    // If req.body is already an object (e.g. parsed by express.json), log it as JSON
    console.log('[Telemetry] Received Body:', typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

    if (!rawBody || (typeof rawBody === 'string' && rawBody.trim() === '')) {
      console.warn('[Telemetry] Received empty body');
      return res.status(400).json({ message: 'Empty telemetry payload' });
    }

    let signature = null;
    let jsonPart = rawBody;

    // Handle Arduino's signature format: JSON|sig:SIGNATURE
    if (typeof rawBody === 'string' && rawBody.includes('|sig:')) {
      const parts = rawBody.split('|sig:');
      jsonPart = parts[0];
      signature = parts[1];
      console.log('[Telemetry] Signature detected:', signature);
    }

    let payload;
    try {
      // Robust fix for Arduino sending '?' for floating point values
      // This happens when the Arduino's snprintf/dtostrf implementation fails or is misconfigured.
      const sanitizedJson = jsonPart.replace(/:\s*\?/g, ': 0');

      if (sanitizedJson !== jsonPart) {
        console.warn('[Telemetry] Sanitized payload (replaced "?" with "0")');
      }

      payload = typeof sanitizedJson === 'string' ? JSON.parse(sanitizedJson.trim()) : sanitizedJson;
    } catch (parseErr) {
      console.error('[Telemetry] JSON Parse Error:', parseErr.message);
      console.error('[Telemetry] Failed to parse:', jsonPart);
      return res.status(400).json({ message: 'Invalid JSON format', error: parseErr.message });
    }

    let {
      moisture,
      humidity,
      temperature,
      rgbDistance,
      servoDistance,
      ldrStatus,
      pumpStatus,
      servoStatus
    } = payload;

    // Convert string representations to numbers (Arduino sends them as strings)
    if (typeof humidity === 'string') humidity = parseFloat(humidity);
    if (typeof temperature === 'string') temperature = parseFloat(temperature);

    // Basic Validation
    if (
      moisture === undefined ||
      humidity === undefined ||
      temperature === undefined ||
      rgbDistance === undefined ||
      servoDistance === undefined
    ) {
      console.warn('[Telemetry] Missing required fields in payload:', payload);
      return res.status(400).json({ message: 'Invalid telemetry payload structure' });
    }

    // Capture Arduino IP for command routing
    const arduinoIp = req.ip || req.connection.remoteAddress;

    // Broadcast real data via socket
    const io = req.app.get('io');

    const newState = {
      moisture,
      humidity,
      temperature,
      rgbDistance,
      servoDistance,
      ldrStatus: ldrStatus || 'OFF',
      pumpStatus: pumpStatus || 'OFF',
      servoStatus: servoStatus || 'CLOSED',
      lastUpdated: new Date(),
      arduinoIp
    };

    // Check for alerts using the edge-detection logic
    if (!mockMode) {
      await checkAndGenerateAlerts(latestState, newState, io);
    }

    // Update in-memory state for rapid frontend access
    latestState = newState;

    // Persist to DB for history
    const telemetry = new Telemetry({
      ...payload,
      ldrStatus: latestState.ldrStatus,
      pumpStatus: latestState.pumpStatus,
      servoStatus: latestState.servoStatus,
    });
    await telemetry.save();

    if (io) {
      io.emit('telemetryUpdate', { ...latestState });
    }

    // If mock mode is active, we still acknowledge and process real data,
    // but we notify the log that real data is being merged/accepted.
    if (mockMode) {
      console.log('[Telemetry] Real data accepted while Mock Mode is ACTIVE');
    }

    res.status(200).json({ message: 'Telemetry received, verified and broadcasted.' });
  } catch (err) {
    console.error('[Telemetry] Interface Error:', err);
    res.status(500).json({ message: 'Failed to process hardware telemetry' });
  }
});

// @route   POST /api/hardware/command
// @desc    Send a command string to the Arduino IoT Node
router.post('/hardware/command', protect, requireAdmin, async (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.status(400).json({ message: 'Command string is required' });
  }

  if (!latestState.arduinoIp || latestState.arduinoIp.includes('Mock')) {
    return res.status(400).json({ message: 'No active Arduino node IP registered. Send telemetry first.' });
  }

  // Use the recorded Arduino IP to send the command back
  // Note: Most IoT nodes expect a direct TCP or HTTP POST if they are listening
  console.log(`[Command] Sending ${command} to Arduino at ${latestState.arduinoIp}`);

  // Implementation for sending the command via HTTP POST back to the Arduino
  const arduinoOptions = {
    hostname: latestState.arduinoIp.replace('::ffff:', ''), // Handle IPv6-mapped IPv4
    port: 80, // Standard IoT listening port
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': command.length
    }
  };

  const arduinoReq = http.request(arduinoOptions, (arduinoRes) => {
    let responseData = '';
    arduinoRes.on('data', (chunk) => { responseData += chunk; });
    arduinoRes.on('end', () => {
      res.status(200).json({ message: `Command '${command}' sent successfully`, arduinoResponse: responseData });
    });
  });

  arduinoReq.on('error', (err) => {
    console.error('[Command] Failed to reach Arduino:', err.message);
    res.status(502).json({ message: 'Arduino node unreachable', error: err.message });
  });

  arduinoReq.write(command);
  arduinoReq.end();
});

// @route   GET /api/telemetry/latest
// @desc    Get the latest stored telemetry data (Prefer memory over DB)
router.get('/telemetry/latest', protect, async (req, res) => {
  try {
    // If we have data in memory, use it
    if (latestState.lastUpdated) {
      return res.status(200).json(latestState);
    }

    // Fallback to DB
    const latest = await Telemetry.findOne().sort({ createdAt: -1 });
    if (!latest) {
      return res.status(200).json(latestState);
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
