import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { socket } from '../socket';
import { useUI } from '../context/UIContext';
import { useTelemetry } from '../context/TelemetryContext';
import api from '../api';
import AdminHeader from '../components/AdminHeader';
import WidgetErrorBoundary from '../components/WidgetErrorBoundary';

// Helper function to decode JWT and check for expiration
const isTokenExpired = (token) => {
  if (!token || token === 'undefined' || token === 'null') return true;
  try {
    // Safely decode base64url payload to prevent atob() DOMExceptions
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    // Robust UTF-8 decoding to prevent DOMException errors on complex payloads
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );

    const payload = JSON.parse(jsonPayload);
    // Check if token is expired (exp is in seconds)
    return payload.exp ? Date.now() >= payload.exp * 1000 : false;
  } catch (error) {
    console.error('Failed to parse token:', error);
    return true; // Treat malformed tokens as expired
  }
};

const AdminDashboard = () => {
  const navigate = useNavigate();

  // Early return if token is missing (prevents crash during logout transition)
  if (!localStorage.getItem('token')) return null;

  const { showModal, showPrompt, showConfirm } = useUI();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const superAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
  const currentAdminEmail = (localStorage.getItem('adminEmail') || '').toLowerCase().trim();
  const isSuperAdmin = currentAdminEmail === superAdminEmail;

  const [regularUsers, setRegularUsers] = useState([]);
  const [subAdmins, setSubAdmins] = useState([]);
  const [totalUserPages, setTotalUserPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [manualTicketId, setManualTicketId] = useState('');
  const [scanMessage, setScanMessage] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const scannerRef = useRef(null);
  const [isCrowdInsightsExpanded, setIsCrowdInsightsExpanded] = useState(true);
  const [isUserManagementExpanded, setIsUserManagementExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [insightStartDate, setInsightStartDate] = useState(new Date());
  const [isHardwareAlertsExpanded, setIsHardwareAlertsExpanded] = useState(true);
  const [alertFilterType, setAlertFilterType] = useState('all');
  const [auditLogs, setAuditLogs] = useState([]);
  const [isAuditLogsExpanded, setIsAuditLogsExpanded] = useState(true);
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [auditLogHasMore, setAuditLogHasMore] = useState(false);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [bannedIPs, setBannedIPs] = useState([]);
  const [totalBannedIPs, setTotalBannedIPs] = useState(0);
  const [isBannedIPsExpanded, setIsBannedIPsExpanded] = useState(false);
  const [bannedIPsSearchQuery, setBannedIPsSearchQuery] = useState('');
  const [bannedIPsPage, setBannedIPsPage] = useState(1);
  const [bannedIPsHasMore, setBannedIPsHasMore] = useState(false);
  const [isLoadingBannedIPs, setIsLoadingBannedIPs] = useState(false);
  const [whitelistedIPs, setWhitelistedIPs] = useState([]);
  const [totalWhitelistedIPs, setTotalWhitelistedIPs] = useState(0);
  const [isWhitelistExpanded, setIsWhitelistExpanded] = useState(true);
  const [newWhitelistIP, setNewWhitelistIP] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [newWhitelistMac, setNewWhitelistMac] = useState('');
  const [whitelistedIPsSearchQuery, setWhitelistedIPsSearchQuery] = useState('');
  const [whitelistPage, setWhitelistPage] = useState(1);
  const [whitelistHasMore, setWhitelistHasMore] = useState(false);
  const [isLoadingWhitelist, setIsLoadingWhitelist] = useState(false);
  const {
    alerts,
    setAlerts,
    totalAlertsCount,
    setTotalAlertsCount,
    telemetryMatrix,
  } = useTelemetry();

  const [alertPage, setAlertPage] = useState(1);
  const [totalAlertPages, setTotalAlertPages] = useState(1);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

  const [userPage, setUserPage] = useState(1);

  const [monthlySales, setMonthlySales] = useState([]);
  const [isMonthlySalesExpanded, setIsMonthlySalesExpanded] = useState(false);
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  const isSalesFilteredRef = useRef(false);
  const [backups, setBackups] = useState([]);
  const [isBackupsExpanded, setIsBackupsExpanded] = useState(true);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState(null);
  const [pendingCashTickets, setPendingCashTickets] = useState([]);
  const [isLoadingPendingCash, setIsLoadingPendingCash] = useState(false);
  const [cashSearchQuery, setCashSearchQuery] = useState('');
  const [cashFilterStatus, setCashFilterStatus] = useState('PENDING'); // PENDING or PAID
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');

  // Sync activeTab state with URL search params
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }

    // Capture ticketId from URL if present (e.g. from User Tickets View)
    const ticketIdFromUrl = searchParams.get('ticketId');
    if (ticketIdFromUrl) {
      setManualTicketId(ticketIdFromUrl);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (tabId) => {
    if (tabId === 'grc') {
      navigate('/admin/grc');
      return;
    }
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminIp, setNewAdminIp] = useState('');
  const [newAdminMac, setNewAdminMac] = useState('');
  const [isSubAdminProvisioningExpanded, setIsSubAdminProvisioningExpanded] = useState(true);
  const [isSubAdminsExpanded, setIsSubAdminsExpanded] = useState(true);

  const [syncTrigger, setSyncTrigger] = useState(0);
  const [isLockedUI, setIsLockedUI] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const scanLock = useRef(false);

  // Effect to track actual camera status in the DOM (detects when video is active)
  useEffect(() => {
    const readerElement = document.getElementById('reader');
    if (!readerElement) return;

    const observer = new MutationObserver(() => {
      const isVideoActive = !!readerElement.querySelector('video');
      setIsCameraActive(isVideoActive);
    });

    observer.observe(readerElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [activeTab]);
  const [backupSyncTrigger, setBackupSyncTrigger] = useState(0);
  const [dataRefreshTrigger, setDataRefreshTrigger] = useState(0);

  const [unreadAuditCount, setUnreadAuditCount] = useState(0);
  const isAuditLogsExpandedRef = useRef(isAuditLogsExpanded);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const isHardwareAlertsExpandedRef = useRef(isHardwareAlertsExpanded);
  const [unreadBannedCount, setUnreadBannedCount] = useState(0);
  const isBannedIPsExpandedRef = useRef(isBannedIPsExpanded);
  const alertPageRef = useRef(alertPage);
  const userPageRef = useRef(userPage);
  const auditLogPageRef = useRef(auditLogPage);
  const bannedIPsPageRef = useRef(bannedIPsPage);
  const whitelistPageRef = useRef(whitelistPage);

  useEffect(() => {
    alertPageRef.current = alertPage;
  }, [alertPage]);

  useEffect(() => {
    userPageRef.current = userPage;
  }, [userPage]);

  useEffect(() => {
    auditLogPageRef.current = auditLogPage;
  }, [auditLogPage]);

  useEffect(() => {
    bannedIPsPageRef.current = bannedIPsPage;
  }, [bannedIPsPage]);

  useEffect(() => {
    whitelistPageRef.current = whitelistPage;
  }, [whitelistPage]);

  useEffect(() => {
    isAuditLogsExpandedRef.current = activeTab === 'security' && isAuditLogsExpanded;
    if (activeTab === 'security' && isAuditLogsExpanded) setUnreadAuditCount(0);
  }, [activeTab, isAuditLogsExpanded]);

  useEffect(() => {
    isHardwareAlertsExpandedRef.current = activeTab === 'hardware' && isHardwareAlertsExpanded;
    if (activeTab === 'hardware' && isHardwareAlertsExpanded) setUnreadAlertsCount(0);
  }, [activeTab, isHardwareAlertsExpanded]);

  useEffect(() => {
    isBannedIPsExpandedRef.current = activeTab === 'security' && isBannedIPsExpanded;
    if (activeTab === 'security' && isBannedIPsExpanded) setUnreadBannedCount(0);
  }, [activeTab, isBannedIPsExpanded]);

  const isMountedForSales = useRef(false);
  useEffect(() => {
    if (!isMountedForSales.current) {
      isMountedForSales.current = true;
      return; // Skip on initial mount as fetchData handles it
    }
    isSalesFilteredRef.current = !!(salesStartDate || salesEndDate);

    const fetchFilteredSales = async () => {
      const token = localStorage.getItem('token');
      const params = {};
      if (salesStartDate) params.startDate = salesStartDate;
      if (salesEndDate) params.endDate = salesEndDate;

      try {
        const res = await api.get('/admin/monthly-sales', {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        setMonthlySales(res.data);
      } catch (err) {
        console.error('Failed to fetch filtered sales', err);
      }
    };
    fetchFilteredSales();
  }, [salesStartDate, salesEndDate]);

  // Fetch crowd insights
  const fetchInsights = React.useCallback(async () => {
    setLoadingInsights(true);
    try {
      const token = localStorage.getItem('token');
      if (isTokenExpired(token)) {
        handleLogout();
        return;
      }
      const dateStr = insightStartDate.toISOString().split('T')[0];
      const response = await api.get('/tickets/insights', {
        params: { startDate: dateStr },
        headers: { Authorization: `Bearer ${token}` },
      });
      setInsights(response.data);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
      setInsights(null);
    } finally {
      setLoadingInsights(false);
    }
  }, [insightStartDate]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      console.log('Token is expired or missing. Redirecting to login.');
      // Clear potentially bad token and user info
      localStorage.removeItem('token');
      localStorage.removeItem('adminEmail');
      localStorage.removeItem('role');
      navigate('/');
      return;
    }

    const fetchData = async () => {
      try {
        const statsRes = await api.get('/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setStats(statsRes.data);

        const usersRes = await api.get('/admin/users', {
          params: { role: 'user', page: 1, limit: 10 },
          headers: { Authorization: `Bearer ${token}` },
        });
        setRegularUsers(usersRes.data.users || []);
        setTotalUserPages(usersRes.data.totalPages || 1);
        setTotalUsersCount(usersRes.data.totalUsers || 0);

        const adminsRes = await api.get('/admin/users', {
          params: { role: 'admin' },
          headers: { Authorization: `Bearer ${token}` },
        });
        setSubAdmins(adminsRes.data.users || []);

        if (isSuperAdmin) {
          const auditLogsRes = await api.get('/admin/audit-logs', {
            params: { page: 1, limit: 10 },
            headers: { Authorization: `Bearer ${token}` },
          });
          setAuditLogs(auditLogsRes.data.logs);
          setAuditLogHasMore(auditLogsRes.data.currentPage < auditLogsRes.data.totalPages);

          const bannedIPsRes = await api.get('/admin/banned-ips', {
            params: { page: 1, limit: 10 },
            headers: { Authorization: `Bearer ${token}` },
          });
          setBannedIPs(bannedIPsRes.data.bannedIPs);
          setTotalBannedIPs(bannedIPsRes.data.totalBannedIPs || 0);
          setBannedIPsHasMore(bannedIPsRes.data.currentPage < bannedIPsRes.data.totalPages);

          const whitelistRes = await api.get('/admin/whitelisted-ips', {
            params: { page: 1, limit: 10 },
            headers: { Authorization: `Bearer ${token}` },
          });
          setWhitelistedIPs(whitelistRes.data.ips);
          setTotalWhitelistedIPs(whitelistRes.data.totalIps || 0);
          setWhitelistHasMore(whitelistRes.data.currentPage < whitelistRes.data.totalPages);

          const backupsRes = await api.get('/admin/backups', {
            headers: { Authorization: `Bearer ${token}` },
          });
          setBackups(backupsRes.data);
        }

        const salesRes = await api.get('/admin/monthly-sales', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMonthlySales(salesRes.data);

        const alertsRes = await api.get('/admin/hardware-alerts', {
          params: { page: 1, limit: 10 },
          headers: { Authorization: `Bearer ${token}` },
        });
        const backendAlerts = alertsRes.data.alerts || (Array.isArray(alertsRes.data) ? alertsRes.data : []);
        setAlerts((prev) => {
          // Merge logic: take backend alerts, and append current alerts that aren't in the backend list
          const backendIds = new Set(backendAlerts.map(a => a._id));
          const uniqueCurrent = prev.filter(a => !backendIds.has(a._id));
          return [...backendAlerts, ...uniqueCurrent].slice(0, 100);
        });
        setTotalAlertPages(alertsRes.data.totalPages || 1);
        setTotalAlertsCount(alertsRes.data.totalAlerts || 0);
      } catch (error) {
        if (error.response?.status === 401) {
          handleLogout();
          return;
        }
        console.error('Failed to fetch data', error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchData();
  }, [navigate]);

  useEffect(() => {
    fetchInsights();
    fetchStats();
  }, [fetchInsights, syncTrigger]);

  const fetchStats = async () => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }
    try {
      const statsRes = await api.get('/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(statsRes.data);

      const salesRes = await api.get('/admin/monthly-sales', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMonthlySales(salesRes.data);
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
        return;
      }
      console.error('Failed to refresh stats', error);
    }
  };

  useEffect(() => {
    let timer;
    if (activeTab === 'hardware') {
      timer = setTimeout(() => {
        const readerElement = document.getElementById('reader');
        if (readerElement && !scannerRef.current) {
          scannerRef.current = new Html5Qrcode('reader');
        }
      }, 100);
    }

    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {});
        }
        scannerRef.current = null;
      }
    };
  }, [activeTab]);

  const handleToggleSensor = async () => {
    if (!scannerRef.current) return;

    if (isCameraActive) {
      try {
        await scannerRef.current.stop();
        setIsCameraActive(false);
      } catch (err) {
        console.error('Failed to stop scanner', err);
      }
    } else {
      try {
        await scannerRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          onScanFailure
        );
        setIsCameraActive(true);
      } catch (err) {
        console.error('Failed to start scanner', err);
        setScanMessage({ type: 'error', text: 'Camera access denied or not found.' });
      }
    }
  };

  const handleFileScan = async (e) => {
    if (!scannerRef.current || !e.target.files[0]) return;
    const imageFile = e.target.files[0];
    try {
      const decodedText = await scannerRef.current.scanFile(imageFile, true);
      onScanSuccess(decodedText);
    } catch (err) {
      setScanMessage({ type: 'error', text: 'No QR code found in image.' });
    }
  };

  const handleScanRequest = async (idToScan) => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      setScanMessage({ type: 'error', text: 'Your session has expired. Please log in again.' });
      handleLogout();
      return;
    }

    try {
      setScanMessage(null); // Clear previous message
      const response = await api.post(
        '/admin/scan',
        { ticketId: idToScan },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setScanMessage({ type: 'success', text: response.data.message });
      // Refresh stats immediately
      fetchStats();
    } catch (error) {
      console.error(error);
      const errorMessage = error.response?.data?.message || 'Scan failed';
      setScanMessage({ type: 'error', text: errorMessage });
      playErrorSound();
      if (error.response?.status === 401) {
        handleLogout();
      }
    }
  };

  const playSuccessSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const audioCtx = new AudioContext();
      
      const playNote = (freq, start, duration) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(start);
        osc.stop(start + duration);
      };

      // Play a professional C5 -> G5 chime
      playNote(523.25, audioCtx.currentTime, 0.15); // C5
      playNote(783.99, audioCtx.currentTime + 0.1, 0.25); // G5
      
      setTimeout(() => audioCtx.close(), 1000);
    } catch (err) {
      console.error('Audio success sound failed', err);
    }
  };

  const playErrorSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const audioCtx = new AudioContext();
      
      const playBuzz = (start) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, start);
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start(start);
        osc.stop(start + 0.2);
      };

      // Play a double-buzz error sound
      playBuzz(audioCtx.currentTime);
      playBuzz(audioCtx.currentTime + 0.25);
      
      setTimeout(() => audioCtx.close(), 1000);
    } catch (err) {
      console.error('Audio error sound failed', err);
    }
  };

  const onScanSuccess = (decodedText) => {
    if (scanLock.current || !decodedText) return; // Hard lock guard clause using Ref
    scanLock.current = true; // Lock immediately
    setIsLockedUI(true); // Trigger UI overlay

    playSuccessSound();
    
    let finalId = decodedText;
    // Check if it's a JWT from our system
    try {
      const parts = decodedText.split('.');
      if (parts.length === 3) {
        // Decode the base64 payload
        const payload = JSON.parse(atob(parts[1]));
        if (payload && payload.ticketId) {
          finalId = payload.ticketId;
        }
      }
    } catch (e) {
      console.warn('QR code is not a JWT, using raw ID', e);
    }

    handleScanRequest(finalId);
  };

  const onScanFailure = (error) => {
    // Ignore routine scan errors
  };

  const handleManualOverride = (e) => {
    e.preventDefault();
    const cleanId = manualTicketId.trim();
    if (cleanId) {
      handleScanRequest(cleanId);
      setManualTicketId('');
    }
  };

  const handleNextScan = () => {
    scanLock.current = false;
    setIsLockedUI(false);
    setScanMessage(null);
  };

  const handleUnlockScanner = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.post(
        '/admin/unlock-scanner',
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setScanMessage({ type: 'success', text: 'Scanner unlocked successfully.' });
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to unlock scanner';
      setScanMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleToggleCamera = () => {
    const selectElement = document.querySelector('#reader select');
    if (selectElement && selectElement.options.length > 1) {
      const nextIndex = (selectElement.selectedIndex + 1) % selectElement.options.length;
      selectElement.selectedIndex = nextIndex;
      selectElement.dispatchEvent(new Event('change'));
    } else {
      setScanMessage({
        type: 'error',
        text: 'Multiple cameras not detected or scanner not active yet.',
      });
    }
  };

  const handleRestrictUser = async (userId, currentStatus) => {
    let reason = '';
    if (!currentStatus) {
      reason = await showPrompt(
        'Please enter a reason for restricting this user:',
        'Restrict User',
        'Violating platform policies'
      );
      if (reason === null) return; // User cancelled prompt
    } else {
      const isConfirmed = await showConfirm(
        'Are you sure you want to remove restrictions from this user? They will be allowed to log in again.',
        'Remove Restriction'
      );
      if (!isConfirmed) return;
    }

    const token = localStorage.getItem('token');
    try {
      const res = await api.patch(
        `/admin/users/${userId}/restrict`,
        { reason },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      showModal(res.data.message, 'Success', 'success');

      // Update local state for immediate feedback
      const updatedData = { 
        isRestricted: !currentStatus, 
        restrictionReason: res.data.restrictionReason 
      };

      setRegularUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, ...updatedData } : u))
      );
      setSubAdmins((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, ...updatedData } : u))
      );
    } catch (error) {
      console.error('Failed to restrict user:', error);
      showModal(error.response?.data?.message || 'Action failed.', 'Error', 'error');
    }
  };

  const handleCreateSubAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminName || !newAdminEmail || !newAdminPassword || !newAdminIp) return;

    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      showModal('Your session has expired. Please log in again.', 'Session Expired', 'error');
      handleLogout();
      return;
    }
    try {
      const response = await api.post(
        '/admin/sub-admin',
        {
          name: newAdminName,
          email: newAdminEmail,
          password: newAdminPassword,
          ipAddress: newAdminIp,
          macAddress: newAdminMac,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminPassword('');
      setNewAdminIp('');
      setNewAdminMac('');
      showModal(response.data.message, 'Success', 'success');
    } catch (error) {
      console.error('Error creating sub-admin:', error);
      if (error.response?.status === 401) {
        showModal('Your session has expired. Please log in again.', 'Session Expired', 'error');
        handleLogout();
      } else {
        const errorMessage = error.response?.data?.message || 'Failed to create sub-admin';
        showModal(errorMessage, 'Error', 'error');
      }
    }
  };

  const handleDeleteUser = async (userId) => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to permanently delete this user? This action cannot be undone.',
      'Delete User'
    );
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      showModal('Your session has expired. Please log in again.', 'Session Expired', 'error');
      handleLogout();
      return;
    }
    try {
      await api.delete(`/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // The websocket event 'userDeleted' will handle the UI update.
      showModal('User deleted successfully.', 'Success', 'success');
    } catch (error) {
      console.error('Failed to delete user', error);
      if (error.response?.status === 401) {
        showModal('Your session has expired. Please log in again.', 'Session Expired', 'error');
        handleLogout();
      } else {
        const errorMessage = error.response?.data?.message || 'Failed to delete user';
        showModal(errorMessage, 'Error', 'error');
      }
    }
  };

  const handleResetOccupancy = async () => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to reset the park occupancy? This will archive all currently scanned tickets. This action cannot be undone.',
      'Reset Occupancy'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.post(
        '/admin/reset-occupancy',
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      showModal('Park occupancy has been reset successfully.', 'Success', 'success');
      fetchStats();
      setSyncTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Reset Occupancy Error:', error);
      const errorMessage = error.response?.data?.message || 'Failed to reset occupancy';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const handleGenerateDummyTickets = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.post(
        '/admin/generate-mock-data',
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      showModal(response.data.message || 'Simulation data generated successfully!', 'Success', 'success');
      fetchUsers(userPage);
      fetchSubAdmins();
      setSyncTrigger((prev) => prev + 1);
      setDataRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Generate Mock Data Error:', error);
      const data = error.response?.data;
      const errorMessage = data?.error 
        ? `${data.message}: ${data.error}`
        : (data?.message || 'Failed to generate mock data');
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const handleClearDummyData = async () => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to delete all tickets? This will clear all chart data and cannot be undone.',
      'Clear Database'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.delete('/admin/clear-dummy-tickets', {
        headers: { Authorization: `Bearer ${token}` },
      });

      showModal('All dummy data cleared successfully!', 'Success', 'success');
      fetchStats();
      fetchInsights();
      setSyncTrigger((prev) => prev + 1);
    } catch (error) {
      console.error('Clear Dummy Data Error:', error);
      const errorMessage = error.response?.data?.message || 'Failed to clear dummy data';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const handleBackupDatabase = async () => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to trigger a manual database backup now?',
      'Database Backup'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      const response = await api.post(
        '/admin/backup',
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      showModal(response.data.message, 'Success', 'success');
      // Refresh backups list
      try {
        const backupsRes = await api.get('/admin/backups', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setBackups(backupsRes.data);
      } catch (err) {
        console.error('Failed to refresh backups after manual backup', err);
      }
    } catch (err) {
      console.error('Backup Error:', err);
      const errorMessage = err.response?.data?.message || 'Failed to trigger backup';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const fetchAuditLogs = async (page = 1, append = false) => {
    setIsLoadingAuditLogs(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/audit-logs', {
        params: { page, limit: 10 },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      if (append) setAuditLogs((prev) => [...prev, ...data.logs]);
      else setAuditLogs(data.logs || []);

      setAuditLogPage(data.currentPage);
      setAuditLogHasMore(data.currentPage < data.totalPages);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  const handleLoadMoreAuditLogs = () => fetchAuditLogs(auditLogPage + 1, true);

  const handleClearAuditLogs = async (olderThan = null) => {
    const confirmMsg = olderThan
      ? `Are you sure you want to wipe security audit logs older than ${olderThan} days?`
      : 'Are you sure you want to completely wipe the security audit history? This action cannot be undone.';

    const isConfirmed = await showConfirm(confirmMsg, 'Clear Audit Logs');
    if (!isConfirmed) return;

    setIsLoadingAuditLogs(true);
    const token = localStorage.getItem('token');

    try {
      await api.delete('/admin/audit-logs', {
        params: olderThan ? { olderThan } : {},
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.error('Failed to clear audit logs', error);
      const errorMessage = error.response?.data?.message || 'Failed to clear audit logs';
      showModal(errorMessage, 'Error', 'error');
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  const handleClearHardwareAlerts = async () => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to completely clear all hardware alerts? This action cannot be undone.',
      'Clear Alerts'
    );
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete('/admin/hardware-alerts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts([]); // Clear the local state alerts immediately
    } catch (error) {
      console.error('Failed to clear hardware alerts', error);
      const errorMessage = error.response?.data?.message || 'Failed to clear hardware alerts';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const fetchBannedIPs = async (page = 1, append = false) => {
    setIsLoadingBannedIPs(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/banned-ips', {
        params: {
          page,
          limit: 10,
          ...(bannedIPsSearchQuery ? { search: bannedIPsSearchQuery } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      if (append) setBannedIPs((prev) => [...prev, ...data.bannedIPs]);
      else setBannedIPs(data.bannedIPs || []);

      setTotalBannedIPs(data.totalBannedIPs || 0);
      setBannedIPsPage(data.currentPage);
      setBannedIPsHasMore(data.currentPage < data.totalPages);
    } catch (error) {
      console.error('Failed to load older banned IPs', error);
    } finally {
      setIsLoadingBannedIPs(false);
    }
  };

  const handleLoadMoreBannedIPs = () => fetchBannedIPs(bannedIPsPage + 1, true);

  const isFirstRenderBanned = useRef(true);
  useEffect(() => {
    if (isFirstRenderBanned.current) {
      isFirstRenderBanned.current = false;
      return;
    }
    const timeout = setTimeout(() => fetchBannedIPs(1, false), 500);
    return () => clearTimeout(timeout);
  }, [bannedIPsSearchQuery]);

  const handleUnbanIP = async (id) => {
    const isConfirmed = await showConfirm('Are you sure you want to unban this IP address?', 'Unban IP');
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/banned-ips/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBannedIPs((prev) => prev.filter((ip) => ip._id !== id));
    } catch (error) {
      console.error('Error unbanning IP:', error);
      const errorMessage = error.response?.data?.message || 'Failed to unban IP';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const handleAddWhitelistIP = async (e) => {
    e.preventDefault();
    if (!newWhitelistIP) return;

    const token = localStorage.getItem('token');
    try {
      await api.post(
        '/admin/whitelisted-ips',
        { ipAddress: newWhitelistIP, description: newWhitelistDesc, macAddress: newWhitelistMac },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewWhitelistIP('');
      setNewWhitelistDesc('');
      setNewWhitelistMac('');
    } catch (error) {
      console.error('Error adding whitelist IP:', error);
      const errorMessage = error.response?.data?.message || 'Failed to add IP';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const handleRemoveWhitelistIP = async (id) => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to remove this IP from the whitelist?',
      'Remove Whitelist'
    );
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      const response = await api.delete(`/admin/whitelisted-ips/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.error('Error removing whitelist IP:', error);
      const errorMessage = error.response?.data?.message || 'Failed to remove IP';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const handleDownloadBackup = async (filename) => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.get(`/admin/backups/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      showModal('Failed to download backup file.', 'Error', 'error');
    }
  };

  const handleDeleteBackup = async (filename) => {
    const isConfirmed = await showConfirm(
      `Are you sure you want to permanently delete the backup file: ${filename}?`,
      'Delete Backup'
    );
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/backups/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBackups((prev) => prev.filter((b) => b.filename !== filename));
    } catch (err) {
      console.error('Delete backup error:', err);
      const errorMessage = err.response?.data?.message || 'Failed to delete backup';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  const handleRestoreBackup = async (filename) => {
    const isConfirmed = await showConfirm(
      `Are you sure you want to restore the database to the state in ${filename}? This action will overwrite current data and cannot be undone.`,
      'Restore Backup'
    );
    if (!isConfirmed) return;

    setRestoringBackupFilename(filename);
    const token = localStorage.getItem('token');
    try {
      const response = await api.post(
        `/admin/backups/${filename}/restore`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      showModal(response.data.message || 'Backup restored successfully!', 'Success', 'success');
      fetchStats(); // Refresh dashboard stats to reflect the restored data
    } catch (err) {
      console.error('Restore backup error:', err);
      const errorMessage = err.response?.data?.message || 'Network error while restoring backup.';
      showModal(errorMessage, 'Error', 'error');
    } finally {
      setRestoringBackupFilename(null);
    }
  };

  const fetchWhitelistedIPs = async (page = 1, append = false) => {
    setIsLoadingWhitelist(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/whitelisted-ips', {
        params: {
          page,
          limit: 10,
          ...(whitelistedIPsSearchQuery ? { search: whitelistedIPsSearchQuery } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      if (append) setWhitelistedIPs((prev) => [...prev, ...data.ips]);
      else setWhitelistedIPs(data.ips || []);

      setTotalWhitelistedIPs(data.totalIps || 0);
      setWhitelistPage(data.currentPage);
      setWhitelistHasMore(data.currentPage < data.totalPages);
    } catch (error) {
      console.error('Failed to load older whitelisted IPs', error);
    } finally {
      setIsLoadingWhitelist(false);
    }
  };

  const handleLoadMoreWhitelistIPs = () => fetchWhitelistedIPs(whitelistPage + 1, true);

  const isFirstRenderWhitelist = useRef(true);
  useEffect(() => {
    if (isFirstRenderWhitelist.current) {
      isFirstRenderWhitelist.current = false;
      return;
    }
    const timeout = setTimeout(() => fetchWhitelistedIPs(1, false), 500);
    return () => clearTimeout(timeout);
  }, [whitelistedIPsSearchQuery]);

  const fetchDashboardAlerts = async (type, silent = false) => {
    if (!silent) setIsLoadingAlerts(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/hardware-alerts', {
        params: {
          page: 1,
          limit: 10,
          ...(type !== 'all' ? { type } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      setAlerts(data.alerts || (Array.isArray(data) ? data : []));
      setAlertPage(1);
      setTotalAlertPages(data.totalPages || 1);
      setTotalAlertsCount(data.totalAlerts || 0);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setIsLoadingAlerts(false);
    }
  };

  const fetchAlertsPage = async (page, silent = false) => {
    if (!silent) setIsLoadingAlerts(true);
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }
    try {
      const response = await api.get('/admin/hardware-alerts', {
        params: {
          page,
          limit: 10,
          ...(alertFilterType !== 'all' ? { type: alertFilterType } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      setAlerts(data.alerts || []);
      setAlertPage(data.currentPage);
      setTotalAlertPages(data.totalPages || 1);
      setTotalAlertsCount(data.totalAlerts || 0);
    } catch (error) {
      console.error('Failed to load alerts page', error);
    } finally {
      if (!silent) setIsLoadingAlerts(false);
    }
  };

  useEffect(() => {
    if (syncTrigger !== 0) {
      fetchInsights();
    }
  }, [syncTrigger, fetchInsights]);

  useEffect(() => {
    if (backupSyncTrigger === 0) return;
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) return;

    api
      .get('/admin/backups', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.data) setBackups(res.data);
      })
      .catch(console.error);
  }, [backupSyncTrigger]);

  const fetchSubAdmins = async () => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) return;
    try {
      const adminsRes = await api.get('/admin/users', {
        params: { role: 'admin' },
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubAdmins(adminsRes.data.users || []);
    } catch (err) {
      console.error('Failed to fetch sub-admins:', err);
    }
  };

  const fetchUsers = async (page = 1) => {
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }

    try {
      const res = await api.get('/admin/users', {
        params: {
          role: 'user',
          page,
          limit: 10,
          ...(searchQuery ? { search: searchQuery } : {}),
          ...(filterStatus !== 'all' ? { status: filterStatus } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      setRegularUsers(data.users || []);
      setTotalUserPages(data.totalPages || 1);
      setTotalUsersCount(data.totalUsers || 0);
      setUserPage(page);
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
      console.error(error);
    }
  };

  const fetchPendingCashTickets = async () => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token)) return;
    setIsLoadingPendingCash(true);
    try {
      const res = await api.get('/admin/pending-cash-tickets', {
        params: { status: cashFilterStatus },
        headers: { Authorization: `Bearer ${token}` },
      });
      setPendingCashTickets(res.data || []);
    } catch (err) {
      console.error('Failed to fetch cash tickets:', err);
    } finally {
      setIsLoadingPendingCash(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'overview') {
        await Promise.all([fetchStats(), fetchInsights()]);
      } else if (activeTab === 'collections') {
        await fetchPendingCashTickets();
      }
    } catch (err) {
      console.error('Manual refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'collections') {
      fetchPendingCashTickets();

      // JOIN ADMIN ROOM
      socket.emit('joinAdminRoom');

      const onNewCashTicket = (ticket) => {
        // Only add if it matches current status filter (usually PENDING)
        if (cashFilterStatus === 'PENDING') {
          setPendingCashTickets((prev) => {
            if (prev.find((t) => t._id === ticket._id)) return prev;
            return [ticket, ...prev];
          });
        }
      };

      const onCashTicketCollected = (ticketId) => {
        setPendingCashTickets((prev) => prev.filter((t) => t._id !== ticketId));
      };

      socket.on('newCashTicket', onNewCashTicket);
      socket.on('cashTicketCollected', onCashTicketCollected);

      // Refresh stats in real-time when any ticket is updated or collected
      const onDashboardStatsUpdated = () => {
        fetchStats();
      };
      socket.on('dashboardStatsUpdated', onDashboardStatsUpdated);

      return () => {
        socket.off('newCashTicket', onNewCashTicket);
        socket.off('cashTicketCollected', onCashTicketCollected);
        socket.off('dashboardStatsUpdated', onDashboardStatsUpdated);
      };
    }
  }, [activeTab, cashFilterStatus]);

  const filteredCashTickets = useMemo(() => {
    return pendingCashTickets.filter((t) => {
      const s = cashSearchQuery.toLowerCase();
      const userName = (t.userId?.name || '').toLowerCase();
      const userEmail = (t.userId?.email || '').toLowerCase();
      const userPhone = (t.userId?.phone || '').toLowerCase();
      const ticketId = (t._id || '').toString().toLowerCase();

      return (
        userName.includes(s) ||
        userEmail.includes(s) ||
        userPhone.includes(s) ||
        ticketId.includes(s)
      );
    });
  }, [pendingCashTickets, cashSearchQuery]);

  const handleConfirmCash = async (ticketId, amount) => {
    const isConfirmed = await showConfirm(
      `Confirm physical collection of ${amount} EGP for ticket ${ticketId}? This will instantly activate the ticket.`,
      'Confirm Cash Collection'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.put(
        `/tickets/${ticketId}/confirm-cash`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      showModal('Cash collected successfully. Ticket activated.', 'Success', 'success');
      setPendingCashTickets((prev) => prev.filter((t) => t._id !== ticketId));
      fetchStats();
    } catch (error) {
      console.error('Failed to confirm cash collection:', error);
      const errorMessage = error.response?.data?.message || 'Failed to activate ticket.';
      showModal(errorMessage, 'Error', 'error');
    }
  };

  useEffect(() => {
    if (activeTab === 'collections') {
      fetchPendingCashTickets();
    }
  }, [activeTab]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('adminEmail');
    navigate('/');
  };

  useEffect(() => {
    if (dataRefreshTrigger === 0) return;
    fetchStats();
    fetchAlertsPage(1, true);
    fetchUsers(userPage);
    fetchSubAdmins();
  }, [dataRefreshTrigger]);

  // Connect to real-time WebSockets
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      socket.auth = { token };
      if (!socket.connected) {
        socket.connect();
      }
    }

    const onConnect = () => {
      console.log('✅ WebSocket Connected! Socket ID:', socket.id);
      // JOIN ADMIN ROOM to receive real-time stat updates
      socket.emit('joinAdminRoom');
    };

    const onConnectError = (err) => {
      console.error('❌ WebSocket Connection Error:', err.message);
      if (err.message.includes('Authentication error')) {
        showModal('Session expired or unauthorized. Redirecting to login.', 'Auth Error', 'error');
        handleLogout();
      }
    };
    const onHardwareAlert = (newAlert) => {
      console.log('🔔 Received Real-time Hardware Alert:', newAlert);
      const formattedAlert = {
        _id: newAlert.id || newAlert._id,
        message: newAlert.message,
        type: newAlert.type,
        timeString: newAlert.time || newAlert.timeString,
        createdAt: newAlert.createdAt || new Date().toISOString(),
      };
      setAlerts((prevAlerts) => {
        if (alertPageRef.current === 1) {
          return [formattedAlert, ...prevAlerts].slice(0, 10);
        }
        return prevAlerts;
      });
      setTotalAlertsCount((prev) => prev + 1);
      if (!isHardwareAlertsExpandedRef.current) {
        setUnreadAlertsCount((prev) => prev + 1);
      }
    };

    const onOccupancyUpdate = (data) => {
      console.log('📊 Received Occupancy Update:', data);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              currentOccupancy: data.currentOccupancy,
              capacityPercentage: data.capacityPercentage,
            }
          : null
      );
    };

    const onTotalTicketsUpdate = (data) => {
      console.log('🎟️ Received Ticket Stats Update:', data);
      setStats((prev) =>
        prev
          ? {
              ...prev,
              totalTicketsSold: data.totalTicketsSold,
              purchasingUsers: data.purchasingUsers,
              mostSoldTicket: data.mostSoldTicket,
            }
          : null
      );
      setSyncTrigger((prev) => prev + 1);
    };

    const onBackupsUpdate = () => {
      console.log('💾 Received Backups Update');
      setBackupSyncTrigger((prev) => prev + 1);
    };
    const onDataRefresh = () => {
      console.log('🔄 Received Global Data Refresh Signal');
      setSyncTrigger((prev) => prev + 1);
      setBackupSyncTrigger((prev) => prev + 1);
      setDataRefreshTrigger((prev) => prev + 1);
    };

    const onMonthlySalesUpdate = (newSalesData) => {
      console.log('📈 Received Monthly Sales Update');
      if (!isSalesFilteredRef.current) {
        setMonthlySales(newSalesData);
      }
    };

    const onAuditLogUpdate = (newLog) => {
      console.log('🛡️ Received New Audit Log:', newLog);
      setAuditLogs((prevLogs) => {
        if (auditLogPageRef.current === 1) {
          return [newLog, ...prevLogs].slice(0, 50);
        }
        return prevLogs;
      });
      if (!isAuditLogsExpandedRef.current) {
        setUnreadAuditCount((prev) => prev + 1);
      }
    };

    const onAuditLogsCleared = async (data) => {
      console.log('🧹 Received Audit Logs Cleared signal');
      if (data && data.partial) {
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const res = await api.get('/admin/audit-logs', {
              params: { page: 1, limit: 50 },
              headers: { Authorization: `Bearer ${token}` },
            });
            const json = res.data;
            setAuditLogs(json.logs);
            setAuditLogPage(1);
            setAuditLogHasMore(json.currentPage < json.totalPages);
          } catch (err) {
            console.error('Failed to refetch after partial clear', err);
          }
        }
      } else {
        setAuditLogs([]);
        setAuditLogHasMore(false);
        setAuditLogPage(1);
        setUnreadAuditCount(0);
      }
    };

    const onHardwareAlertsCleared = async (data) => {
      console.log('🧹 Received Hardware Alerts Cleared signal');
      if (data && data.partial) {
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const res = await api.get('/admin/hardware-alerts', {
              params: { page: 1, limit: 10 },
              headers: { Authorization: `Bearer ${token}` },
            });
            const json = res.data;
            setAlerts(json.alerts || (Array.isArray(json) ? json : []));
            setAlertPage(1);
            setTotalAlertPages(json.totalPages || 1);
            setTotalAlertsCount(json.totalAlerts || 0);
          } catch (err) {
            console.error('Failed to refetch hardware alerts after partial clear', err);
          }
        }
      } else {
        setAlerts([]);
        setTotalAlertPages(1);
        setTotalAlertsCount(0);
        setAlertPage(1);
        setUnreadAlertsCount(0);
      }
    };

    const onBannedIpAdded = (newBannedIp) => {
      console.log('🚫 Received New Banned IP:', newBannedIp);
      setBannedIPs((prev) => {
        if (bannedIPsPageRef.current === 1) {
          return [newBannedIp, ...prev].slice(0, 50);
        }
        return prev;
      });
      setTotalBannedIPs((prev) => prev + 1);
      if (!isBannedIPsExpandedRef.current) {
        setUnreadBannedCount((prev) => prev + 1);
      }
    };

    const onBannedIpRemoved = (removedId) => {
      console.log('✅ Received Banned IP Removed signal for ID:', removedId);
      setBannedIPs((prev) => prev.filter((ip) => ip._id !== removedId));
      setTotalBannedIPs((prev) => Math.max(prev - 1, 0));
    };

    const onWhitelistIpAdded = (newIp) => {
      console.log('⚪ Received New Whitelisted IP:', newIp);
      setWhitelistedIPs((prev) => {
        if (whitelistPageRef.current === 1) {
          return [newIp, ...prev].slice(0, 50);
        }
        return prev;
      });
      setTotalWhitelistedIPs((prev) => prev + 1);
    };

    const onWhitelistIpRemoved = (removedId) => {
      console.log('🗑️ Received Whitelist IP Removed signal for ID:', removedId);
      setWhitelistedIPs((prev) => prev.filter((ip) => ip._id !== removedId));
      setTotalWhitelistedIPs((prev) => Math.max(prev - 1, 0));
    };

    const onSubAdminCreated = (newAdmin) => {
      console.log('👤 Received New Sub-Admin:', newAdmin);
      if (!isSuperAdmin) return;
      setSubAdmins((prevUsers) => [newAdmin, ...prevUsers]);
    };

    const onNewUserRegistered = (newUser) => {
      console.log('🆕 Received New User Registration:', newUser);
      if (!isSuperAdmin && (newUser.role === 'admin' || newUser.role === 'sub-admin')) return;

      if (newUser.role === 'admin' || newUser.role === 'sub-admin') {
        setSubAdmins((prev) => [newUser, ...prev]);
      } else {
        setRegularUsers((prev) => {
          if (userPageRef.current === 1) {
            return [newUser, ...prev].slice(0, 10);
          }
          return prev;
        });
        setTotalUsersCount((prev) => prev + 1);
        setStats((prev) =>
          prev
            ? {
                ...prev,
                activeUsers: (prev.activeUsers || 0) + 1,
              }
            : null
        );
      }
    };

    const onUserUpdated = (updatedUser) => {
      console.log('👤 Received User Update Signal:', updatedUser);
      setRegularUsers((prev) =>
        prev.map((u) => (u._id === updatedUser._id ? { ...u, ...updatedUser } : u))
      );
      setSubAdmins((prev) =>
        prev.map((u) => (u._id === updatedUser._id ? { ...u, ...updatedUser } : u))
      );
    };

    const onUserDeleted = (deletedUserId) => {
      console.log('🗑️ Received User Deleted Signal for ID:', deletedUserId);
      setRegularUsers((prev) => prev.filter((u) => u._id !== deletedUserId));
      setTotalUsersCount((prev) => Math.max(prev - 1, 0));
      setStats((prev) =>
        prev
          ? {
              ...prev,
              activeUsers: Math.max((prev.activeUsers || 1) - 1, 0),
            }
          : null
      );
    };

    const onSubAdminDeleted = (deletedAdminId) => {
      console.log('🗑️ Received Sub-Admin Deleted Signal for ID:', deletedAdminId);
      setSubAdmins((prev) => prev.filter((u) => u._id !== deletedAdminId));
    };

    const onUserTicketUpdate = (data) => {
      console.log('🎫 Live Ticket Count Update:', data);
      setRegularUsers((prev) =>
        prev.map((u) =>
          u._id === data.userId ? { ...u, ticketCount: (u.ticketCount || 0) + data.addedCount } : u
        )
      );
      setSyncTrigger((prev) => prev + 1);
    };

    const onDashboardStatsUpdated = () => {
      console.log('🔄 Received Dashboard Stats Updated Signal');
      setSyncTrigger((prev) => prev + 1);
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('hardwareAlert', onHardwareAlert);
    socket.on('userTicketCountUpdate', onUserTicketUpdate);
    socket.on('occupancyUpdate', onOccupancyUpdate);
    socket.on('occupancyUpdated', onOccupancyUpdate);
    socket.on('totalTicketsUpdate', onTotalTicketsUpdate);
    socket.on('dashboardStatsUpdated', onDashboardStatsUpdated);
    socket.on('crowdDataUpdated', onDashboardStatsUpdated);
    socket.on('backupsUpdate', onBackupsUpdate);
    socket.on('dataRefresh', onDataRefresh);
    socket.on('monthlySalesUpdate', onMonthlySalesUpdate);
    socket.on('auditLogUpdate', onAuditLogUpdate);
    socket.on('auditLogsCleared', onAuditLogsCleared);
    socket.on('hardwareAlertsCleared', onHardwareAlertsCleared);
    socket.on('bannedIpAdded', onBannedIpAdded);
    socket.on('bannedIpRemoved', onBannedIpRemoved);
    socket.on('whitelistIpAdded', onWhitelistIpAdded);
    socket.on('whitelistIpRemoved', onWhitelistIpRemoved);
    socket.on('subAdminCreated', onSubAdminCreated);
    socket.on('newUserRegistered', onNewUserRegistered);
    socket.on('userUpdated', onUserUpdated);
    socket.on('userDeleted', onUserDeleted);
    socket.on('subAdminDeleted', onSubAdminDeleted);

    return () => {
      // Only remove the listeners for this component, do not disconnect the socket
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('hardwareAlert', onHardwareAlert);
      socket.off('userTicketCountUpdate', onUserTicketUpdate);
      socket.off('occupancyUpdate', onOccupancyUpdate);
      socket.off('occupancyUpdated', onOccupancyUpdate);
      socket.off('totalTicketsUpdate', onTotalTicketsUpdate);
      socket.off('dashboardStatsUpdated', onDashboardStatsUpdated);
      socket.off('backupsUpdate', onBackupsUpdate);
      socket.off('dataRefresh', onDataRefresh);
      socket.off('monthlySalesUpdate', onMonthlySalesUpdate);
      socket.off('auditLogUpdate', onAuditLogUpdate);
      socket.off('auditLogsCleared', onAuditLogsCleared);
      socket.off('hardwareAlertsCleared', onHardwareAlertsCleared);
      socket.off('bannedIpAdded', onBannedIpAdded);
      socket.off('bannedIpRemoved', onBannedIpRemoved);
      socket.off('whitelistIpAdded', onWhitelistIpAdded);
      socket.off('whitelistIpRemoved', onWhitelistIpRemoved);
      socket.off('subAdminCreated', onSubAdminCreated);
      socket.off('newUserRegistered', onNewUserRegistered);
      socket.off('userUpdated', onUserUpdated);
      socket.off('userDeleted', onUserDeleted);
      socket.off('subAdminDeleted', onSubAdminDeleted);
    };
  }, []);

  const handleExportCSV = () => {
    if (auditLogs.length === 0) return;

    // Define CSV headers
    const headers = [
      'Date & Time',
      'Email Attempted',
      'Action',
      'Status',
      'Status Code',
      'IP Address',
      'User Agent',
    ];
    const csvRows = [headers.join(',')];

    // Map data to rows
    auditLogs.forEach((log) => {
      const row = [
        `"${new Date(log.createdAt).toLocaleString()}"`,
        `"${log.email}"`,
        `"${log.action || 'Authentication / System'}"`,
        `"${log.status}"`,
        `"${log.statusCode || ''}"`,
        `"${log.ipAddress}"`,
        `"${log.userAgent ? log.userAgent.replace(/"/g, '""') : 'Unknown'}"`, // Escape internal quotes
      ];
      csvRows.push(row.join(','));
    });

    // Create and trigger download
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `smart-park-audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    setUserPage(1);
  }, [searchQuery, filterStatus]);

  const isFirstRenderUsers = useRef(true);
  useEffect(() => {
    if (isFirstRenderUsers.current) {
      isFirstRenderUsers.current = false;
      return;
    }
    const timeout = setTimeout(() => {
      fetchUsers(userPage);
    }, 500);
    return () => clearTimeout(timeout);
  }, [userPage, searchQuery, filterStatus]);

  const handleExportUsersCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/users', {
        params: {
          role: 'user',
          limit: 10000,
          ...(searchQuery ? { search: searchQuery } : {}),
          ...(filterStatus !== 'all' ? { status: filterStatus } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      const exportData = data.users || [];
      if (exportData.length === 0) return;

      const headers = ['Name', 'Email', 'Phone', 'Age', 'Role', 'Status', 'Has Disability'];
      const csvRows = [headers.join(',')];

      exportData.forEach((user) => {
        const row = [
          `"${(user.name || '').replace(/"/g, '""')}"`,
          `"${(user.email || '').replace(/"/g, '""')}"`,
          `"${(user.phone || 'N/A').replace(/"/g, '""')}"`,
          `"${user.age || 'N/A'}"`,
          `"${user.role || 'user'}"`,
          `"${user.isRestricted ? 'Restricted' : 'Active'}"`,
          `"${user.hasDisability ? 'Yes' : 'No'}"`,
        ];
        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `smart-park-users-${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Export Error:', e);
    }
  };

  const handlePrevWeek = () => {
    setInsightStartDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
  };

  const handleNextWeek = () => {
    setInsightStartDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 7);
      return newDate;
    });
  };

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        if (alertFilterType === 'all') return true;
        return alert.type === alertFilterType;
      }),
    [alerts, alertFilterType]
  );

  const handleExportBannedIPsCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/banned-ips', {
        params: {
          limit: 10000,
          ...(bannedIPsSearchQuery ? { search: bannedIPsSearchQuery } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      const exportData = data.bannedIPs || [];
      if (exportData.length === 0) return;

      const headers = ['IP Address', 'Reason', 'Date Banned'];
      const csvRows = [headers.join(',')];

      exportData.forEach((banned) => {
        const row = [
          `"${banned.ipAddress || ''}"`,
          `"${banned.reason || ''}"`,
          `"${new Date(banned.createdAt).toLocaleString()}"`,
        ];
        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `smart-park-banned-ips-${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Export error:', e);
    }
  };

  const handleExportWhitelistedIPsCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/whitelisted-ips', {
        params: {
          limit: 10000,
          ...(whitelistedIPsSearchQuery ? { search: whitelistedIPsSearchQuery } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      const exportData = data.ips || [];
      if (exportData.length === 0) return;

      const headers = ['IP Address', 'Description', 'Added On'];
      const csvRows = [headers.join(',')];

      exportData.forEach((ip) => {
        const row = [
          `"${ip.ipAddress || ''}"`,
          `"${ip.description ? ip.description.replace(/"/g, '""') : ''}"`,
          `"${new Date(ip.createdAt).toLocaleString()}"`,
        ];
        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `smart-park-whitelisted-ips-${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Export error:', e);
    }
  };

  const handleExportMonthlySalesCSV = () => {
    if (monthlySales.length === 0) return;

    const headers = ['Month', 'Total Tickets Sold', 'Revenue (EGP)'];
    const csvRows = [headers.join(',')];

    monthlySales.forEach((sale) => {
      const row = [`"${sale.month}"`, `"${sale.totalTickets}"`, `"${sale.revenue}"`];
      csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `smart-park-monthly-sales-${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxMonthlySales = useMemo(
    () => Math.max(...monthlySales.map((s) => s.totalTickets), 1),
    [monthlySales]
  );

  // Helper to determine the global collapse/expand state for the currently active tab
  const getTabExpansionState = () => {
    switch (activeTab) {
      case 'overview':
        return {
          canToggle: true,
          allExpanded: isCrowdInsightsExpanded && isMonthlySalesExpanded,
          toggle: (state) => {
            setIsCrowdInsightsExpanded(state);
            setIsMonthlySalesExpanded(state);
          },
        };
      case 'users':
        return {
          canToggle: true,
          allExpanded: isUserManagementExpanded,
          toggle: (state) => {
            setIsUserManagementExpanded(state);
          },
        };
      case 'access':
        if (!isSuperAdmin) return { canToggle: false };
        return {
          canToggle: true,
          allExpanded: isSubAdminProvisioningExpanded && isSubAdminsExpanded && isWhitelistExpanded,
          toggle: (state) => {
            setIsSubAdminProvisioningExpanded(state);
            setIsSubAdminsExpanded(state);
            setIsWhitelistExpanded(state);
          },
        };
      case 'security':
        if (!isSuperAdmin) return { canToggle: false };
        return {
          canToggle: true,
          allExpanded: isAuditLogsExpanded && isBannedIPsExpanded,
          toggle: (state) => {
            setIsAuditLogsExpanded(state);
            setIsBannedIPsExpanded(state);
          },
        };
      default:
        return { canToggle: false }; // Hardware and System Backup tabs don't have multiple collapsible panels
    }
  };

  const { canToggle, allExpanded, toggle: toggleAllPanels } = getTabExpansionState();

  const filteredUsers = useMemo(() => {
    if (!Array.isArray(regularUsers)) return [];
    return regularUsers.filter((user) => {
      if (!user) return false;
      const name = user.name || '';
      const email = user.email || '';
      const search = (searchQuery || '').toLowerCase();

      const matchesSearch =
        name.toLowerCase().includes(search) ||
        email.toLowerCase().includes(search);

      const status = (filterStatus || 'ALL').toUpperCase();
      let matchesStatus = true;
      if (status === 'ACTIVE') {
        matchesStatus = !user.isRestricted;
      } else if (status === 'RESTRICTED') {
        matchesStatus = user.isRestricted;
      }

      return matchesSearch && matchesStatus;
    });
  }, [regularUsers, searchQuery, filterStatus]);

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black font-sans flex flex-col transition-colors duration-300">
      <AdminHeader
        title="Admin Control Panel"
        subtitle={
          isSuperAdmin ? 'Smart Park Ecosystem (Super Admin)' : 'Smart Park Ecosystem (Sub-Admin)'
        }
        userName={localStorage.getItem('adminEmail')}
        unreadAlertsCount={unreadAlertsCount}
        unreadAuditCount={isSuperAdmin ? unreadAuditCount : 0}
        unreadBannedCount={isSuperAdmin ? unreadBannedCount : 0}
        onAlertsClick={() => {
          handleTabChange('hardware');
          setIsHardwareAlertsExpanded(true);
          setTimeout(() => {
            document
              .getElementById('hardware-alerts-panel')
              ?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }}
        onAuditClick={
          isSuperAdmin
            ? () => {
                handleTabChange('security');
                setIsAuditLogsExpanded(true);
                setTimeout(() => {
                  document
                    .getElementById('audit-logs-panel')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            : undefined
        }
        onBannedClick={
          isSuperAdmin
            ? () => {
                handleTabChange('security');
                setIsBannedIPsExpanded(true);
                setTimeout(() => {
                  document
                    .getElementById('banned-ips-panel')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            : undefined
        }
        onLogout={handleLogout}
      />

      <div className="flex flex-grow w-full max-w-[1440px] mx-auto px-4 md:px-8">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-72 py-6 pr-6 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-[30px] p-5 shadow-2xl border border-smart-light/10 dark:border-gray-700 sticky top-8 flex flex-col space-y-2">
            <h3 className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-3 px-4 pt-2">
              Admin Modules
            </h3>
            {[
              {
                id: 'overview',
                label: 'Overview & Stats',
                icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
              },
              {
                id: 'users',
                label: 'User Management',
                icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
              },
              { id: 'hardware', label: 'Gate & Hardware', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
              {
                id: 'collections',
                label: 'Cash Collections',
                icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
              },
              ...(isSuperAdmin
                ? [
                    {
                      id: 'access',
                      label: 'Access Control',
                      icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
                    },
                    {
                      id: 'security',
                      label: 'Security Logs',
                      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
                    },
                    {
                      id: 'grc',
                      label: 'GRC & Security',
                      icon: 'M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4',
                    },
                    {
                      id: 'system',
                      label: 'System Backups',
                      icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
                    },
                  ]
                : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center px-5 py-4 rounded-xl text-xs font-black uppercase tracking-widest w-full transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-smart-dark text-white shadow-lg transform scale-[1.02] dark:bg-smart-light dark:text-smart-dark'
                    : 'bg-transparent text-smart-gray dark:text-gray-400 hover:bg-smart-light/10 dark:hover:bg-gray-700'
                }`}
              >
                <svg className="w-5 h-5 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path>
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-6 py-8 w-full">
          {/* Mobile Tab Navigation Menu */}
          <div className="lg:hidden flex flex-nowrap space-x-4 bg-white dark:bg-gray-800 p-3 rounded-3xl mb-8 overflow-x-auto border border-smart-light/20 shadow-xl scrollbar-hide">
            {[
              {
                id: 'overview',
                label: 'Overview & Stats',
                icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
              },
              {
                id: 'users',
                label: 'User Management',
                icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
              },
              { id: 'hardware', label: 'Gate & Hardware', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
              {
                id: 'collections',
                label: 'Cash Collections',
                icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
              },
              ...(isSuperAdmin
                ? [
                    {
                      id: 'access',
                      label: 'Access Control',
                      icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
                    },
                    {
                      id: 'security',
                      label: 'Security Logs',
                      icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
                    },
                    {
                      id: 'grc',
                      label: 'GRC & Security',
                      icon: 'M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4',
                    },
                    {
                      id: 'system',
                      label: 'System Backups',
                      icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
                    },
                  ]
                : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center flex-1 shrink-0 justify-center px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-smart-light text-white shadow-lg transform -translate-y-1'
                    : 'bg-transparent text-smart-gray dark:text-gray-400 hover:bg-smart-light/10 dark:hover:bg-gray-700'
                }`}
              >
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon}></path>
                </svg>
                {tab.label}
              </button>
            ))}
          </div>


          {/* Security Logs Tab */}
          {activeTab === 'security' && isSuperAdmin && (
            <>
              {/* Security Audit Logs Panel */}
              <div
                id="audit-logs-panel"
                className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isAuditLogsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}
              >
                <div
                  className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setIsAuditLogsExpanded(!isAuditLogsExpanded)}
                >
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                    <svg
                      className="w-6 h-6 mr-3 text-purple-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      ></path>
                    </svg>
                    Security Audit Logs
                  </h2>
                  <div className="flex items-center text-smart-gray dark:text-gray-400">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearAuditLogs(30);
                      }}
                      className="hidden sm:flex items-center mr-2 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-yellow-500/20"
                      disabled={auditLogs.length === 0}
                    >
                      <svg
                        className="w-3 h-3 mr-1.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        ></path>
                      </svg>
                      Clear &gt; 30 Days
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearAuditLogs(null);
                      }}
                      className="hidden sm:flex items-center mr-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20"
                      disabled={auditLogs.length === 0}
                    >
                      <svg
                        className="w-3 h-3 mr-1.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        ></path>
                      </svg>
                      Clear All
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportCSV();
                      }}
                      className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                      disabled={auditLogs.length === 0}
                    >
                      <svg
                        className="w-3 h-3 mr-1.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        ></path>
                      </svg>
                      Export CSV
                    </button>
                    <span className="text-xs font-bold mr-4 uppercase tracking-widest">
                      {auditLogs.length} Records
                    </span>
                    <svg
                      className={`w-6 h-6 transform transition-transform duration-300 ${isAuditLogsExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      ></path>
                    </svg>
                  </div>
                </div>

                {isAuditLogsExpanded && (
                  <div className="overflow-y-auto overflow-x-auto flex-grow">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                        <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                          <th className="px-4 py-3 pl-6">Date & Time</th>
                          <th className="px-4 py-3">Email Attempted</th>
                          <th className="px-4 py-3">Action / Details</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-center">IP Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {Array.isArray(auditLogs) && auditLogs.map((log) => (
                          <tr
                            key={log._id}
                            className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <td className="px-4 py-3 pl-6 text-[11px] font-bold text-smart-gray dark:text-gray-400">
                              {new Date(log.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 font-black text-smart-dark dark:text-white italic">
                              {log.email}
                            </td>
                            <td className="px-4 py-3 font-medium text-smart-dark dark:text-gray-300">
                              {log.action || 'Authentication / System'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {log.status === 'success' ? (
                                <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-green-200 dark:border-green-800">
                                  Success
                                </span>
                              ) : (
                                <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-red-200 dark:border-red-800">
                                  Failed ({log.statusCode})
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-[10px] text-smart-gray dark:text-gray-500">
                              {log.ipAddress}
                            </td>
                          </tr>
                        ))}
                        {(!auditLogs || auditLogs.length === 0) && (
                          <tr>
                            <td
                              colSpan="5"
                              className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                            >
                              No audit logs found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {auditLogHasMore && (
                      <div className="flex justify-center p-4 bg-smart-bg dark:bg-gray-900 border-t border-smart-light/10">
                        <button
                          onClick={handleLoadMoreAuditLogs}
                          disabled={isLoadingAuditLogs}
                          className="px-6 py-2.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors border border-smart-light/20"
                        >
                          {isLoadingAuditLogs ? 'Loading...' : 'Load Older Logs'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Banned IP Addresses Panel */}
              <div
                id="banned-ips-panel"
                className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isBannedIPsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}
              >
                <div
                  className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setIsBannedIPsExpanded(!isBannedIPsExpanded)}
                >
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                    <svg
                      className="w-6 h-6 mr-3 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      ></path>
                    </svg>
                    Banned IP Addresses
                  </h2>
                  <div className="flex items-center text-smart-gray dark:text-gray-400">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportBannedIPsCSV();
                      }}
                      className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                      disabled={totalBannedIPs === 0}
                    >
                      <svg
                        className="w-3 h-3 mr-1.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        ></path>
                      </svg>
                      Export CSV
                    </button>
                    <span className="text-xs font-bold mr-4 uppercase tracking-widest">
                      {totalBannedIPs} Banned
                    </span>
                    <svg
                      className={`w-6 h-6 transform transition-transform duration-300 ${isBannedIPsExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      ></path>
                    </svg>
                  </div>
                </div>

                {isBannedIPsExpanded && (
                  <div className="flex flex-col h-full overflow-hidden">
                    <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                      <div className="relative w-full md:max-w-md">
                        <input
                          type="text"
                          placeholder="SEARCH BY IP OR REASON..."
                          value={bannedIPsSearchQuery}
                          onChange={(e) => setBannedIPsSearchQuery(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                        />
                        <svg
                          className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          ></path>
                        </svg>
                      </div>
                    </div>

                    <div className="overflow-y-auto overflow-x-auto flex-grow">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                          <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                            <th className="px-4 py-3 pl-6">IP Address</th>
                            <th className="px-4 py-3">Reason</th>
                            <th className="px-4 py-3">Date Banned</th>
                            <th className="px-4 py-3 text-right pr-6">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                          {Array.isArray(bannedIPs) && bannedIPs.map((banned) => (
                            <tr
                              key={banned._id}
                              className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                              <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white">
                                {banned.ipAddress}
                              </td>
                              <td className="px-4 py-3 text-xs text-smart-gray dark:text-gray-400 font-medium">
                                {banned.reason}
                              </td>
                              <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500">
                                {new Date(banned.createdAt).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 pr-6 text-right">
                                <button
                                  onClick={() => handleUnbanIP(banned._id)}
                                  className="px-4 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20"
                                >
                                  Unban IP
                                </button>
                              </td>
                            </tr>
                          ))}
                          {(!bannedIPs || bannedIPs.length === 0) && (
                            <tr>
                              <td
                                colSpan="4"
                                className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                              >
                                No banned IP addresses found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      {bannedIPsHasMore && (
                        <div className="flex justify-center p-4 bg-smart-bg dark:bg-gray-900 border-t border-smart-light/10">
                          <button
                            onClick={handleLoadMoreBannedIPs}
                            disabled={isLoadingBannedIPs}
                            className="px-6 py-2.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors border border-smart-light/20"
                          >
                            {isLoadingBannedIPs ? 'Loading...' : 'Load More IPs'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'overview' && (
            <div className="p-4 md:p-8 bg-white dark:bg-gray-800/30 rounded-[40px] border border-smart-light/10 shadow-2xl mb-10 animate-fade-in-up w-full max-w-[1400px] mx-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-smart-dark dark:text-white uppercase italic tracking-tighter flex items-center">
                  <svg className="w-8 h-8 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                  </svg>
                  System Overview
                </h2>
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="group flex items-center px-6 py-3 bg-white dark:bg-gray-800 border-2 border-smart-light/20 rounded-2xl text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-400 hover:text-smart-dark dark:hover:text-white hover:border-smart-light transition-all shadow-xl hover:shadow-smart-light/20 active:scale-95 disabled:opacity-50"
                >
                  <svg
                    className={`w-5 h-5 mr-3 transition-transform duration-500 ${isRefreshing ? 'animate-spin text-smart-light' : 'group-hover:rotate-180'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    ></path>
                  </svg>
                  {isRefreshing ? 'Syncing Ecosystem...' : 'Refresh Live Data'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 w-full mb-10">
                {/* Circular Card 1 */}
                <div className="relative bg-white dark:bg-gray-800 rounded-full w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] lg:w-[240px] lg:h-[240px] flex-shrink-0 flex flex-col items-center justify-center p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] border-[10px] border-blue-500/20 hover:border-blue-500/40 transition-all transform hover:scale-105 text-center group">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-3 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                      ></path>
                    </svg>
                  </div>
                  <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1">
                    Total Tickets Sold
                  </h3>
                  {isLoadingStats ? (
                    <span className="text-sm font-bold text-gray-400 animate-pulse">
                      Analyzing...
                    </span>
                  ) : (
                    <span className="text-4xl font-black text-smart-dark dark:text-white italic">
                      {stats?.totalTicketsSold || 0}
                    </span>
                  )}
                </div>

                {/* Circular Card 2 */}
                <div className="relative bg-white dark:bg-gray-800 rounded-full w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] lg:w-[240px] lg:h-[240px] flex-shrink-0 flex flex-col items-center justify-center p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] text-center transform transition-transform hover:scale-105 group">
                  <svg
                    className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-gray-100 dark:text-gray-700"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray="289"
                      strokeDashoffset={289 - (289 * (stats?.capacityPercentage || 0)) / 100}
                      strokeLinecap="round"
                      className="text-smart-light transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="w-12 h-12 bg-smart-light/10 rounded-full flex items-center justify-center mb-3 text-smart-light group-hover:bg-smart-light group-hover:text-white transition-colors z-10">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      ></path>
                    </svg>
                  </div>
                  <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1 z-10">
                    Current Occupancy
                  </h3>
                  {isLoadingStats ? (
                    <span className="text-sm font-bold text-gray-400 animate-pulse z-10">
                      Analyzing...
                    </span>
                  ) : (
                    <div className="flex flex-col items-center z-10">
                      <span className="text-4xl font-black text-smart-light italic leading-none">
                        {stats?.currentOccupancy || 0}
                      </span>
                      <span className="text-smart-gray dark:text-gray-500 font-bold text-[10px] uppercase tracking-widest mt-1">
                        / {stats?.maxCapacity || 1000} Limit
                      </span>
                    </div>
                  )}
                </div>

                {/* Circular Card 3 */}
                <div className="relative bg-white dark:bg-gray-800 rounded-full w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] lg:w-[240px] lg:h-[240px] flex-shrink-0 flex flex-col items-center justify-center p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] border-[10px] border-orange-500/20 hover:border-orange-500/40 transition-all transform hover:scale-105 text-center group">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-3 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>
                    </svg>
                  </div>
                  <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1">
                    Most Sold Ticket
                  </h3>
                  {isLoadingStats ? (
                    <span className="text-sm font-bold text-gray-400 animate-pulse">
                      Analyzing...
                    </span>
                  ) : (
                    <span className="text-lg font-black text-smart-dark dark:text-white uppercase italic leading-tight px-2">
                      {stats?.mostSoldTicket || 'N/A'}
                    </span>
                  )}
                </div>

                {/* Circular Card 4 */}
                <div className="relative bg-white dark:bg-gray-800 rounded-full w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] lg:w-[240px] lg:h-[240px] flex-shrink-0 flex flex-col items-center justify-center p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] text-center transform transition-transform hover:scale-105 group">
                  <svg
                    className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none"
                    viewBox="0 0 100 100"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-gray-100 dark:text-gray-700"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray="289"
                      strokeDashoffset={
                        289 -
                        289 * (stats?.activeUsers ? stats.purchasingUsers / stats.activeUsers : 0)
                      }
                      strokeLinecap="round"
                      className="text-smart-glow transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="w-12 h-12 bg-smart-glow/10 rounded-full flex items-center justify-center mb-3 text-smart-glow group-hover:bg-smart-glow group-hover:text-white transition-colors z-10">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      ></path>
                    </svg>
                  </div>
                  <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1 z-10">
                    User Statistics
                  </h3>
                  {isLoadingStats ? (
                    <span className="text-sm font-bold text-gray-400 animate-pulse z-10">
                      Analyzing...
                    </span>
                  ) : (
                    <div className="flex flex-col items-center z-10">
                      <span className="text-4xl font-black text-smart-dark dark:text-white italic leading-none">
                        {stats?.purchasingUsers || 0}
                      </span>
                      <span className="text-smart-gray dark:text-gray-500 font-bold text-[10px] uppercase tracking-widest mt-1">
                        of {stats?.activeUsers || 0} Total
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Admin Quick Actions Row */}
              {isSuperAdmin && !isLoadingStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <button
                    onClick={handleResetOccupancy}
                    className="py-4 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-red-900/40 active:scale-95 flex flex-col items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      ></path>
                    </svg>
                    Reset Occupancy
                  </button>
                  <button
                    onClick={handleGenerateDummyTickets}
                    className="py-4 bg-smart-light hover:bg-smart-dark text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-smart-light/40 active:scale-95 flex flex-col items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      ></path>
                    </svg>
                    Generate Data
                  </button>
                  <button
                    onClick={handleClearDummyData}
                    className="py-4 bg-gray-600 hover:bg-gray-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-gray-900/40 active:scale-95 flex flex-col items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      ></path>
                    </svg>
                    Clear Data
                  </button>
                  <button
                    onClick={handleBackupDatabase}
                    className="py-4 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-blue-900/40 active:scale-95 flex flex-col items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                      ></path>
                    </svg>
                    Backup DB
                  </button>
                </div>
              )}
            </div>
          )}

          {canToggle && (
            <div className="flex justify-end mb-6 animate-fade-in-up">
              <button
                onClick={() => toggleAllPanels(!allExpanded)}
                className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-smart-light/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-400 hover:text-smart-dark dark:hover:text-white hover:border-smart-light/40 transition-all shadow-sm active:scale-95"
              >
                <span>{allExpanded ? 'Collapse All Panels' : 'Expand All Panels'}</span>
                <svg
                  className={`w-4 h-4 ml-2 transform transition-transform duration-300 ${allExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  ></path>
                </svg>
              </button>
            </div>
          )}

          {/* Crowd Insights Panel */}
          {activeTab === 'overview' && (
            <div
              className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isCrowdInsightsExpanded ? 'h-auto' : ''}`}
            >
              <div
                className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setIsCrowdInsightsExpanded(!isCrowdInsightsExpanded)}
              >
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                  <svg
                    className="w-6 h-6 mr-3 text-smart-light"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    ></path>
                  </svg>
                  Crowd Insights Window
                </h2>
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrevWeek();
                      }}
                      className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 rounded-lg text-xs font-bold hover:bg-smart-light/20 transition-colors"
                    >
                      &larr; Prev 7 Days
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setInsightStartDate(new Date());
                      }}
                      className="px-3 py-1.5 bg-smart-light text-white rounded-lg text-xs font-bold hover:bg-smart-dark transition-colors shadow-sm"
                    >
                      Today
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNextWeek();
                      }}
                      className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 rounded-lg text-xs font-bold hover:bg-smart-light/20 transition-colors"
                    >
                      Next 7 Days &rarr;
                    </button>
                  </div>
                  <svg
                    className={`w-6 h-6 text-smart-gray dark:text-gray-400 transform transition-transform duration-300 ${isCrowdInsightsExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </div>
              </div>
              {isCrowdInsightsExpanded && (
                <WidgetErrorBoundary>
                  <div className="p-8">
                    {loadingInsights ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-smart-light"></div>
                      </div>
                    ) : insights ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
                          {Array.isArray(insights.days) && insights.days.map((day, index) => (
                            <div
                              key={index}
                              className={`flex flex-col items-center justify-center py-5 px-2 rounded-xl transition-all cursor-pointer ${
                                day.isToday
                                  ? 'bg-[#2a3038] border-2 border-[#8cc63f]'
                                  : 'bg-[#1e2329] border-2 border-transparent hover:bg-[#2a3038]'
                              }`}
                            >
                              <div className="text-[10px] font-black text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-tighter">
                                {day.dayName}
                              </div>
                              <div
                                className={`text-2xl md:text-3xl font-bold mb-1 ${
                                  day.crowdLevel === 'quiet'
                                    ? 'text-green-500'
                                    : day.crowdLevel === 'moderate'
                                      ? 'text-yellow-500'
                                      : 'text-red-500'
                                }`}
                              >
                                {day.count}
                              </div>
                              <div
                                className={`flex items-center gap-1.5 text-xs md:text-sm font-semibold ${
                                  day.crowdLevel === 'quiet'
                                    ? 'text-green-500'
                                    : day.crowdLevel === 'moderate'
                                      ? 'text-yellow-500'
                                      : 'text-red-500'
                                }`}
                              >
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    day.crowdLevel === 'quiet'
                                      ? 'bg-green-500'
                                      : day.crowdLevel === 'moderate'
                                        ? 'bg-yellow-500'
                                        : 'bg-red-500'
                                  }`}
                                ></div>
                                {day.crowdLevel.charAt(0).toUpperCase() + day.crowdLevel.slice(1)}
                              </div>
                              <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-2">
                                {day.displayDate}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 text-[10px] md:text-xs">

                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="text-gray-500 dark:text-gray-400">Quiet (0-30%)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <span className="text-gray-500 dark:text-gray-400">
                              Moderate (31-70%)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <span className="text-gray-500 dark:text-gray-400">Busy (71-100%)</span>
                          </div>
                          <div className="text-gray-400 dark:text-gray-500">
                            Daily Capacity: {insights.capacity}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="py-8 flex flex-col items-center justify-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-xs">
                        <p className="mb-4">Failed to load crowd insights.</p>
                        <button
                          onClick={fetchInsights}
                          className="px-6 py-2.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-xl transition-colors"
                        >
                          Retry Connection
                        </button>
                      </div>
                    )}
                  </div>
                </WidgetErrorBoundary>
              )}
            </div>
          )}

          {/* Monthly Sales History Panel */}
          {activeTab === 'overview' && (
            <div
              className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isMonthlySalesExpanded ? 'h-auto' : ''}`}
            >
              <div
                className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setIsMonthlySalesExpanded(!isMonthlySalesExpanded)}
              >
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                  <svg
                    className="w-6 h-6 mr-3 text-orange-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    ></path>
                  </svg>
                  Historical Ticket Sales
                </h2>
                <div className="flex items-center text-smart-gray dark:text-gray-400">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportMonthlySalesCSV();
                    }}
                    className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                    disabled={monthlySales.length === 0}
                  >
                    <svg
                      className="w-3 h-3 mr-1.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      ></path>
                    </svg>
                    Export CSV
                  </button>
                  <svg
                    className={`w-6 h-6 transform transition-transform duration-300 ${isMonthlySalesExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </div>
              </div>

              {isMonthlySalesExpanded && (
                <WidgetErrorBoundary>
                  <>
                    <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                      <div className="flex items-center space-x-3 w-full md:w-auto">
                        <span className="text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:block">
                          Filter Period:
                        </span>
                        <input
                          type="month"
                          value={salesStartDate}
                          onChange={(e) => setSalesStartDate(e.target.value)}
                          className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none transition font-mono text-[10px] font-black tracking-widest cursor-pointer"
                        />
                        <span className="text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest">
                          to
                        </span>
                        <input
                          type="month"
                          value={salesEndDate}
                          onChange={(e) => setSalesEndDate(e.target.value)}
                          className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none transition font-mono text-[10px] font-black tracking-widest cursor-pointer"
                        />
                        {(salesStartDate || salesEndDate) && (
                          <button
                            onClick={() => {
                              setSalesStartDate('');
                              setSalesEndDate('');
                            }}
                            className="px-4 py-2 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-colors border border-red-200 dark:border-red-800"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {Array.isArray(monthlySales) && monthlySales.length > 0 ? (
                      <div className="p-8 overflow-x-auto">
                        <div className="flex items-end justify-between space-x-4 min-w-[600px] h-64 mt-4 mb-4 border-b-2 border-smart-light/20 pb-4">
                          {monthlySales.map((sale, index) => {
                            const heightPercent = Math.max(
                              (sale.totalTickets / maxMonthlySales) * 100,
                              5
                            );
                            return (
                              <div
                                key={index}
                                className="flex flex-col items-center justify-end w-full h-full group relative"
                              >
                                <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity text-center bg-smart-dark text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 pointer-events-none">
                                  {sale.totalTickets} Tickets
                                  <br />
                                  {sale.revenue} EGP
                                </div>
                                <div
                                  className="w-full max-w-[50px] bg-smart-light/20 group-hover:bg-smart-light transition-colors rounded-t-xl relative border border-smart-light/30"
                                  style={{ height: `${heightPercent}%` }}
                                >
                                  <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-smart-light/50 to-transparent rounded-t-xl"></div>
                                </div>
                                <div className="absolute -bottom-10 text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-tighter text-center w-full">
                                  {sale.month.split(' ')[0]}
                                  <br />
                                  {sale.month.split(' ')[1]}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-12 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest">
                        No sales data available.
                      </div>
                    )}
                  </>
                </WidgetErrorBoundary>
              )}
            </div>
          )}

          {activeTab === 'collections' && (
            <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300">
              <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex flex-col md:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic italic">
                  <svg
                    className="w-6 h-6 mr-3 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                    ></path>
                  </svg>
                  Cash Collections Management
                </h2>
                <div className="flex items-center text-smart-gray dark:text-gray-400">
                  <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl border border-smart-light/10 mr-4">
                    <button
                      onClick={() => setCashFilterStatus('PENDING')}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${cashFilterStatus === 'PENDING' ? 'bg-smart-light text-white shadow-md' : 'text-smart-gray dark:text-gray-500 hover:text-smart-dark dark:hover:text-white'}`}
                    >
                      Pending
                    </button>
                    <button
                      onClick={() => setCashFilterStatus('PAID')}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${cashFilterStatus === 'PAID' ? 'bg-smart-light text-white shadow-md' : 'text-smart-gray dark:text-gray-500 hover:text-smart-dark dark:hover:text-white'}`}
                    >
                      History
                    </button>
                  </div>
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="p-2 hover:bg-smart-light/10 rounded-full transition-colors disabled:opacity-50"
                  >
                    <svg
                      className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      ></path>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Advanced Filtering & Search */}
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-b border-smart-light/10">
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder="SEARCH BY NAME, EMAIL, PHONE OR TICKET ID..."
                    value={cashSearchQuery}
                    onChange={(e) => setCashSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                  />
                  <svg
                    className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    ></path>
                  </svg>
                </div>
              </div>

              <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                {isLoadingPendingCash ? (
                  <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                      <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                        <th className="px-6 py-4">Ticket ID</th>
                        <th className="px-6 py-4">Customer Details</th>
                        <th className="px-6 py-4 text-center">Amount Due</th>
                        <th className="px-6 py-4 text-right pr-8">Status / Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                      {Array.isArray(filteredCashTickets) && filteredCashTickets.map((ticket) => (
                        <tr
                          key={ticket._id}
                          className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="px-6 py-5 font-mono text-[11px] font-black text-smart-dark dark:text-white">
                            #{ticket._id.toString().slice(-8).toUpperCase()}
                            <br />
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">
                              {new Date(ticket.createdAt).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="font-black text-smart-dark dark:text-white italic uppercase text-xs">
                              {ticket.userId?.name || 'Unknown User'}
                            </div>
                            <div className="text-[10px] text-smart-gray dark:text-gray-400 font-medium">
                              {ticket.userId?.email || 'N/A'}
                              {ticket.userId?.phone && (
                                <span className="ml-2 opacity-50">| {ticket.userId.phone}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="text-lg font-black text-smart-dark dark:text-smart-glow italic">
                              {ticket.price}
                              <span className="text-[10px] ml-1 not-italic opacity-60">EGP</span>
                            </span>
                          </td>
                          <td className="px-6 py-5 pr-8 text-right">
                            {ticket.paymentStatus === 'PENDING' ? (
                              <button
                                onClick={() => handleConfirmCash(ticket._id, ticket.price)}
                                className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg hover:shadow-green-500/30 transform hover:-translate-y-0.5 active:scale-95 flex items-center justify-center ml-auto"
                              >
                                <svg
                                  className="w-4 h-4 mr-2"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                  ></path>
                                </svg>
                                Collect & Activate
                              </button>
                            ) : (
                              <span className="bg-smart-light/10 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest border border-smart-light/20 inline-flex items-center">
                                <svg
                                  className="w-4 h-4 mr-2"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  ></path>
                                </svg>
                                Fully Collected
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(!filteredCashTickets || filteredCashTickets.length === 0) && (
                        <tr>
                          <td
                            colSpan="4"
                            className="p-20 text-center text-smart-gray dark:text-gray-500"
                          >
                            <div className="flex flex-col items-center">
                              <svg
                                className="w-16 h-16 mb-4 opacity-10"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="1"
                                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                                ></path>
                              </svg>
                              <p className="font-black uppercase tracking-widest text-xs">
                                No cash tickets found.
                              </p>
                              <p className="text-[10px] mt-1 opacity-60">
                                Try adjusting your search or filter settings.
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300">
              <div
                className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setIsUserManagementExpanded(!isUserManagementExpanded)}
              >
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                  <svg
                    className="w-6 h-6 mr-3 text-smart-light"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    ></path>
                  </svg>
                  User Management
                </h2>
                <div className="flex items-center text-smart-gray dark:text-gray-400">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportUsersCSV();
                    }}
                    className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                    disabled={totalUsersCount === 0}
                  >
                    <svg
                      className="w-3 h-3 mr-1.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      ></path>
                    </svg>
                    Export CSV
                  </button>
                  <span className="text-xs font-bold mr-4 uppercase tracking-widest">
                    {totalUsersCount} Total Users
                  </span>
                  <svg
                    className={`w-6 h-6 transform transition-transform duration-300 ${isUserManagementExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </div>
              </div>

              {isUserManagementExpanded && (
                <>
                  {/* Filters and Search Bar */}
                  <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full md:max-w-md">
                      <input
                        type="text"
                        placeholder="SEARCH BY NAME OR EMAIL..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                      />
                      <svg
                        className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        ></path>
                      </svg>
                    </div>
                    <div className="w-full md:w-auto">
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full md:w-auto px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest cursor-pointer"
                      >
                        <option value="ALL">ALL STATUSES</option>
                        <option value="ACTIVE">ACTIVE USERS</option>
                        <option value="RESTRICTED">RESTRICTED USERS</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                          <th className="px-4 py-3 pl-6">Name</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3 text-center">Tickets</th>
                          <th className="px-4 py-3 text-center">Security Status</th>
                          <th className="px-4 py-3 pr-6 text-right">Access Control</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {Array.isArray(filteredUsers) && filteredUsers.map((user) => (
                          <tr
                            key={user._id}
                            className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <td className="px-4 py-3 pl-6 font-black text-smart-dark dark:text-white italic capitalize">
                              {user.name}
                            </td>
                            <td className="px-4 py-3 text-smart-gray dark:text-gray-400 font-medium">
                              {user.email}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full font-black text-[11px] border border-blue-500/20">
                                {user.ticketCount || 0}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center space-y-1">
                                {user.isRestricted ? (
                                  <button
                                    onClick={() => showModal(user.restrictionReason || 'No reason provided', 'Restriction Details', 'warning')}
                                    className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-orange-200 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                                  >
                                    Restricted
                                  </button>
                                ) : (
                                  <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-smart-light/20">
                                    Active
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 pr-6 text-right">
                              <div className="flex justify-end items-center space-x-2">
                                <button
                                  onClick={() =>
                                    navigate(`/admin/users/${user._id}/tickets`, {
                                      state: { userName: user.name, fromTab: activeTab },
                                    })
                                  }
                                  className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                >
                                  View Tickets
                                </button>
                                <button
                                  onClick={() => handleRestrictUser(user._id, user.isRestricted)}
                                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${user.isRestricted ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-200 dark:border-orange-800 shadow-sm'}`}
                                >
                                  {user.isRestricted ? 'Unrestrict' : 'Restrict'}
                                </button>
                                {isSuperAdmin && (
                                  <>
                                    <button
                                      onClick={() => handleDeleteUser(user._id)}
                                      className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 shadow-sm"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {(!filteredUsers || filteredUsers.length === 0) && (
                          <tr>
                            <td
                              colSpan="5"
                              className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                            >
                              No users found matching your criteria.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Controls */}
                  {totalUserPages > 1 && (
                    <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">
                        Showing {(userPage - 1) * 10 + 1} to{' '}
                        {Math.min(userPage * 10, totalUsersCount)} of {totalUsersCount}
                      </span>
                      <div className="flex space-x-2 ml-auto sm:ml-0">
                        <button
                          onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                          disabled={userPage === 1}
                          className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10"
                        >
                          Prev
                        </button>
                        <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center">
                          Page {userPage} of {totalUserPages}
                        </span>
                        <button
                          onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))}
                          disabled={userPage >= totalUserPages}
                          className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Sub-Admin Accounts Panel */}
          {activeTab === 'access' && isSuperAdmin && (
            <div
              className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isSubAdminsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}
            >
              <div
                className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setIsSubAdminsExpanded(!isSubAdminsExpanded)}
              >
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                  <svg
                    className="w-6 h-6 mr-3 text-purple-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    ></path>
                  </svg>
                  Sub-Admin Accounts
                </h2>
                <div className="flex items-center text-smart-gray dark:text-gray-400">
                  <span className="text-xs font-bold mr-4 uppercase tracking-widest">
                    {subAdmins.length} Admins
                  </span>
                  <svg
                    className={`w-6 h-6 transform transition-transform duration-300 ${isSubAdminsExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </div>
              </div>

              {isSubAdminsExpanded && (
                <div className="overflow-x-auto overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                        <th className="px-4 py-3 pl-6">Name</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3 text-center">Security Status</th>
                        <th className="px-4 py-3 pr-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                      {Array.isArray(subAdmins) && subAdmins.map((admin) => (
                        <tr
                          key={admin._id}
                          className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="px-4 py-3 pl-6 font-black text-smart-dark dark:text-white italic capitalize">
                            {admin.name}
                            {admin.email === superAdminEmail && (
                              <span className="ml-3 text-[9px] bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded-full uppercase tracking-widest not-italic">
                                System Owner
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-smart-gray dark:text-gray-400 font-medium">
                            {admin.email}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center space-y-1">
                              {admin.isRestricted ? (
                                <button
                                  onClick={() =>
                                    showModal(
                                      admin.restrictionReason || 'No reason provided',
                                      'Restriction Details',
                                      'warning'
                                    )
                                  }
                                  className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-orange-200 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                                >
                                  Restricted
                                </button>
                              ) : (
                                <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-smart-light/20">
                                  Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 pr-6 text-right">
                            <div className="flex justify-end items-center space-x-2">
                              {admin.email !== superAdminEmail ? (
                                <>
                                  <button
                                    onClick={() =>
                                      navigate(`/admin/users/${admin._id}/tickets`, {
                                        state: { userName: admin.name, fromTab: activeTab },
                                      })
                                    }
                                    className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                  >
                                    View Tickets
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleRestrictUser(admin._id, admin.isRestricted)
                                    }
                                    className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${admin.isRestricted ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-200 dark:border-orange-800 shadow-sm'}`}
                                  >
                                    {admin.isRestricted ? 'Unrestrict' : 'Restrict'}
                                  </button>
                                    <button
                                      onClick={() => handleDeleteUser(admin._id)}
                                      className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 shadow-sm"
                                    >
                                      Delete
                                    </button>
                                </>
                              ) : (
                                <span className="text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 mr-2">
                                  Protected
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!subAdmins || subAdmins.length === 0) && (
                        <tr>
                          <td
                            colSpan="4"
                            className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                          >
                            No sub-admin accounts found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Sub-Admin Provisioning Panel */}
          {activeTab === 'access' && isSuperAdmin && (
            <div
              className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isSubAdminProvisioningExpanded ? 'h-auto flex flex-col' : ''}`}
            >
              <div
                className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setIsSubAdminProvisioningExpanded(!isSubAdminProvisioningExpanded)}
              >
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                  <svg
                    className="w-6 h-6 mr-3 text-purple-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    ></path>
                  </svg>
                  Sub-Admin Provisioning
                </h2>
                <div className="flex items-center text-smart-gray dark:text-gray-400">
                  <svg
                    className={`w-6 h-6 transform transition-transform duration-300 ${isSubAdminProvisioningExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </div>
              </div>

              {isSubAdminProvisioningExpanded && (
                <div className="p-8 bg-smart-bg/10 dark:bg-gray-900/10">
                  <form onSubmit={handleCreateSubAdmin} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">
                          Full Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. John Doe"
                          value={newAdminName}
                          onChange={(e) => setNewAdminName(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">
                          Email Address
                        </label>
                        <input
                          type="email"
                          placeholder="e.g. john@smartpark.com"
                          value={newAdminEmail}
                          onChange={(e) => setNewAdminEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">
                          Temporary Password
                        </label>
                        <input
                          type="password"
                          placeholder="Enter password..."
                          value={newAdminPassword}
                          onChange={(e) => setNewAdminPassword(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                          required
                        />
                      </div>
                    </div>

                    <div className="p-6 rounded-2xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30">
                      <h3 className="text-xs font-black text-blue-800 dark:text-blue-400 uppercase tracking-widest mb-4 flex items-center">
                        <svg
                          className="w-4 h-4 mr-2"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          ></path>
                        </svg>
                        Network Binding (Required)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">
                            Bound IP Address
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 192.168.1.50"
                            value={newAdminIp}
                            onChange={(e) => setNewAdminIp(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">
                            Bound MAC Address (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 00:1B:44:11:3A:B7"
                            value={newAdminMac}
                            onChange={(e) => setNewAdminMac(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-sm"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-smart-gray dark:text-gray-500 mt-4 leading-relaxed">
                        This Sub-Admin will be permanently restricted to logging in from the
                        specified IP address. Any attempt to log in from a different location will
                        trigger a critical security alert and immediately block the connection.
                      </p>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={!newAdminName.trim() || !newAdminEmail.trim() || !newAdminPassword.trim() || !newAdminIp.trim()}
                        className="px-8 py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:-translate-y-0 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg transition-all transform hover:-translate-y-0.5"
                      >
                        Provision Sub-Admin
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* Admin IP Whitelist Panel */}
          {activeTab === 'access' && isSuperAdmin && (
            <div
              className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isWhitelistExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}
            >
              <div
                className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setIsWhitelistExpanded(!isWhitelistExpanded)}
              >
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                  <svg
                    className="w-6 h-6 mr-3 text-blue-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    ></path>
                  </svg>
                  Admin IP Whitelist
                </h2>
                <div className="flex items-center text-smart-gray dark:text-gray-400">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportWhitelistedIPsCSV();
                    }}
                    className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
                    disabled={totalWhitelistedIPs === 0}
                  >
                    <svg
                      className="w-3 h-3 mr-1.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      ></path>
                    </svg>
                    Export CSV
                  </button>
                  <span className="text-xs font-bold mr-4 uppercase tracking-widest">
                    {totalWhitelistedIPs} Allowed IPs
                  </span>
                  <svg
                    className={`w-6 h-6 transform transition-transform duration-300 ${isWhitelistExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </div>
              </div>

              {isWhitelistExpanded && (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10">
                    <form
                      onSubmit={handleAddWhitelistIP}
                      className="flex flex-col md:flex-row gap-4 items-end"
                    >
                      <div className="flex-1 w-full">
                        <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">
                          IP Address
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 192.168.1.50"
                          value={newWhitelistIP}
                          onChange={(e) => setNewWhitelistIP(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs"
                          required
                        />
                      </div>
                      <div className="flex-1 w-full">
                        <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">
                          MAC Address (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 00:1B:44:11:3A:B7"
                          value={newWhitelistMac}
                          onChange={(e) => setNewWhitelistMac(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs"
                        />
                      </div>
                      <div className="flex-1 w-full">
                        <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">
                          Description / Note
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Head Office Network"
                          value={newWhitelistDesc}
                          onChange={(e) => setNewWhitelistDesc(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full md:w-auto px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-sm transition-all whitespace-nowrap border border-blue-600"
                      >
                        Add to Whitelist
                      </button>
                    </form>
                  </div>

                  <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full md:max-w-md">
                      <input
                        type="text"
                        placeholder="SEARCH BY IP OR DESCRIPTION..."
                        value={whitelistedIPsSearchQuery}
                        onChange={(e) => setWhitelistedIPsSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                      />
                      <svg
                        className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        ></path>
                      </svg>
                    </div>
                  </div>

                  <div className="overflow-y-auto overflow-x-auto flex-grow">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                        <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                          <th className="px-4 py-3 pl-6">IP Address</th>
                          <th className="px-4 py-3">MAC Address</th>
                          <th className="px-4 py-3">Description</th>
                          <th className="px-4 py-3">Added On</th>
                          <th className="px-4 py-3 text-right pr-6">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                        {Array.isArray(whitelistedIPs) && whitelistedIPs.map((ip) => (
                          <tr
                            key={ip._id}
                            className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white">
                              {ip.ipAddress}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-smart-gray dark:text-gray-400 font-medium">
                              {ip.macAddress || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-xs text-smart-gray dark:text-gray-400 font-medium">
                              {ip.description || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500">
                              {new Date(ip.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 pr-6 text-right">
                              <button
                                onClick={() => handleRemoveWhitelistIP(ip._id)}
                                className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-red-500/20"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!whitelistedIPs || whitelistedIPs.length === 0) && (
                          <tr>
                            <td
                              colSpan="5"
                              className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                            >
                              No IP addresses have been whitelisted via the UI.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {whitelistHasMore && (
                      <div className="flex justify-center p-4 bg-smart-bg dark:bg-gray-900 border-t border-smart-light/10">
                        <button
                          onClick={handleLoadMoreWhitelistIPs}
                          disabled={isLoadingWhitelist}
                          className="px-6 py-2.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors border border-smart-light/20"
                        >
                          {isLoadingWhitelist ? 'Loading...' : 'Load More IPs'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Database Backups Panel */}
          {activeTab === 'system' && isSuperAdmin && (
            <div
              className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isBackupsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}
            >
              <div
                className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setIsBackupsExpanded(!isBackupsExpanded)}
              >
                <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
                  <svg
                    className="w-6 h-6 mr-3 text-cyan-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                    ></path>
                  </svg>
                  Database Backups
                </h2>
                <div className="flex items-center text-smart-gray dark:text-gray-400">
                  <span className="text-xs font-bold mr-4 uppercase tracking-widest">
                    {backups.length} Files
                  </span>
                  <svg
                    className={`w-6 h-6 transform transition-transform duration-300 ${isBackupsExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </div>
              </div>

              {isBackupsExpanded && (
                <div className="overflow-y-auto overflow-x-auto flex-grow">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                      <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                        <th className="px-4 py-3 pl-6">Filename</th>
                        <th className="px-4 py-3">Size</th>
                        <th className="px-4 py-3">Created On</th>
                        <th className="px-4 py-3 text-right pr-6">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                      {Array.isArray(backups) && backups.map((backup) => (
                        <tr
                          key={backup.filename}
                          className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white">
                            {backup.filename}
                          </td>
                          <td className="px-4 py-3 text-xs text-smart-gray dark:text-gray-400 font-medium">
                            {backup.size}
                          </td>
                          <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500">
                            {new Date(backup.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 pr-6 text-right flex justify-end space-x-2">
                            <button
                              onClick={() => handleDownloadBackup(backup.filename)}
                              className="px-4 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-blue-500/20"
                            >
                              Download
                            </button>
                            <button
                              onClick={() => handleRestoreBackup(backup.filename)}
                              disabled={restoringBackupFilename === backup.filename}
                              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border flex items-center justify-center ${restoringBackupFilename === backup.filename ? 'bg-green-500/20 text-green-600 border-green-500/40 cursor-wait' : 'bg-green-500/10 hover:bg-green-500/20 text-green-500 border-green-500/20'}`}
                            >
                              {restoringBackupFilename === backup.filename ? (
                                <>
                                  <svg
                                    className="animate-spin -ml-1 mr-2 h-3 w-3 text-green-600"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                  >
                                    <circle
                                      className="opacity-25"
                                      cx="12"
                                      cy="12"
                                      r="10"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                    ></circle>
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                  </svg>
                                  Restoring
                                </>
                              ) : (
                                'Restore'
                              )}
                            </button>
                            <button
                              onClick={() => handleDeleteBackup(backup.filename)}
                              className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-red-500/20"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!backups || backups.length === 0) && (
                        <tr>
                          <td
                            colSpan="4"
                            className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                          >
                            No backup files found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'hardware' && (
            <div className="flex flex-col xl:flex-row gap-8 mb-10 animate-fade-in-up items-stretch">
              {/* Gate QR Scanner */}
              <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col w-full xl:w-1/3">
                <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col items-center justify-center gap-4">
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic shrink-0">
                    <svg
                      className="w-6 h-6 mr-3 text-smart-light"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                      ></path>
                    </svg>
                    Gate QR Scanner
                  </h2>
                  <div className="flex flex-row flex-wrap justify-center items-center gap-3">
                    <button
                      onClick={handleToggleCamera}
                      className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 hover:bg-smart-light/20 text-smart-dark dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex justify-center items-center border border-smart-light/10"
                    >
                      <svg
                        className="w-3 h-3 mr-1.5 text-smart-light"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        ></path>
                      </svg>
                      Switch Cam
                    </button>
                    <button
                      onClick={handleUnlockScanner}
                      className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 hover:bg-smart-light/20 text-smart-dark dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex justify-center items-center border border-smart-light/10"
                    >
                      <svg
                        className="w-3 h-3 mr-1.5 text-smart-light"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                        ></path>
                      </svg>
                      Unlock
                    </button>
                    <div className="flex justify-center items-center space-x-2 bg-smart-light/10 dark:bg-smart-light/20 px-3 py-1.5 rounded-full border border-smart-light/20">
                      <div className="w-2 h-2 bg-smart-light rounded-full animate-ping"></div>
                      <span className="text-[10px] text-smart-dark dark:text-smart-glow font-black uppercase tracking-widest">
                        Online
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-grow flex flex-col bg-smart-dark/5 dark:bg-black p-6 sm:p-10 justify-center items-center relative">
                  {scanMessage && (
                    <div
                      className={`mb-8 p-6 rounded-2xl font-black text-center text-sm shadow-xl border-2 w-full mx-auto transform animate-fade-in ${scanMessage.type === 'success' ? 'bg-smart-light/20 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
                    >
                      {scanMessage.text}
                    </div>
                  )}

                  <div className="flex flex-col items-center justify-center p-6 bg-slate-800/50 rounded-xl border border-slate-700 w-full max-w-sm mx-auto gap-5 overflow-hidden shadow-2xl">
                    {/* 1. Dynamic Status Indicator */}
                    <div
                      className={`flex items-center justify-center gap-2 text-sm font-bold tracking-wider whitespace-nowrap ${isCameraActive ? 'text-green-400' : 'text-red-400'}`}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        ></path>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        ></path>
                      </svg>
                      {isCameraActive ? 'OPTICAL SENSOR ONLINE' : 'OPTICAL SENSOR OFFLINE'}
                    </div>

                    {/* 2. Main Action Button */}
                    <button
                      onClick={handleToggleSensor}
                      className={`w-full font-bold py-3 px-4 rounded-lg transition-all transform active:scale-95 flex items-center justify-center text-white shadow-lg ${isCameraActive ? 'bg-red-500 hover:bg-red-600 shadow-red-900/20' : 'bg-green-500 hover:bg-green-600 shadow-green-900/20'}`}
                    >
                      {isCameraActive ? 'HALT SENSOR LINK' : 'AUTHORIZE SENSOR LINK'}
                    </button>

                    {/* 3. Fallback Link */}
                    <label className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Scan an Image File</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileScan}
                      />
                    </label>
                  </div>

                  <div className="relative w-full max-w-md mx-auto mt-10">
                    <style>{`
                      #reader { border: none !important; }
                      #reader video { 
                        border-radius: 24px !important; 
                        object-fit: cover !important;
                        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) !important;
                      }
                      #reader img { display: none !important; }
                      #reader__scan_region { border: none !important; }
                    `}</style>
                    <div
                      id="reader"
                      className="w-full bg-white dark:bg-gray-800 rounded-[30px] shadow-2xl border-4 border-smart-dark dark:border-smart-light/50 ring-8 ring-smart-bg dark:ring-gray-900 overflow-hidden"
                    ></div>
                    {isLockedUI && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-[30px]">
                        <button
                          onClick={handleNextScan}
                          className="bg-blue-500 hover:bg-blue-600 text-white font-black py-4 px-10 rounded-2xl shadow-2xl transform transition hover:scale-105 active:scale-95 uppercase tracking-widest text-sm"
                        >
                          Next Scan
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-smart-bg dark:bg-gray-900 p-6 sm:p-8 border-t border-smart-light/10 mt-auto w-full">
                  <form
                    onSubmit={handleManualOverride}
                    className="flex flex-col space-y-4 max-w-md mx-auto w-full"
                  >
                    <div className="relative">
                      <input
                        type="text"
                        value={manualTicketId}
                        onChange={(e) => setManualTicketId(e.target.value)}
                        placeholder="ENTER TICKET IDENTIFIER..."
                        className="w-full px-6 py-5 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
                      />
                      <svg
                        className="w-5 h-5 absolute right-6 top-1/2 -translate-y-1/2 text-smart-light/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01"
                        ></path>
                      </svg>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-5 bg-smart-light hover:bg-smart-dark text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:shadow-smart-light/20 active:scale-95"
                    >
                      Manual Entry Override
                    </button>
                  </form>
                </div>
              </div>

              {/* Hardware Alerts Table */}
              <div
                id="hardware-alerts-panel"
                className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-300 w-full xl:w-2/3"
              >
                <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col lg:flex-row justify-between items-center gap-4">
                  <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none shrink-0 w-full lg:w-auto justify-center lg:justify-start">
                    <svg
                      className="w-6 h-6 mr-3 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      ></path>
                    </svg>
                    Hardware Alerts
                  </h2>
                  <div className="flex flex-row flex-wrap items-center justify-center lg:justify-end gap-3 w-full lg:w-auto text-smart-gray dark:text-gray-400">
                    {isSuperAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearHardwareAlerts();
                        }}
                        className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20"
                        disabled={alerts.length === 0}
                      >
                        <svg
                          className="w-3 h-3 mr-1.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          ></path>
                        </svg>
                        Clear All
                      </button>
                    )}
                    <div className="flex items-center space-x-2 bg-smart-bg dark:bg-gray-800 px-4 py-1.5 rounded-full border border-smart-light/10 mr-4">
                      <div className="w-2 h-2 bg-smart-light rounded-full animate-pulse"></div>
                      <span className="text-[10px] text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest hidden sm:inline">
                        Real-time Stream
                      </span>
                    </div>
                  </div>
                </div>

                {isHardwareAlertsExpanded && (
                  <>
                    <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-b border-smart-light/10 flex justify-between items-center">
                      <span className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest">
                        {filteredAlerts.length} Alerts
                      </span>
                      <select
                        value={alertFilterType}
                        onChange={(e) => {
                          setAlertFilterType(e.target.value);
                          fetchDashboardAlerts(e.target.value);
                        }}
                        className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none transition font-mono text-[10px] font-black tracking-widest cursor-pointer"
                      >
                        <option value="all">ALL ALERTS</option>
                        <option value="warning">WARNINGS</option>
                        <option value="info">INFO</option>
                        <option value="action">ACTIONS</option>
                        <option value="success">SUCCESS</option>
                        <option value="error">ERRORS</option>
                      </select>
                    </div>

                    <div className="flex-grow overflow-y-auto overflow-x-auto h-[450px] custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                          <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                            <th className="px-4 py-3 pl-6 whitespace-nowrap text-left w-1/4">
                              Date & Time
                            </th>
                            <th className="px-4 py-3 whitespace-nowrap text-center w-[100px]">
                              Type
                            </th>
                            <th className="px-4 py-3 w-full text-left">Alert Message</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                          {Array.isArray(filteredAlerts) && filteredAlerts.map((alert) => (
                            <tr
                              key={alert._id || alert.id}
                              className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                              <td className="px-4 py-3 pl-6 whitespace-nowrap align-top text-left w-1/4">
                                <div className="text-sm font-bold text-smart-dark dark:text-gray-300">
                                  {alert.timeString || alert.time}
                                </div>
                                <div className="text-xs font-bold text-smart-gray dark:text-gray-500 uppercase mt-0.5">
                                  {new Date(alert.createdAt).toLocaleDateString()}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap align-top text-center w-[100px]">
                                {alert.type === 'warning' && (
                                  <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-yellow-200 dark:border-yellow-800 inline-block w-[72px] text-center">
                                    Warning
                                  </span>
                                )}
                                {alert.type === 'info' && (
                                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-blue-200 dark:border-blue-800 inline-block w-[72px] text-center">
                                    Info
                                  </span>
                                )}
                                {alert.type === 'action' && (
                                  <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-smart-light/20 inline-block w-[72px] text-center">
                                    Action
                                  </span>
                                )}
                                {alert.type === 'success' && (
                                  <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-green-200 dark:border-green-800 inline-block w-[72px] text-center">
                                    Success
                                  </span>
                                )}
                                {alert.type === 'error' && (
                                  <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border border-red-200 dark:border-red-800 inline-block w-[72px] text-center">
                                    Error
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-smart-dark dark:text-gray-200 font-medium text-sm leading-relaxed break-words align-top text-left w-full">
                                {alert.message}
                              </td>
                            </tr>
                          ))}
                          {(!filteredAlerts || filteredAlerts.length === 0) && (
                            <tr>
                              <td
                                colSpan="3"
                                className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]"
                              >
                                No hardware alerts detected. Waiting for telemetry...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-auto flex flex-col w-full">
                      {(totalAlertPages > 1 || filteredAlerts.length === 0) && !isLoadingAlerts && (
                        <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-6 sm:px-8 py-4 border-t border-smart-light/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                          <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest text-center sm:text-left w-full sm:w-auto shrink-0">
                            Showing {filteredAlerts.length === 0 ? 0 : (alertPage - 1) * 10 + 1} to{' '}
                            {Math.min(alertPage * 10, totalAlertsCount)} of {totalAlertsCount}
                          </span>
                          <div className="flex space-x-2 items-center justify-center sm:justify-end w-full sm:w-auto shrink-0">
                            <button
                              onClick={() => fetchAlertsPage(Math.max(1, alertPage - 1))}
                              disabled={alertPage <= 1}
                              className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10 shadow-sm"
                            >
                              Prev
                            </button>
                            <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center shrink-0">
                              Page {filteredAlerts.length === 0 ? 0 : alertPage} of {filteredAlerts.length === 0 ? 0 : totalAlertPages}
                            </span>
                            <button
                              onClick={() =>
                                fetchAlertsPage(Math.min(totalAlertPages, alertPage + 1))
                              }
                              disabled={alertPage >= totalAlertPages || filteredAlerts.length === 0}
                              className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10 shadow-sm"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="bg-smart-bg dark:bg-gray-900 p-6 border-t border-smart-light/10 flex justify-center items-center">
                        <button
                          onClick={() => navigate('/admin/telemetry')}
                          className="bg-green-600 hover:bg-green-700 text-white font-black text-[11px] py-3 px-8 rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-green-900/20"
                        >
                          View Live Telemetry
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
