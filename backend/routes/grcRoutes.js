const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/superAdminMiddleware');
const ComplianceControl = require('../models/ComplianceControl');
const User = require('../models/User');
const BannedIP = require('../models/BannedIP');
const Ticket = require('../models/Ticket');
const AdminAuditLog = require('../models/AdminAuditLog');
const grcService = require('../utils/grcService');

// General Super Admin Exclusivity Check (Strictly admin@smartpark.com)
const isSuperAdminAccount = (user) => {
  const superAdminEmail = 'admin@smartpark.com';
  if (!user) return false;
  
  const userEmail = (user.email || '').toLowerCase().trim();
  const userRole = (user.role || '').toLowerCase().trim();
  
  // A Super Admin must have the matching email AND a privileged role
  return userEmail === superAdminEmail && (userRole === 'admin' || userRole === 'sub-admin');
};

/**
 * GET /api/grc/whoami
 * Diagnostic endpoint for authorization troubleshooting
 */
router.get('/whoami', protect, async (req, res) => {
  const superAdminEmail = 'admin@smartpark.com';
  res.json({
    authenticatedUser: req.user.email,
    userRole: req.user.role,
    expectedSuperAdmin: superAdminEmail,
    isAuthorized: isSuperAdminAccount(req.user)
  });
});

/**
 * POST /api/grc/remediate
 * Executes an automated remediation action for a specific risk
 */
router.post('/remediate', protect, async (req, res) => {
  if (!isSuperAdminAccount(req.user)) {
    console.warn(`AUTH_FAILURE: GRC access denied for ${req.user?.email} (Role: ${req.user?.role})`);
    return res.status(403).json({ 
      message: 'Forbidden: Exclusive Super Admin access required for GRC operations.',
      detail: `Your account (${req.user?.email}) does not have Super Admin privileges.`
    });
  }

  const { action, params, riskId } = req.body;
  if (!action) {
    return res.status(400).json({ message: 'Remediation action is required' });
  }

  try {
    let result = { message: 'Action executed successfully' };
    const adminEmail = req.user.email;

    switch (action) {
      case 'ban_ip':
        const { ip, reason } = params;
        await BannedIP.findOneAndUpdate(
          { ipAddress: ip },
          { ipAddress: ip, reason: reason || `GRC Auto-Remediation: ${riskId}` },
          { upsert: true }
        );
        result.message = `IP ${ip} has been successfully banned.`;
        break;

      case 'block_user': {
        const { email: targetEmail, userId, targetUserId } = params;
        const uid = userId || targetUserId;
        const blockQuery = uid ? { _id: uid } : { email: targetEmail };
        
        console.log(`[GRC Remediate] Attempting to block user. Query:`, blockQuery);

        const restrictedUser = await User.findOneAndUpdate(
          blockQuery,
          { 
            isRestricted: true, 
            restrictionReason: `Automated GRC Protocol: ${riskId || 'Manual Remediation'}` 
          },
          { new: true }
        );

        if (restrictedUser) {
          console.log(`[GRC Remediate] User ${restrictedUser.email} restricted successfully.`);
          result.message = `User ${restrictedUser.email} has been restricted via GRC auto-remediation.`;

          // Emit socket events for real-time dashboard updates
          const io = req.app.get('io');
          if (io) {
            const socketPayload = {
              _id: restrictedUser._id.toString(),
              isRestricted: true,
              restrictionReason: restrictedUser.restrictionReason,
            };
            
            io.emit('userUpdated', socketPayload);
            io.emit('accountRestricted', {
              userId: restrictedUser._id.toString(),
              message: restrictedUser.restrictionReason,
            });

            // Global refresh signal for admin dashboards
            io.emit('dataRefresh');
          }
        } else {
          console.warn(`[GRC Remediate] User not found for query:`, blockQuery);
          result.message = 'Target user not found for restriction.';
        }
        break;
      }

      case 'reset_permissions': {
        const { targetEmail } = params;
        const resetUser = await User.findOneAndUpdate(
          { email: targetEmail },
          {
            "permissions.hardwareControl": false,
            "permissions.systemSettings": false,
            "permissions.auditLogs": false,
            "permissions.userManagement": false
          },
          { new: true }
        );
        result.message = `Elevated permissions for ${targetEmail} have been revoked. The account role remains unchanged.`;

        if (resetUser) {
          const io = req.app.get('io');
          if (io) {
            io.emit('userUpdated', resetUser);
            io.emit('dataRefresh');
          }
        }
        break;
      }

      case 'clear_backlog': {
        // Mark auto-generated test tickets as CANCELLED
        const clearResult = await Ticket.updateMany(
          { promoCodeName: 'Auto-generated for GRC testing', status: 'INACTIVE' },
          { status: 'CANCELLED' }
        );
        result.message = `Cleared ${clearResult.modifiedCount} pending test tickets.`;

        const io = req.app.get('io');
        if (io) {
          io.emit('dataRefresh');
        }
        break;
      }
      default:
        return res.status(400).json({ message: `Unsupported remediation action: ${action}` });
    }

    // 3. Mark the Risk as Resolved in MongoDB after successful action
    if (riskId) {
      await Risk.findOneAndUpdate(
        { id: riskId },
        { 
          $set: { 
            status: 'Resolved',
            resolvedAt: new Date(),
            resolvedBy: adminEmail
          } 
        }
      );
    }

    // Log the remediation in Audit Logs
    await AdminAuditLog.create({
      email: adminEmail,
      ipAddress: req.ip || '127.0.0.1',
      status: 'success',
      statusCode: 200,
      action: `GRC Remediation: ${action} for ${riskId}`,
      userAgent: req.get('User-Agent') || 'Internal'
    });

    // Notify via Socket
    const io = req.app.get('io');
    if (io) io.emit('dataRefresh');

    res.json(result);
  } catch (error) {
    console.error('Remediation Error:', error);
    res.status(500).json({ message: 'Remediation failed', error: error.message });
  }
});

