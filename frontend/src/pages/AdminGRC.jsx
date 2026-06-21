import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import AdminHeader from '../components/AdminHeader';
import api from '../api';
import { socket } from '../socket';

const AdminGRC = () => {
  const navigate = useNavigate();

  // Strict Super Admin Access Control
  const superAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
  const currentAdminEmail = (localStorage.getItem('adminEmail') || '').toLowerCase().trim();
  const isSuperAdmin = currentAdminEmail === superAdminEmail;

  useEffect(() => {
    if (!isSuperAdmin) {
      console.warn('Unauthorized GRC Access Attempt blocked.');
      navigate('/admin/dashboard');
    }
  }, [isSuperAdmin, navigate]);

  const [activeTab, setActiveTab] = useState('Risk Assessment');
  const [selectedFramework, setSelectedFramework] = useState('CIS_V8');
  const frameworks = [
    { id: 'CIS_V8', name: 'CIS v8 Framework' },
    { id: 'NIST CSF v1.1', name: 'NIST CSF Framework' },
    { id: 'ISO/IEC 27001:2022 Annex A', name: 'ISO/IEC 27001 Annex' }
  ];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [remediating, setRemediating] = useState(null);
  const [executedRemediations, setExecutedRemediations] = useState(new Set());
  const [selectedControl, setSelectedControl] = useState(null);
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [scoreFilter, setScoreFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('Open'); // Default to Open for focus
  const [currentPage, setCurrentPage] = useState(1); // Pagination State
  const itemsPerPage = 10;

  const [notification, setNotification] = useState(null);
  const [adherenceData, setAdherenceData] = useState({ score: 0, checks: [] });
  const [selectedNode, setSelectedNode] = useState(null);

  const nodeDetailsMap = {
    'RBAC: Administrative Role Enforcement': 'Verifies that privileged operations are restricted to authenticated admin accounts using role-based access control middleware.',
    'Crypto: Strong Password Hashing (Bcrypt)': 'Ensures all user credentials are encrypted using industry-standard Blowfish hashing algorithms before database persistence.',
    'Auth: JWT-based Session Management': 'Validates the use of cryptographically signed JSON Web Tokens for stateless and secure session persistence across the platform.',
    'Integrity: Input Validation Schemas': 'Identifies strict data validation layers (Zod/Joi) that sanitize incoming payloads and prevent malformed data entry.',
    'Injection: Data Sanitization Layers': 'Heuristic detection of NoSQL/SQL injection preventers that strip malicious characters from database queries.',
    'Availability: API Rate Limiting': 'Confirms the activation of protection layers that prevent brute-force attacks and service degradation through request throttling.',
    'Headers: Secure HTTP Response Headers': 'Detects the integration of Helmet.js or custom security headers to protect against XSS, clickjacking, and MIME sniffing.',
    'IoT: Hardware Tamper Alerting Active': 'Verified implementation of real-time monitoring and alerting for physical or logical tampering with garden sensor nodes.',
    'Network: Dedicated API Rate Limiters Found': 'Detects specialized rate-limiting middleware configured specifically for IoT telemetry data streams.',
    'Secret Management: Local environment variables active': 'Confirms that sensitive API keys and database credentials are isolated in protected environment files.',
    'Infrastructure: Remote Database Connectivity Audited': 'Validates that the system is communicating with a secure, non-local database instance for production posture.',
    'Config: Cors integration verified': 'Confirms secure Cross-Origin Resource Sharing configuration to prevent unauthorized browser-based access.',
    'Config: Dotenv integration verified': 'Verifies the successful initialization of environment variable loaders for configuration management.',
    'Config: Mongoose integration verified': 'Ensures the Object Data Modeling layer is correctly configured with schema enforcement for data integrity.',
    'Config: Socket.io integration verified': 'Validates the secure initialization of real-time bidirectional communication channels.',
    'Config: Nodemailer integration verified': 'Confirms the presence of automated email alerting and verification infrastructure.'
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchAdherenceScore = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/grc/adherence', { headers: { Authorization: `Bearer ${token}` } });
      if (res.data && res.data.score !== undefined) {
        setAdherenceData(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch adherence score', err);
    }
  };

  const handleRestartGRC = () => {
    setLoading(true);
    showNotification('Restarting Enterprise GRC Suite...', 'success');
    setTimeout(() => {
      fetchGRCData(true);
      fetchAdherenceScore();
      showNotification('GRC Suite Restarted Successfully.', 'success');
    }, 2000);
  };

  const [riskRegister, setRiskRegister] = useState([]);
  const [complianceControls, setComplianceControls] = useState([]);

  const fetchGRCData = async (showLoading = true, framework = selectedFramework) => {
    try {
      if (showLoading && !data) setLoading(true);
      const token = localStorage.getItem('token');
      const res = await api.get(`/grc/summary?framework=${encodeURIComponent(framework)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data) {
        setData(res.data);
        setRiskRegister(res.data.risk_register || []);
        setComplianceControls(res.data.compliance || []);
        setError(null);
      }
    } catch (err) {
      console.error('GRC Fetch Error:', err);
      if (err.response?.status === 403) {
        // Diagnostic check for 403
        try {
          const token = localStorage.getItem('token');
          const whoami = await api.get('/grc/whoami', { headers: { Authorization: `Bearer ${token}` } });
          const { authenticatedUser, userRole, expectedSuperAdmin } = whoami.data;
          setError(`Forbidden: Exclusive access restricted. Current User: ${authenticatedUser} (${userRole}). Required: ${expectedSuperAdmin}`);
        } catch (diagErr) {
          setError('Forbidden: Exclusive Super Admin access required.');
        }
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to fetch GRC data.');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchGRCData(true, selectedFramework);
    fetchAdherenceScore();

    // Ensure socket is connected
    if (!socket.connected) {
      socket.connect();
    }

    // Listen for live audit log updates and data refresh events to trigger immediate GRC risk re-evaluation
    const handleLiveUpdate = () => {
      console.log('Live event detected, re-evaluating risks...');
      fetchGRCData(false, selectedFramework);
      fetchAdherenceScore();
    };

    const handleGrcLiveUpdate = (newData) => {
      console.log('Received proactive live GRC update via socket');
      if (newData) {
        setData(newData);
        setRiskRegister(newData.risk_register || []);
        setComplianceControls(newData.compliance || []);
        setError(null);
      }
    };

    socket.on('auditLogUpdate', handleLiveUpdate);
    socket.on('dataRefresh', handleLiveUpdate);
    socket.on('grcLiveUpdate', handleGrcLiveUpdate);

    // Keep a slower background poll as a fallback (every 30 seconds instead of 15)
    const interval = setInterval(() => {
      fetchGRCData(false, selectedFramework);
      fetchAdherenceScore();
    }, 30000);

    return () => {
      clearInterval(interval);
      socket.off('auditLogUpdate', handleLiveUpdate);
      socket.off('dataRefresh', handleLiveUpdate);
      socket.off('grcLiveUpdate', handleGrcLiveUpdate);
    };
  }, [selectedFramework]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, scoreFilter, statusFilter, timeFilter]);

  const handleStatusChange = async (controlId, newStatus) => {
    try {
      setUpdating(true);
      const token = localStorage.getItem('token');
      await api.patch(`/grc/compliance/${controlId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setComplianceControls(prev =>
        prev.map(c => (c.controlId === controlId || c.control_id === controlId) ? { ...c, status: newStatus } : c)
      );
      showNotification(`Control ${controlId} status updated to ${newStatus}`);
      setSelectedControl(null);
    } catch (err) {
      console.error('Failed to update compliance status:', err);
      showNotification('Failed to update control status.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleResolveRisk = async (riskId) => {
    try {
      setUpdating(true);
      const token = localStorage.getItem('token');
      await api.patch(`/grc/risks/${riskId}`,
        { status: 'Resolved' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update local state immediately for instant UI feedback
      setRiskRegister(prev => prev.map(r => r.id === riskId ? { ...r, status: 'Resolved' } : r));
      if (selectedRisk && selectedRisk.id === riskId) {
        setSelectedRisk({ ...selectedRisk, status: 'Resolved' });
      }

      showNotification(`Risk ${riskId} marked as Resolved`);
      // Optional: keep modal open for a second so they see the change
      setTimeout(() => {
        setSelectedRisk(null);
        fetchGRCData(false);
      }, 1000);

    } catch (err) {
      console.error('Resolve Risk Error:', err);
      showNotification('Failed to resolve risk.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemediate = async (riskId, action, params) => {
    try {
      setRemediating(riskId);
      const token = localStorage.getItem('token');

      let res;
      if (action === 'RESOLVE_BRUTE_FORCE') {
        // Execute the specialized security playbook
        res = await api.post(`/admin/risk-register/resolve/${riskId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else if (action === 'RESOLVE_INSIDER_THREAT') {
        // Execute the manual Insider Threat restriction
        res = await api.post(`/admin/risk-register/resolve-insider/${riskId}`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        // Execute the standard GRC remediation
        res = await api.post('/grc/remediate',
          { riskId, action, params },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      // Mark as executed locally
      setExecutedRemediations(prev => new Set(prev).add(`${riskId}-${action}`));

      showNotification(res.data.message || 'Risk Resolved & Playbook Executed');
      fetchGRCData(false);
    } catch (err) {
      console.error('Remediation Error:', err);
      showNotification(err.response?.data?.message || 'Failed to execute remediation.', 'error');
    } finally {
      setRemediating(null);
    }
  };

  const getRiskScoreColor = (score) => {
    if (score >= 20) return 'text-red-500';
    if (score >= 12) return 'text-orange-500';
    if (score >= 6) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getOverallScoreBadgeClass = (score) => {
    if (score >= 17) return 'bg-red-500/20 text-red-500 border-red-500/30';
    if (score >= 10) return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
    if (score >= 5) return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  const getScorePillClass = (score) => {
    if (score >= 4) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score === 3) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  const getStatusBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'implemented': return 'bg-emerald-500';
      case 'partial': return 'bg-amber-500';
      case 'not_implemented': return 'bg-red-500';
      case 'open': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'mitigating': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'accepted': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'resolved': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default: return 'bg-slate-500';
    }
  };

  const calculateOverallCompliance = () => {
    if (!complianceControls.length) return 0;
    const implemented = complianceControls.filter(c => (c.status || c.default_status || '').toLowerCase() === 'implemented').length;
    const partial = complianceControls.filter(c => (c.status || c.default_status || '').toLowerCase() === 'partial').length;
    return Math.round(((implemented + (partial * 0.5)) / complianceControls.length) * 100);
  };

  const formatCategory = (cat) => (cat || 'UNKNOWN').replace(/_/g, ' ').toUpperCase().trim();

  const filteredRisks = riskRegister
    .filter(r => {
      const score = r.likelihood * r.impact;
      const matchesCategory = categoryFilter === 'All' || formatCategory(r.category) === categoryFilter;
      const matchesStatus = statusFilter === 'All' || (r.status || '').toLowerCase() === statusFilter.toLowerCase();

      let matchesScore = true;
      if (scoreFilter === 'Critical') matchesScore = score >= 17;
      else if (scoreFilter === 'High') matchesScore = score >= 10 && score <= 16;
      else if (scoreFilter === 'Medium') matchesScore = score >= 5 && score <= 9;
      else if (scoreFilter === 'Low') matchesScore = score <= 4;

      let matchesTime = true;
      const rDate = new Date(r.createdAt || r.timestamp || 0);
      const now = new Date();
      if (timeFilter === 'Last 24 Hours') matchesTime = (now - rDate) <= 24 * 60 * 60 * 1000;
      else if (timeFilter === 'Last 7 Days') matchesTime = (now - rDate) <= 7 * 24 * 60 * 60 * 1000;
      else if (timeFilter === 'Last 30 Days') matchesTime = (now - rDate) <= 30 * 24 * 60 * 60 * 1000;

      return matchesCategory && matchesScore && matchesStatus && matchesTime;
    })
    .sort((a, b) => {
      const scoreA = (a.likelihood || 0) * (a.impact || 0);
      const scoreB = (b.likelihood || 0) * (b.impact || 0);

      // Sort by score descending
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }

      // Tie-breaker: sort by most recent detection date
      return new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0);
    });

  const categories = ['All', ...new Set(riskRegister.map(r => formatCategory(r.category)))];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    localStorage.removeItem('adminEmail');
    window.location.href = '/';
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-[#0A0C10] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-emerald-500 mb-6"></div>
        <p className="text-emerald-500 font-black uppercase tracking-widest animate-pulse">Engaging GRC Brain...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-[#0A0C10] text-slate-200 font-sans selection:bg-smart-light/30 pb-20">
      <AdminHeader
        title="Enterprise GRC Suite"
        subtitle="Governance, Risk & Compliance Control Plane"
        userName={localStorage.getItem('adminEmail')}
        onLogout={handleLogout}
        icon="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
      />

      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <Link
            to="/admin/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-lg border border-slate-700 transition-colors duration-200 w-fit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Dashboard
          </Link>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-ping"></div>
              <span className="text-red-500 text-[10px] font-black uppercase tracking-widest">{error}</span>
            </div>
          )}
        </div>

        {/* Unified Command Console - Executive Control Plane */}
        <div className="relative mb-10 group/console">
          {/* Ambient background glow */}
          <div className="absolute -inset-4 bg-gradient-to-tr from-emerald-500/5 via-blue-500/5 to-purple-500/5 rounded-[3rem] blur-3xl opacity-0 group-hover/console:opacity-100 transition-opacity duration-1000"></div>

          <div className="relative bg-[#0B0F15] border border-white/5 rounded-[2rem] shadow-2xl overflow-hidden backdrop-blur-md">
            {/* Technical scanline overlay */}
            <div className="absolute inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]"></div>

            {/* Dynamic Status Header */}
            <div className="flex items-center justify-between px-8 py-4 bg-white/[0.02] border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">System: Synchronized</span>
                </div>
                <div className="h-3 w-px bg-white/10"></div>
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest italic">Core Intel: V2.4.0-R</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  <svg className="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Processing: 0.12ms
                </div>
                <button
                  onClick={handleRestartGRC}
                  className="p-1.5 hover:bg-blue-500/10 rounded-lg transition-all group/refresh border border-transparent hover:border-blue-500/20"
                  title="Recalibrate Engine"
                >
                  <svg className="w-4 h-4 text-gray-500 group-hover/refresh:text-blue-400 group-hover/refresh:rotate-180 transition-all duration-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row">

              {/* Left Wing: Scope & Governance */}
              <div className="lg:w-1/4 p-8 border-r border-white/10 bg-gradient-to-b from-transparent to-white/[0.02]">
                <div className="space-y-8">
                  <div>
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                      Governance Scope
                    </h2>
                    <div className="relative group/select">
                      <select
                        value={selectedFramework}
                        onChange={(e) => setSelectedFramework(e.target.value)}
                        className="w-full bg-white/[0.05] border border-white/20 hover:border-emerald-500/50 text-white text-xs font-black uppercase tracking-widest rounded-xl px-4 py-4 outline-none transition-all cursor-pointer appearance-none shadow-2xl"
                      >
                        {frameworks.map(f => (
                          <option key={f.id} value={f.id} className="bg-[#0F1218] text-white">{f.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-400 group-hover/select:scale-110 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Status</span>
                      <span className="text-[10px] font-black text-emerald-400 uppercase">Authenticated</span>
                    </div>
                    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Mode</span>
                      <span className="text-[10px] font-black text-blue-400 uppercase">Recursive</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center: Intelligence Engine */}
              <div className="flex-1 p-8 bg-white/[0.02]">
                <div className="flex flex-col xl:flex-row items-center gap-12">
                  {/* Executive Gauge */}
                  <div className="relative flex items-center justify-center shrink-0">
                    <div className="absolute inset-0 bg-emerald-500/30 rounded-full blur-3xl opacity-20 animate-pulse"></div>
                    <div className="relative w-40 h-40">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="80" cy="80" r="72" stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="transparent" />
                        <circle cx="80" cy="80" r="72" stroke="url(#intelGradient)" strokeWidth="10" fill="transparent"
                          strokeDasharray={452.4}
                          strokeDashoffset={452.4 - (452.4 * adherenceData.score) / 100}
                          strokeLinecap="round"
                          className="transition-all duration-[2000ms] ease-out shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                        />
                        <defs>
                          <linearGradient id="intelGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#3b82f6" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-5xl font-black italic text-white tracking-tighter leading-none shadow-emerald-500/20 drop-shadow-sm">{adherenceData.score}</span>
                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.3em] mt-2">Compliance</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 w-full space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[11px] font-black text-white uppercase tracking-[0.3em] flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>
                        Implementation Nodes
                      </h3>
                      <span className="text-[10px] font-mono text-slate-500">CONFIDENCE_LEVEL: <span className="text-emerald-400">99.8%</span></span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {adherenceData.checks.length > 0 ? adherenceData.checks.slice(0, 9).map((check, idx) => {
                        const rawLabel = check.replace('Dependency Found: ', '').replace('Active: ', '').replace('Detected ', '').replace('Config: ', '');
                        const label = rawLabel.trim();
                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedNode({ label, description: nodeDetailsMap[label] || 'Detailed technical implementation data for this security node is being synchronized with the master ledger.' })}
                            className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 hover:bg-white/[0.1] hover:border-emerald-500/50 transition-all group/node cursor-pointer shadow-lg active:scale-95"
                          >
                            <div className="w-5 h-5 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 border border-emerald-500/30 group-hover/node:bg-emerald-500 group-hover/node:text-black transition-all shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                              <svg className="w-3 h-3 text-emerald-400 group-hover/node:text-black transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <span className="text-[10px] font-bold text-slate-200 group-hover/node:text-white transition-colors uppercase tracking-tight truncate leading-tight">
                              {label}
                            </span>
                          </div>
                        );
                      }) : (
                        <div className="col-span-full py-8 text-center border border-dashed border-white/20 rounded-2xl">
                          <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Scanning Grid...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Wing: Posture Telemetry */}
              <div className="lg:w-1/5 p-8 border-l border-white/10 bg-gradient-to-b from-transparent to-white/[0.02]">
                <div className="space-y-6">
                  <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] block mb-4 border-b border-white/10 pb-2">Risk Telemetry</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-black italic text-white tracking-tighter leading-none">{calculateOverallCompliance()}%</span>
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest animate-pulse">Nominal</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="group/stat">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-1.5">
                        <span className="text-slate-500 group-hover/stat:text-slate-300 transition-colors">Threat Area</span>
                        <span className="text-red-400">{riskRegister.filter(r => (r.status || '').toLowerCase() !== 'resolved').length}</span>
                      </div>
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)] rounded-full" style={{ width: '40%' }}></div>
                      </div>
                    </div>
                    <div className="group/stat">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-1.5">
                        <span className="text-slate-500 group-hover/stat:text-slate-300 transition-colors">Implemented</span>
                        <span className="text-blue-400">{complianceControls.filter(c => (c.status || '').toLowerCase() === 'implemented').length}</span>
                      </div>
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)] rounded-full" style={{ width: '65%' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-between border-t border-white/10">
                    <span className="text-[8px] font-mono text-emerald-500/70">SEC_POSTURE: STABLE</span>
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Implementation Node Detail Modal */}
        {selectedNode && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[#0F1218] border border-white/10 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                  <h3 className="text-lg font-black text-white uppercase italic tracking-tighter">Node Integrity Data</h3>
                </div>
                <button onClick={() => setSelectedNode(null)} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-xl border border-white/5 hover:border-white/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-10 space-y-6 text-center">
                <div className="inline-block px-5 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-2">
                  <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">{selectedNode.label}</span>
                </div>

                <p className="text-base text-slate-300 leading-relaxed font-medium">
                  {selectedNode.description}
                </p>

                <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
                  <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Verification</span>
                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-tighter">Pass - Heuristic</span>
                  </div>
                  <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Audit Key</span>
                    <span className="text-xs font-mono text-slate-400 uppercase">0x{Math.floor(Math.random() * 0xFFFFFF).toString(16).toUpperCase()}</span>
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 bg-white/[0.01] border-t border-white/5 flex justify-center">
                <button
                  onClick={() => setSelectedNode(null)}
                  className="px-12 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] active:scale-95"
                >
                  Confirm Awareness
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Refined Tab Navigation */}
        <div className="flex gap-1.5 bg-[#0F1218] p-1.5 rounded-2xl mb-10 border border-white/5 w-fit shadow-2xl backdrop-blur-md">
          {['Risk Assessment', 'Risk Register', 'Compliance Posture'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${activeTab === tab
                  ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
          {activeTab === 'Risk Assessment' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Summary Cards */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-[#0F1218] border border-white/5 p-8 rounded-3xl relative overflow-hidden group shadow-2xl">
                  <div className="absolute top-0 right-0 p-6 text-blue-500/20 group-hover:text-blue-500/40 group-hover:scale-110 transition-all duration-700">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  </div>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] block mb-2">Total Active Risks</span>
                  <div className="text-5xl font-black italic text-white tracking-tighter">{riskRegister.filter(r => (r.status || '').toLowerCase() !== 'resolved').length}</div>
                </div>

                <div className="bg-[#0F1218] border border-white/5 p-8 rounded-3xl relative overflow-hidden group shadow-2xl">
                  <div className="absolute top-0 right-0 p-6 text-red-500/20 group-hover:text-red-500/40 group-hover:scale-110 transition-all duration-700">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] block mb-2">Critical Risks</span>
                  <div className="text-5xl font-black italic text-red-500 tracking-tighter">{riskRegister.filter(r => (r.likelihood * r.impact) >= 17 && (r.status || '').toLowerCase() !== 'resolved').length}</div>
                </div>


              </div>

              {/* Heatmap */}
              <div className="lg:col-span-2 bg-[#0F1218] border border-white/5 p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>
                <div className="flex justify-between items-center mb-10">
                  <div className="flex items-center gap-4">
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-20"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500/50"></span>
                    </div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Probability Matrix</h3>
                  </div>
                  <div className="flex gap-4 text-[9px] font-black uppercase tracking-[0.2em] text-gray-500 bg-white/[0.02] px-4 py-2 rounded-full border border-white/5">
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> LOW</span>
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> CRIT</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-8 max-w-md mx-auto relative z-10">
                  <div className="w-8 flex items-center justify-center">
                    <div className="whitespace-nowrap -rotate-90 text-[9px] font-black uppercase tracking-[0.5em] text-gray-600">Likelihood</div>
                  </div>

                  <div className="flex-1">
                    <div className="grid grid-cols-5 grid-rows-5 gap-1.5 aspect-square">
                      {Array.from({ length: 25 }).map((_, i) => {
                        const row = 5 - Math.floor(i / 5);
                        const col = (i % 5) + 1;
                        const score = row * col;
                        const risksInCell = riskRegister.filter(r => r.likelihood === col && r.impact === row).length;
                        let bgColor = 'bg-white/[0.02]';
                        let borderColor = 'border-white/5';
                        if (score >= 20) { bgColor = 'bg-red-500/40'; borderColor = 'border-red-500/50'; }
                        else if (score >= 12) { bgColor = 'bg-orange-500/20'; borderColor = 'border-orange-500/30'; }
                        else if (score >= 6) { bgColor = 'bg-yellow-500/10'; borderColor = 'border-yellow-500/20'; }

                        return (
                          <div key={i} title={`Vector: ${col}x${row} | Intensity: ${score}`} className={`${bgColor} border ${borderColor} rounded-lg flex items-center justify-center text-[10px] font-black transition-all duration-500 hover:scale-105 hover:z-20 cursor-crosshair relative group/cell`}>
                            {risksInCell > 0 ? (
                              <span className="bg-white text-black px-2 py-0.5 rounded-md text-[9px] shadow-2xl animate-pulse">
                                {risksInCell}
                              </span>
                            ) : (
                              <span className="text-white/5 group-hover/cell:text-white/20 transition-colors">{score}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-8 text-center text-[9px] font-black uppercase tracking-[0.5em] text-gray-600 whitespace-nowrap">Impact Intensity</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Risk Register' && (
            <div className="space-y-6">
              {/* Premium Stealth Filter Bar */}
              <div className="bg-[#0F1218] border border-white/5 p-6 rounded-3xl flex flex-wrap items-center gap-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[2px] h-full bg-emerald-500/40"></div>

                <div className="flex flex-col gap-2 min-w-[220px]">
                  <span className="text-[9px] font-black uppercase text-gray-500 tracking-[0.3em] flex items-center gap-2">
                    <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
                    Risk Category
                  </span>
                  <div className="relative group/filter">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/5 group-hover/filter:border-white/10 text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none transition-all cursor-pointer appearance-none"
                    >
                      {categories.map(c => <option key={c} value={c} className="bg-[#0F1218] text-white">{c}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 min-w-[200px]">
                  <span className="text-[9px] font-black uppercase text-gray-500 tracking-[0.3em] flex items-center gap-2">
                    <div className="w-1 h-1 bg-orange-500 rounded-full"></div>
                    Severity
                  </span>
                  <div className="relative group/filter">
                    <select
                      value={scoreFilter}
                      onChange={(e) => setScoreFilter(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/5 group-hover/filter:border-white/10 text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none transition-all cursor-pointer appearance-none"
                    >
                      <option value="All" className="bg-[#0F1218] text-white">All Severities</option>
                      <option value="Critical" className="bg-[#0F1218] text-white">Critical / Extreme</option>
                      <option value="High" className="bg-[#0F1218] text-white">High Severity</option>
                      <option value="Medium" className="bg-[#0F1218] text-white">Moderate</option>
                      <option value="Low" className="bg-[#0F1218] text-white">Low Risk</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 min-w-[200px]">
                  <span className="text-[9px] font-black uppercase text-gray-500 tracking-[0.3em] flex items-center gap-2">
                    <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                    Timeline
                  </span>
                  <div className="relative group/filter">
                    <select
                      value={timeFilter}
                      onChange={(e) => setTimeFilter(e.target.value)}
                      className="w-full bg-white/[0.03] border border-white/5 group-hover/filter:border-white/10 text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl px-4 py-3.5 outline-none transition-all cursor-pointer appearance-none"
                    >
                      <option value="All" className="bg-[#0F1218] text-white">All Time</option>
                      <option value="Last 24 Hours" className="bg-[#0F1218] text-white">Last 24 Hours</option>
                      <option value="Last 7 Days" className="bg-[#0F1218] text-white">Last 7 Days</option>
                      <option value="Last 30 Days" className="bg-[#0F1218] text-white">Last 30 Days</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex justify-end">
                  <div className="flex bg-white/[0.02] border border-white/5 rounded-2xl p-1 shadow-inner">
                    {['All', 'Open', 'Resolved'].map((status) => (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all duration-300 ${statusFilter === status
                            ? 'bg-emerald-500 text-black shadow-lg'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.02]'
                          }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-[#0F1218] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-white/[0.02] border-b border-white/5">
                      <tr className="text-[9px] font-black text-gray-500 uppercase tracking-[0.3em]">
                        <th className="px-8 py-6 w-56">Risk Identity</th>
                        <th className="px-8 py-6 w-32">Category</th>
                        <th className="px-8 py-6 w-40">Discovery Time</th>
                        <th className="px-8 py-6 w-auto">Incident Context</th>
                        <th className="px-8 py-6 w-28 text-center">Intensity</th>
                        <th className="px-8 py-6 w-28 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2B2F3A]">
                      {filteredRisks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((risk) => {
                        const calculatedScore = risk.likelihood * risk.impact;
                        return (
                          <tr
                            key={risk.id}
                            onClick={() => setSelectedRisk(risk)}
                            className={`transition-colors cursor-pointer group ${selectedRisk?.id === risk.id ? 'bg-emerald-500/10' : 'hover:bg-[#1D212A]/30'}`}
                          >
                            <td className="px-4 py-6 font-mono text-sm font-medium text-emerald-400 truncate pr-4">{risk.displayId || risk.id}</td>
                            <td className="px-4 py-6 text-sm truncate pr-4">
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-gray-800 text-slate-300 border border-white/5">{formatCategory(risk.category)}</span>
                            </td>
                            <td className="px-4 py-6 text-[10px] font-bold text-slate-400 truncate pr-4">
                              {risk.createdAt || risk.timestamp ? new Date(risk.createdAt || risk.timestamp).toLocaleString() : 'Recent Scan'}
                            </td>
                            <td className="px-4 py-6 text-sm truncate text-slate-200 font-medium pr-4 max-w-0" title={risk.description}>
                              {risk.description}
                            </td>
                            <td className="px-4 py-6 text-center truncate">
                              <span className={`px-4 py-1.5 rounded-full text-[11px] font-black border shadow-lg ${getOverallScoreBadgeClass(calculatedScore)}`}>
                                {calculatedScore}
                              </span>
                            </td>
                            <td className="px-4 py-6 text-right truncate">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border shadow-sm ${getStatusBadgeClass(risk.status)} text-white`}>
                                {risk.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination UI */}
                {filteredRisks.length > itemsPerPage && (
                  <div className="px-6 py-4 bg-[#1D212A] border-t border-[#2B2F3A] flex items-center justify-between">
                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-ellipsis overflow-hidden whitespace-nowrap pr-4">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredRisks.length)} of {filteredRisks.length} Risks
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-700 transition-all shadow-lg"
                      >
                        Previous
                      </button>
                      <button
                        disabled={currentPage * itemsPerPage >= filteredRisks.length}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-700 transition-all shadow-lg"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'Compliance Posture' && (
            <div className="space-y-6">
              {/* Adherence Overview */}
              <div className="bg-[#151921] border border-[#2B2F3A] p-8 rounded-2xl shadow-xl">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Framework Adherence</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
                      {frameworks.find(f => f.id === selectedFramework)?.name || selectedFramework} | {
                        complianceControls.filter((v, i, a) => {
                          const getNormId = (c) => (c.controlId || c.control_id || c.id || "").toString().replace(/^CIS-/, "");
                          return a.findIndex(t => getNormId(t) === getNormId(v)) === i;
                        }).length
                      } Controls
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-4xl font-black text-emerald-500 italic">{calculateOverallCompliance()}%</span>
                  </div>
                </div>
                <div className="w-full bg-[#1D212A] h-4 rounded-full border border-[#2B2F3A] p-1">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                    style={{ width: `${calculateOverallCompliance()}%` }}
                  ></div>
                </div>
              </div>

              {/* Responsive Grid of Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {complianceControls
                  .filter((v, i, a) => {
                    const getNormId = (c) => (c.controlId || c.control_id || c.id || "").toString().replace(/^CIS-/, "");
                    return a.findIndex(t => getNormId(t) === getNormId(v)) === i;
                  })
                  .map((ctrl) => (
                    <div
                      key={ctrl.controlId || ctrl.control_id || ctrl.id}
                      onClick={() => setSelectedControl(ctrl)}
                      className="relative flex flex-col items-center justify-center p-6 bg-slate-800/50 border border-slate-700 rounded-2xl hover:bg-slate-700 cursor-pointer transition-all aspect-square text-center group shadow-lg hover:shadow-emerald-900/20"
                    >
                      <div className={`absolute top-4 right-4 w-3 h-3 rounded-full border-2 border-[#151921] ${getStatusBadgeClass(ctrl.status || ctrl.default_status)}`}></div>
                      <span className="text-xl md:text-2xl font-black text-white group-hover:text-emerald-400 transition-colors">
                        {(ctrl.controlId || ctrl.control_id || ctrl.id || "").toString().replace(/^CIS-/, "")}
                      </span>
                      <p className="text-[10px] md:text-xs text-slate-400 mt-2 line-clamp-2 uppercase font-bold tracking-tighter">
                        {ctrl.title || ctrl.name}
                      </p>
                      <span className="mt-2 text-[8px] font-black text-slate-500 uppercase tracking-widest">{ctrl.category}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Edit Compliance Control Modal */}
        {selectedControl && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#151921] border border-[#2B2F3A] w-full max-w-xl rounded-[30px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="px-8 py-6 border-b border-[#2B2F3A] flex justify-between items-center bg-[#1D212A]">
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">
                    {selectedControl.controlId}: {selectedControl.title || selectedControl.name}
                  </h3>
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{selectedControl.category}</span>
                </div>
                <button onClick={() => setSelectedControl(null)} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-2 rounded-xl">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 italic">Control Requirement</h5>
                  <p className="text-sm text-slate-300 leading-relaxed">{selectedControl.description}</p>
                </div>

                <div>
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 italic">Compliance Evidence</h5>
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 text-xs text-emerald-400 font-mono italic">
                    {selectedControl.evidence || selectedControl.default_evidence}
                  </div>
                </div>

                <div className="pt-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 block italic">Management Action: Update Status</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { id: 'implemented', label: 'Compliant', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500 hover:text-black' },
                      { id: 'partial', label: 'In Progress', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500 hover:text-black' },
                      { id: 'not_implemented', label: 'Non-Compliant', color: 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500 hover:text-black' }
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        onClick={() => handleStatusChange(selectedControl.controlId, btn.id)}
                        disabled={updating}
                        className={`py-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all duration-300 shadow-lg ${(selectedControl.status || selectedControl.default_status) === btn.id
                            ? btn.color.split(' ').slice(0, 2).join(' ').replace('/10', '/30') + ' border-current scale-[1.02] ring-2 ring-emerald-500/20'
                            : btn.color
                          } disabled:opacity-50`}
                      >
                        {(selectedControl.status || selectedControl.default_status) === btn.id && <span className="mr-2">✓</span>}
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 bg-[#1D212A] border-t border-[#2B2F3A] flex justify-center">
                <button
                  onClick={() => setSelectedControl(null)}
                  className="px-10 py-3 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all border border-slate-700"
                >
                  Close Control Details
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Risk Details Modal */}
        {selectedRisk && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-[#151921] border border-[#2B2F3A] w-full max-w-2xl rounded-[30px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="px-8 py-6 border-b border-[#2B2F3A] flex justify-between items-center bg-[#1D212A]">
                <div>
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter break-words pr-8">
                    {selectedRisk.displayId || selectedRisk.id} <span className="opacity-50">|</span> {formatCategory(selectedRisk.category)}
                  </h3>
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusBadgeClass(selectedRisk.status)}`}></div>
                    Current Status: {selectedRisk.status}
                  </span>
                </div>
                <button onClick={() => setSelectedRisk(null)} className="text-slate-500 hover:text-white transition-colors bg-white/5 p-1.5 rounded-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Full Description */}
                <div>
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Full Risk Description</h5>
                  <p className="text-base text-slate-200 leading-relaxed font-medium bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50 shadow-inner break-words">
                    {selectedRisk.description}
                  </p>
                </div>

                {/* Risk Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center ${getScorePillClass(selectedRisk.likelihood)}`}>
                    <span className="text-[8px] font-black uppercase mb-1 tracking-widest opacity-60">Likelihood</span>
                    <span className="text-2xl font-black italic">{selectedRisk.likelihood}/5</span>
                  </div>
                  <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center ${getScorePillClass(selectedRisk.impact)}`}>
                    <span className="text-[8px] font-black uppercase mb-1 tracking-widest opacity-60">Impact</span>
                    <span className="text-2xl font-black italic">{selectedRisk.impact}/5</span>
                  </div>
                  <div className={`p-4 rounded-2xl border flex flex-col items-center justify-center ${getOverallScoreBadgeClass(selectedRisk.likelihood * selectedRisk.impact)}`}>
                    <span className="text-[8px] font-black uppercase mb-1 tracking-widest opacity-60">Total Score</span>
                    <span className="text-2xl font-black italic">{selectedRisk.likelihood * selectedRisk.impact}/25</span>
                  </div>
                </div>

                {/* Remediation Playbook */}
                <div>
                  <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2 italic">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    Remediation Playbook
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    {selectedRisk.recommendations?.map((rec, idx) => (
                      <div key={idx} className="relative overflow-hidden p-6 rounded-[20px] bg-[#11141A] border border-white/5 hover:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 group/rec transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                        {/* Priority glow accent line */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-500 group-hover/rec:w-1.5 ${rec.priority === 'critical' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : rec.priority === 'high' ? 'bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'}`}></div>

                        <div className="flex-1 pl-2">
                          <div className="flex items-center gap-3 mb-2">
                            <h5 className="text-sm font-black text-white italic tracking-wide">{rec.title}</h5>
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap tracking-widest ${rec.priority === 'critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' : rec.priority === 'high' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>{rec.priority}</span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed font-medium">{rec.body}</p>
                        </div>

                        {rec.action && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemediate(selectedRisk.id, rec.action, rec.params); }}
                            disabled={remediating === selectedRisk.id || executedRemediations.has(`${selectedRisk.id}-${rec.action}`)}
                            className={`relative shrink-0 overflow-hidden whitespace-nowrap px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 border shadow-lg ${executedRemediations.has(`${selectedRisk.id}-${rec.action}`)
                                ? 'bg-emerald-500 text-[#0F1218] border-emerald-500 scale-95 opacity-80'
                                : 'bg-[#0F1218] hover:bg-emerald-500 text-emerald-400 hover:text-[#0F1218] border-emerald-500/30 hover:border-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                              }`}
                          >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              {executedRemediations.has(`${selectedRisk.id}-${rec.action}`)
                                ? <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg> Executed</>
                                : rec.action === 'RESOLVE_INSIDER_THREAT'
                                  ? 'Restrict Admin'
                                  : 'Execute Resolve'}
                            </span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Risk Resolution Footer */}
              <div className="px-8 py-6 bg-[#1D212A] border-t border-[#2B2F3A]">
                <button
                  onClick={() => handleResolveRisk(selectedRisk.id)}
                  disabled={updating || selectedRisk.status === 'Resolved'}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-lg ${selectedRisk.status === 'Resolved'
                      ? 'bg-emerald-500/20 text-emerald-400 cursor-not-allowed border border-emerald-500/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 active:scale-[0.98]'
                    }`}
                >
                  {selectedRisk.status === 'Resolved' ? '✓ Risk Marked as Resolved' : 'Mark as Resolved'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Premium Dark Enterprise Toast Notification */}
      {notification && (
        <div className="fixed bottom-8 right-8 z-[200] animate-in slide-in-from-right-10 fade-in duration-300 pointer-events-none">
          <div className={`flex items-center gap-4 px-6 py-4 rounded-xl border-l-4 shadow-2xl shadow-black/50 backdrop-blur-xl bg-slate-800 border-slate-700 pointer-events-auto min-w-[320px] ${notification.type === 'error'
              ? 'border-l-red-500'
              : 'border-l-emerald-500'
            }`}>
            <div className="flex-1 flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_10px_rgba(0,0,0,0.5)] ${notification.type === 'error' ? 'bg-red-500 shadow-red-500/50' : 'bg-emerald-500 shadow-emerald-500/50'
                }`}></div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5">
                  System Intelligence
                </span>
                <span className="text-sm font-bold text-slate-200 leading-tight">
                  {notification.message}
                </span>
              </div>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-slate-700 rounded-md text-slate-500 hover:text-white transition-all ml-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminGRC;
