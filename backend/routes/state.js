const express = require('express');
const router = express.Router();
const Backup = require('../models/Backup');

// GET endpoint to download current state
router.get('/download', async (req, res) => {
  try {
    // 1. Fetch current state from your database (e.g., MongoDB using Mongoose)
    // Example: const settings = await SettingsModel.findOne({});

    // Placeholder state (Replace this with actual data from your database)
    const currentState = {
      backupDate: new Date().toISOString(),
      settings: {
        waterThreshold: 30,
        lightDurationHours: 8,
      },
      devices: [],
    };

    res.status(200).json(currentState);
  } catch (error) {
    console.error('Error downloading state:', error);
    res.status(500).json({ error: 'Internal server error while downloading state.' });
  }
});

// POST endpoint to restore state
// Make sure your main app uses express.json() middleware to parse the body
router.post('/restore', async (req, res) => {
  try {
    const previousState = req.body;

    // 1. Validate the incoming state to ensure it has data
    if (!previousState || Object.keys(previousState).length === 0) {
      return res.status(400).json({ error: 'No state data provided or file is empty.' });
    }

    // 2. Apply the state to your database or IoT garden logic
    // Example: await SettingsModel.updateOne({}, previousState.settings, { upsert: true });
    console.log('Received state to restore:', previousState);

    // 3. Respond with success
    res.status(200).json({ message: 'State successfully restored.' });
  } catch (error) {
    console.error('Error restoring state:', error);
    res.status(500).json({ error: 'Internal server error while restoring state.' });
  }
});

// --- SERVER BACKUP ENDPOINTS ---

// GET endpoint to list all server backups
router.get('/backups', async (req, res) => {
  try {
    // Return a list of backups without the full data payload to save bandwidth
    // Sort by date descending so the newest backups appear first
    const backups = await Backup.find({}, '_id date').sort({ date: -1 });
    const backupList = backups.map((b) => ({ id: b._id, date: b.date }));
    res.status(200).json(backupList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch backups' });
  }
});

// POST endpoint to create a server backup
router.post('/backup', async (req, res) => {
  try {
    // 1. Fetch current state from database (Mocked data here)
    const currentState = {
      waterThreshold: 30,
      lightDurationHours: 8,
      devices: [],
    };

    const newBackup = new Backup({
      data: currentState,
    });
    await newBackup.save();

    res.status(201).json({ message: 'Backup created successfully', backupId: newBackup._id });
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: 'Internal server error while creating backup.' });
  }
});

// POST endpoint to restore a specific server backup
router.post('/restore/:id', async (req, res) => {
  try {
    const backupId = req.params.id;
    const backup = await Backup.findById(backupId);

    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    // 2. Apply the backup.data to your database
    // Example: await SettingsModel.updateOne({}, backup.data, { upsert: true });
    console.log(`Restoring backup ${backupId}:`, backup.data);

    res.status(200).json({ message: 'Server backup successfully restored.' });
  } catch (error) {
    console.error('Error restoring server backup:', error);
    res.status(500).json({ error: 'Internal server error while restoring server backup.' });
  }
});

// DELETE endpoint to remove a specific server backup
router.delete('/backup/:id', async (req, res) => {
  try {
    const backupId = req.params.id;
    const deletedBackup = await Backup.findByIdAndDelete(backupId);

    if (!deletedBackup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    res.status(200).json({ message: 'Backup deleted successfully.' });
  } catch (error) {
    console.error('Error deleting server backup:', error);
    res.status(500).json({ error: 'Internal server error while deleting server backup.' });
  }
});

module.exports = router;