/**
 * GET /api/grc/summary
 * Executes grc_bridge.py to fetch live risk and compliance data from Python scripts
 */
router.get('/summary', protect, async (req, res) => {
  if (!isSuperAdminAccount(req.user)) {
    return res.status(403).json({ message: 'Forbidden: Exclusive Super Admin access required' });
  }

  const { framework } = req.query;
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, '..', 'grc_bridge.py');

  console.log(`DEBUG: Executing GRC Bridge: ${pythonCommand} "${scriptPath}" ${framework || 'CIS_V8'}`);

    const { encryptDeterministic, encryptLegacy } = require('../utils/encryption');
    const child = spawn(pythonCommand, [scriptPath, framework.toUpperCase()], {
      env: {
        ...process.env,
        ENCRYPTED_SUPER_ADMIN_EMAIL: encryptDeterministic(process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com'),
        LEGACY_ENCRYPTED_SUPER_ADMIN_EMAIL: encryptLegacy(process.env.SUPER_ADMIN_EMAIL || 'admin@smartpark.com')
      }
    });

  let stdoutData = '';
  let stderrData = '';

  child.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  child.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  child.on('close', async (code) => {
    if (code !== 0) {
      console.error('PYTHON_CRITICAL_FAILURE:', stderrData || 'Process exited with code ' + code);
      console.error('Raw Output (stdout):', stdoutData);

      // Try to parse stdout even on error, as bridge might have output JSON error
      try {
        const errorJson = JSON.parse(stdoutData);
        if (errorJson.error) {
          return res.status(500).json({ 
            message: 'GRC Engine Logic Error', 
            error: errorJson.error,
            details: errorJson.path 
          });
        }
      } catch (e) {}

      return res.status(500).json({ 
        message: 'GRC Script Execution Failed', 
        error: stderrData || 'Unknown Python Error',
        code: code 
      });
    }

    try {
      if (!stdoutData.trim()) {
        throw new Error('Python script returned empty output');
      }

      const rawData = JSON.parse(stdoutData);

      // --- FINAL SYNC, DETECTION & DEDUPLICATION ---
      // Fixes the flickering Critical Risk count bug by using the centralized gatekeeper
      const sanitizedData = await grcService.sanitizeAndSyncGRCData(rawData);

      if (sanitizedData.error) {
        console.error('GRC BRIDGE JSON ERROR:', sanitizedData.error);
        return res.status(500).json({ message: 'GRC Bridge Error', error: sanitizedData.error });
      }

      res.json(sanitizedData);
    } catch (parseError) {
      console.error('GRC JSON PARSE FATAL ERROR');
      console.error('Parse Error Message:', parseError.message);
      console.error('Raw Output:', stdoutData);
      res.status(500).json({ 
        message: 'Failed to parse GRC engine output', 
        error: parseError.message,
        raw: stdoutData,
        stderr: stderrData
      });
    }
  });

  child.on('error', (err) => {
    console.error('FAILED_TO_START_PYTHON:', err.message);
    res.status(500).json({ 
      message: 'Failed to start Python interpreter', 
      error: err.message,
      suggestion: 'Ensure Python is installed and in the system PATH'
    });
  });
});

