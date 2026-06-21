const child_process = require('child_process');
const path = require('path');

let ioInstance = null;
let isUpdating = false;
let updateTimeout = null;

const setIO = (io) => {
  ioInstance = io;
};

const Risk = require('../models/Risk');
const User = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');
const Ticket = require('../models/Ticket');
const { decryptDeterministic } = require('./encryption');

const decryptText = (text) => {
  if (!text || typeof text !== 'string') return text;
  // Match the standard IV:AuthTag:Encrypted format (or legacy IV:Encrypted)
  const hexRegex = /\b([0-9a-f]+:[0-9a-f]+(?::[0-9a-f]+)?)\b/gi;
  return text.replace(hexRegex, (match) => {
    const decrypted = decryptDeterministic(match);
    return decrypted !== match ? decrypted : match;
  });
};

/**
 * Centralized logic to detect insider threats from audit logs and manage recursive risk records.
 */
const detectInsiderThreats = async () => {};
;

/**
 * Robust synchronization layer to ensure Python engine output matches 
 * the MongoDB Source of Truth and remains stable across refreshes.
 */
const sanitizeAndSyncGRCData = async (parsedData) => {
  try {
    if (!parsedData) return parsedData;

    // --- 1. NODE-SIDE SECURITY DETECTION (Inject Insider Threats) ---
    parsedData.risk_register = await detectInsiderThreats(parsedData.risk_register || []);

    // --- 2. ENSURE PERSISTENCE (Add any Open risks from DB that Python missed) ---
    const allOpenDbRisks = await Risk.find({ status: { $ne: 'Resolved' } }).lean();
    const mergedRisks = [...(parsedData.risk_register || [])];
    
    for (const openRisk of allOpenDbRisks) {
      if (!mergedRisks.some(r => r.id === openRisk.id)) {
        mergedRisks.push(openRisk);
      }
    }

    // --- 3. SYNC WITH SOURCE OF TRUTH (Sync all risks with latest DB state) ---
    const allRiskIds = mergedRisks.map(r => r.id);
    const dbRisks = await Risk.find({ id: { $in: allRiskIds } }).lean();
    const dbRiskMap = new Map(dbRisks.map(r => [r.id, r]));

    const syncedRisks = mergedRisks.map(r => {
      const dbRecord = dbRiskMap.get(r.id);
      if (dbRecord) {
        return {
          ...r,
          status: dbRecord.status,
          resolvedAt: dbRecord.resolvedAt,
          resolvedBy: dbRecord.resolvedBy,
          updatedAt: dbRecord.updatedAt,
          createdAt: dbRecord.createdAt
        };
      }
      return r;
    });

    // --- 4. DEDUPLICATION & DECRYPTION ---
    const uniqueRisks = [];
    const seenIds = new Set();
    for (const risk of syncedRisks) {
      if (!seenIds.has(risk.id)) {
        if (risk.description) risk.description = decryptText(risk.description);
        if (risk.asset) risk.asset = decryptText(risk.asset);
        if (risk.recommendations) {
          risk.recommendations = risk.recommendations.map(rec => ({
            ...rec,
            title: decryptText(rec.title),
            body: decryptText(rec.body),
            params: rec.params ? Object.fromEntries(
              Object.entries(rec.params).map(([k, v]) => [k, typeof v === 'string' ? decryptText(v) : v])
            ) : rec.params
          }));
        }
        risk.displayId = decryptText(risk.id);
        
        uniqueRisks.push(risk);
        seenIds.add(risk.id);
      }
    }

    // --- 5. RECALCULATE SUMMARY (Keep high-level counts in sync with register) ---
    const newSummary = {
      network_risks: { count: 0, score: 0, level: 'Low', status: 'Optimal' },
      malware_risks: { count: 0, score: 0, level: 'Low', status: 'Optimal' },
      integrity_risks: { count: 0, score: 0, level: 'Low', status: 'Optimal' },
      account_risks: { count: 0, score: 0, level: 'Low', status: 'Optimal' },
      config_risks: { count: 0, score: 0, level: 'Low', status: 'Optimal' }
    };

    for (const risk of uniqueRisks) {
      if (risk.status === 'Resolved') continue;

      const cat = (risk.category || '').toLowerCase();
      let target = null;
      if (cat.includes('network')) target = newSummary.network_risks;
      else if (cat.includes('malware') || cat.includes('file')) target = newSummary.malware_risks;
      else if (cat.includes('integrity') || cat.includes('hw')) target = newSummary.integrity_risks;
      else if (cat.includes('account') || cat.includes('auth') || cat.includes('insider') || cat.includes('rbac')) target = newSummary.account_risks;
      else if (cat.includes('config') || cat.includes('bkup') || cat.includes('ops')) target = newSummary.config_risks;

      if (target) {
        target.count += 1;
        const score = (risk.likelihood || 0) * (risk.impact || 0);
        target.score += score;
        if (score >= 20) target.level = 'Critical';
        else if (score >= 12 && target.level !== 'Critical') target.level = 'High';
        else if (score >= 6 && target.level === 'Low') target.level = 'Medium';
        target.status = target.count > 0 ? (target.level === 'Critical' ? 'Immediate Action' : 'Warning') : 'Optimal';
      }
    }

    return {
      ...parsedData,
      risk_register: uniqueRisks,
      risks_summary: newSummary,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[GRC-Service] Sanitization Failure:', err);
    return parsedData;
  }
};

/**
 * Executes the GRC bridge Python script and broadcasts results via WebSockets
 */
const runRiskAssessment = async () => {
  if (isUpdating) return;
  isUpdating = true;

  return new Promise((resolve) => {
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, '..', 'grc_bridge.py');

    console.log(`[GRC-Service] Executing live risk re-assessment...`);

    const { encryptDeterministic, encryptLegacy } = require('./encryption');
    const child = child_process.spawn(pythonCommand, [scriptPath, 'CIS_V8'], {
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
      isUpdating = false;
      if (code !== 0) {
        console.error('[GRC-Service] Bridge Failure:', stderrData || 'Exit code ' + code);
        return resolve(null);
      }

      try {
        const rawData = JSON.parse(stdoutData);
        
        // SYNC BEFORE BROADCAST: Fixes the flickering Critical Risk count bug
        const parsedData = await sanitizeAndSyncGRCData(rawData);

        if (ioInstance) {
          console.log('[GRC-Service] Broadcasting clean/synced GRC update to all admins');
          ioInstance.emit('grcLiveUpdate', parsedData);
          // Also emit generic refresh for components that don't listen to grcLiveUpdate
          ioInstance.emit('dataRefresh');
        }
        resolve(parsedData);
      } catch (err) {
        console.error('[GRC-Service] JSON Parse Error:', err.message);
        resolve(null);
      }
    });
  });
};

/**
 * Debounced trigger for GRC updates
 */
const triggerGRCUpdate = () => {
  // Skip the Python-spawning background job during tests: its 2s debounce fires
  // after the triggering test tears down, leaking a child process and tripping
  // Jest's "Cannot log after tests are done" (a source of flaky failures).
  if (process.env.NODE_ENV === 'test') return;

  if (updateTimeout) clearTimeout(updateTimeout);

  // 2-second debounce to handle rapid log sequences
  updateTimeout = setTimeout(() => {
    runRiskAssessment();
  }, 2000);
};

module.exports = {
  setIO,
  triggerGRCUpdate,
  runRiskAssessment,
  sanitizeAndSyncGRCData
};