const Risk = require('../models/Risk'); // We need a Risk model if we want persistence for resolved states

/**
 * PATCH /api/grc/risks/:id
 * Updates the status of a specific risk
 */
router.patch('/risks/:id', protect, async (req, res) => {
  if (!isSuperAdminAccount(req.user)) {
    return res.status(403).json({ message: 'Forbidden: Exclusive Super Admin access required' });
  }

  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    // Use the Risk model to update the status in MongoDB
    const updatedRisk = await Risk.findOneAndUpdate(
      { id: id },
      { 
        $set: { 
          status: status, 
          resolvedAt: status === 'Resolved' ? new Date() : null, 
          resolvedBy: status === 'Resolved' ? req.user.email : null 
        } 
      },
      { new: true, upsert: true } // Upsert if it doesn't exist yet (since Python might have just derived it)
    );

    res.json({ message: `Risk ${id} marked as ${status}`, risk: updatedRisk });
  } catch (error) {
    console.error('Risk Update Error:', error);
    res.status(500).json({ message: 'Failed to update risk', error: error.message });
  }
});

/**
 * PATCH /api/grc/compliance/:id
 * Updates the status of a specific compliance control
 */
router.patch('/compliance/:id', protect, async (req, res) => {
  if (!isSuperAdminAccount(req.user)) {
    return res.status(403).json({ message: 'Forbidden: Exclusive Super Admin access required' });
  }

  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    const updatedControl = await ComplianceControl.findOneAndUpdate(
      { controlId: id },
      { status: status.toLowerCase() },
      { new: true, runValidators: true }
    );

    if (!updatedControl) {
      return res.status(404).json({ message: `Control ${id} not found` });
    }

    res.json({ 
      message: `Control ${id} updated successfully`,
      controlId: id,
      newStatus: updatedControl.status
    });
  } catch (error) {
    console.error('Compliance Update Error:', error);
    res.status(500).json({ message: 'Failed to update compliance control', error: error.message });
  }
});

// @desc    Calculate Framework Adherence Score via Heuristic Codebase Scan
// @route   GET /api/grc/adherence
// @access  Super Admin
router.get('/adherence', protect, async (req, res) => {
  if (!isSuperAdminAccount(req.user)) {
    return res.status(403).json({ message: 'Forbidden: Exclusive Super Admin access required' });
  }
  
  const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, '..', 'grc_bridge.py');

  const child = spawn(pythonCommand, [scriptPath]);

  let stdoutData = '';
  child.stdout.on('data', (data) => { stdoutData += data.toString(); });

  child.on('close', (code) => {
    if (code !== 0) return res.status(500).json({ message: 'GRC Engine Failed' });
    try {
      const parsed = JSON.parse(stdoutData);
      res.json(parsed.framework_adherence || { score: 0, checks: [] });
    } catch (e) {
      res.status(500).json({ message: 'Failed to parse GRC output' });
    }
  });
});

module.exports = router;
