import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';
import { useTelemetry } from '../../../context/TelemetryContext';
import { socket } from '../../../socket';

const TelemetryWidget = ({ title, value, unit, icon, colorClass, children }) => (
  <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-smart-light/10 shadow-xl flex flex-col items-center justify-center text-center group hover:border-smart-light/40 transition-all duration-300 relative overflow-hidden h-full">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${colorClass} relative z-10`}>
      {icon}
    </div>
    <h3 className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-1 relative z-10">{title}</h3>
    <div className="flex items-baseline gap-1 relative z-10">
      <span className="text-2xl font-black text-smart-dark dark:text-white italic tracking-tighter">
        {value}
      </span>
      {value !== 'N/A' && unit && <span className="text-xs font-bold text-smart-light">{unit}</span>}
    </div>
    {children}
  </div>
);

const SkeletonWidget = () => (
  <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-smart-light/10 shadow-xl animate-pulse h-40 flex flex-col items-center justify-center">
    <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-2xl mb-3"></div>
    <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-2"></div>
    <div className="w-12 h-5 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
  </div>
);

const HardwareTab = () => {
  const superAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
  const currentAdminEmail = (localStorage.getItem('adminEmail') || '').toLowerCase().trim();
  const isSuperAdmin = currentAdminEmail === superAdminEmail;

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showModal, showConfirm } = useUI();
  const {
    alerts: masterAlertList,
    setAlerts: setMasterAlertList,
    totalAlertsCount,
    setTotalAlertsCount,
    setUnreadAlertsCount
  } = useTelemetry();

  const [alertFilterType, setAlertFilterType] = useState('all');
  const [alertPage, setAlertPage] = useState(1);
  const [totalAlertPages, setTotalAlertPages] = useState(1);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(false);

  const location = useLocation();
  const [manualTicketId, setManualTicketId] = useState('');
  const [scanMessage, setScanMessage] = useState(null);
  const [isLockedUI, setIsLockedUI] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const scannerRef = useRef(null);
  const scanLock = useRef(false);

  useEffect(() => {
    // Priority 1: Query Parameters (for Scan & Expire workflow)
    const ticketIdFromQuery = searchParams.get('ticketId');
    if (ticketIdFromQuery) {
      setManualTicketId(ticketIdFromQuery);
    }
    // Priority 2: Location State (fallback)
    else if (location.state?.prefillTicketId) {
      setManualTicketId(location.state.prefillTicketId);
      // Clean up the state so it doesn't persist on subsequent re-renders or navigations
      window.history.replaceState({}, document.title);
    }
  }, [location, searchParams]);

  // Telemetry state
  const [telemetry, setTelemetry] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    // 1. Fetch initial telemetry
    const fetchInitialTelemetry = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/telemetry/latest', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data) {
          setTelemetry(res.data);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error('Failed to fetch initial telemetry:', err);
      }
    };

    // Ensure socket is connected and authenticated
    const connectSocket = () => {
      if (!socket.connected) {
        socket.connect();
      }
    };

    connectSocket();
    fetchInitialTelemetry();

    // 2. Setup fallback polling (every 10 seconds)
    const pollInterval = setInterval(() => {
      fetchInitialTelemetry();
    }, 10000);

    // 3. Setup socket listeners
    const handleConnect = () => {
      setIsConnected(true);
      console.log('[HardwareTab] WebSocket Connected');
    };
    const handleDisconnect = () => {
      setIsConnected(false);
      console.log('[HardwareTab] WebSocket Disconnected');
    };
    const handleTelemetryUpdate = (data) => {
      console.log('[HardwareTab] Live Telemetry Received:', data);
      setTelemetry(data);
      setLastUpdated(new Date());
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('telemetryUpdate', handleTelemetryUpdate);

    // Initial check
    setIsConnected(socket.connected);

    // Re-check connection periodically
    const connInterval = setInterval(() => {
      if (!socket.connected) {
        socket.connect();
      }
    }, 5000);

    return () => {
      clearInterval(connInterval);
      clearInterval(pollInterval);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('telemetryUpdate', handleTelemetryUpdate);
    };
  }, []);

  const formatValue = (val) => (val === -1 || val === "-1" ? 'N/A' : val);

  // Derivation: Displayed Alert List
  const filteredAlerts = useMemo(() => {
    return masterAlertList.filter((alert) => {
      if (alertFilterType === 'all') return true;
      return alert.type === alertFilterType;
    });
  }, [masterAlertList, alertFilterType]);

  const fetchDashboardAlerts = async (type, silent = false) => {
    if (!silent) setIsLoadingAlerts(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/hardware-alerts', {
        params: { page: 1, limit: 10, ...(type !== 'all' ? { type } : {}) },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      setMasterAlertList(data.alerts || (Array.isArray(data) ? data : []));
      setTotalAlertPages(data.totalPages || 1);
      setAlertPage(1);
      setTotalAlertsCount(data.totalAlerts || 0);
    } catch (error) {
      console.error('Failed to load dashboard alerts', error);
    } finally {
      if (!silent) setIsLoadingAlerts(false);
    }
  };

  const fetchAlertsPage = async (page) => {
    setIsLoadingAlerts(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/hardware-alerts', {
        params: { page, limit: 10, ...(alertFilterType !== 'all' ? { type: alertFilterType } : {}) },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      setMasterAlertList(data.alerts || []);
      setTotalAlertPages(data.totalPages || 1);
      setAlertPage(page);
    } catch (error) {
      console.error('Failed to load alerts page', error);
    } finally {
      setIsLoadingAlerts(false);
    }
  };

  useEffect(() => {
    fetchDashboardAlerts(alertFilterType, true);
    setUnreadAlertsCount(0);
  }, []);

  // Scanner Logic
  useEffect(() => {
    const readerElement = document.getElementById('reader');
    if (readerElement && !scannerRef.current) {
      scannerRef.current = new Html5Qrcode('reader');
    }

    return () => {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {});
        }
        scannerRef.current = null;
      }
    };
  }, []);

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
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      playNote(880, audioCtx.currentTime, 0.1);
      playNote(1108.73, audioCtx.currentTime + 0.1, 0.2);
      setTimeout(() => audioCtx.close(), 1000);
    } catch (err) { console.error('Audio success failed', err); }
  };

  const onScanSuccess = (decodedText) => {
    if (scanLock.current || !decodedText) return;
    scanLock.current = true;
    setIsLockedUI(true);
    playSuccessSound();
    handleScanRequest(decodedText);
  };

  const handleScanRequest = async (idToScan) => {
    const token = localStorage.getItem('token');
    try {
      setScanMessage(null);
      const response = await api.post(
        '/admin/scan',
        { ticketId: idToScan },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setScanMessage({ type: 'success', text: response.data.message });
    } catch (error) {
      setScanMessage({ type: 'error', text: error.response?.data?.message || 'Scan failed' });
    }
  };

  const handleToggleSensor = async () => {
    if (!scannerRef.current) return;
    if (isCameraActive) {
      await scannerRef.current.stop();
      setIsCameraActive(false);
    } else {
      try {
        await scannerRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          () => {}
        );
        setIsCameraActive(true);
      } catch (err) {
        setScanMessage({ type: 'error', text: 'Camera access denied.' });
      }
    }
  };

  const handleFileScan = async (e) => {
    if (!scannerRef.current || !e.target.files[0]) return;
    try {
      const decodedText = await scannerRef.current.scanFile(e.target.files[0], true);
      onScanSuccess(decodedText);
    } catch (err) {
      setScanMessage({ type: 'error', text: 'No QR code found.' });
    }
  };

  const handleNextScan = () => {
    setIsLockedUI(false);
    setScanMessage(null);
    scanLock.current = false;
  };

  const handleManualOverride = async (e) => {
    e.preventDefault();
    if (!manualTicketId.trim()) return;
    await handleScanRequest(manualTicketId);
    setManualTicketId('');
  };

  const handleClearHardwareAlerts = async () => {
    const isConfirmed = await showConfirm('Clear all hardware alerts?', 'Clear Alerts');
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete('/admin/hardware-alerts', { headers: { Authorization: `Bearer ${token}` } });
      setMasterAlertList([]);
    } catch (error) {
      showModal('Failed to clear alerts', 'Error', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-8 mb-10">
      {/* System Telemetry Dashboard */}
      <section className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 p-8">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-3.5 h-3.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.8)]' : 'bg-gray-400 shadow-[0_0_12px_rgba(156,163,175,0.4)]'}`}></div>
            <div>
              <h2 className="text-2xl font-black text-smart-dark dark:text-white uppercase italic tracking-tighter flex items-center">
                Live Sensor Dashboard
                <span className="ml-3 px-2 py-0.5 bg-green-500/20 text-green-500 text-[10px] rounded-md not-italic tracking-widest font-bold animate-pulse">LIVE FEED</span>
              </h2>
              {lastUpdated && (
                <p className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-[0.2em] mt-1">
                  Last Updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
          <div className="h-1 w-24 bg-smart-light/20 rounded-full hidden md:block"></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Soil Moisture */}
          {!telemetry ? <SkeletonWidget /> : (
            <TelemetryWidget 
              title="Soil Moisture" 
              value={telemetry.moisture === -1 ? 'N/A' : `${Math.round((telemetry.moisture / 1023) * 100)}%`}
              colorClass="bg-blue-500/10 text-blue-500"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
            >
              {telemetry.moisture !== -1 && (
                <div className="w-full mt-4 bg-gray-100 dark:bg-gray-700/50 h-1.5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((telemetry.moisture / 1023) * 100)}%` }}
                    className="h-full bg-blue-500"
                  />
                </div>
              )}
              <span className="text-[8px] font-black text-smart-gray mt-2 uppercase tracking-widest">Dryness Level</span>
            </TelemetryWidget>
          )}

          {/* Humidity */}
          {!telemetry ? <SkeletonWidget /> : (
            <TelemetryWidget 
              title="Humidity" 
              value={telemetry.humidity === -1 ? 'N/A' : telemetry.humidity.toFixed(1)}
              unit="%"
              colorClass="bg-cyan-500/10 text-cyan-500"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>}
            />
          )}

          {/* Temperature */}
          {!telemetry ? <SkeletonWidget /> : (
            <TelemetryWidget 
              title="Temperature" 
              value={telemetry.temperature === -1 ? 'N/A' : telemetry.temperature.toFixed(1)}
              unit="°C"
              colorClass="bg-orange-500/10 text-orange-500"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            />
          )}

          {/* RGB Distance */}
          {!telemetry ? <SkeletonWidget /> : (
            <TelemetryWidget 
              title="RGB Range" 
              value={telemetry.rgbDistance === -1 ? 'N/A' : telemetry.rgbDistance}
              unit="cm"
              colorClass="bg-purple-500/10 text-purple-500"
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            >
              <div className={`mt-3 px-3 py-1 rounded-full text-[9px] font-black border ${
                telemetry.rgbDistance === -1 ? 'bg-gray-500/10 text-gray-500 border-gray-500/20' :
                telemetry.rgbDistance <= 5 ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                telemetry.rgbDistance <= 10 ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                'bg-green-500/10 text-green-500 border-green-500/20'
              }`}>
                {telemetry.rgbDistance === -1 ? 'OFFLINE' : telemetry.rgbDistance <= 5 ? 'DANGER' : telemetry.rgbDistance <= 10 ? 'WARNING' : 'CLEAR'}
              </div>
            </TelemetryWidget>
          )}

          {/* LDR Status */}
          {!telemetry ? <SkeletonWidget /> : (
            <TelemetryWidget 
              title="LDR Status" 
              value={telemetry.ldrStatus || 'OFF'}
              colorClass={telemetry.ldrStatus === 'ON' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-gray-500/10 text-gray-500'}
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
            >
               <div className={`mt-3 w-10 h-5 rounded-full relative transition-colors duration-300 ${telemetry.ldrStatus === 'ON' ? 'bg-yellow-500/30' : 'bg-gray-300 dark:bg-gray-700'}`}>
                  <motion.div 
                    animate={{ x: telemetry.ldrStatus === 'ON' ? 20 : 0 }}
                    className={`absolute top-1 left-1 w-3 h-3 rounded-full shadow-sm ${telemetry.ldrStatus === 'ON' ? 'bg-yellow-500' : 'bg-gray-500'}`}
                  />
               </div>
            </TelemetryWidget>
          )}

          {/* Water Pump */}
          {!telemetry ? <SkeletonWidget /> : (
            <TelemetryWidget 
              title="Water Pump" 
              value={telemetry.pumpStatus || 'OFF'}
              colorClass={telemetry.pumpStatus === 'ON' ? 'bg-blue-500/10 text-blue-500' : 'bg-gray-500/10 text-gray-500'}
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            >
              {telemetry.pumpStatus === 'ON' && (
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-blue-500/10 rounded-full"
                />
              )}
              <div className={`mt-3 flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black border transition-all ${telemetry.pumpStatus === 'ON' ? 'bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-500/30' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 border-transparent'}`}>
                {telemetry.pumpStatus === 'ON' && <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping"></span>}
                {telemetry.pumpStatus || 'OFF'}
              </div>
            </TelemetryWidget>
          )}
        </div>

        {/* Gate State Overlays (Compact) */}
        {telemetry && (
          <div className="mt-8 pt-6 border-t border-smart-light/5 flex flex-wrap items-center justify-center gap-8 text-smart-gray dark:text-gray-400">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest">Gate Position:</span>
              <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border ${telemetry.servoStatus === 'OPEN' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                {telemetry.servoStatus || 'CLOSED'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest">Servo Distance:</span>
              <span className="text-sm font-black text-smart-dark dark:text-white italic">{formatValue(telemetry.servoDistance)}cm</span>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-col xl:flex-row gap-8 items-stretch">
        {/* Gate QR Scanner */}
        <motion.div 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col w-full xl:w-1/3"
        >
          <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col items-center justify-center gap-4">
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic shrink-0">
              <svg className="w-6 h-6 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
              </svg>
              Gate QR Scanner
            </h2>
            <div className="flex flex-row flex-wrap justify-center items-center gap-3">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleToggleSensor} 
                className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 hover:bg-smart-light/20 text-smart-dark dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex justify-center items-center border border-smart-light/10"
              >
                <svg className="w-3 h-3 mr-1.5 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                {isCameraActive ? 'Halt Link' : 'Start Link'}
              </motion.button>
              <div className="flex justify-center items-center space-x-2 bg-smart-light/10 dark:bg-smart-light/20 px-3 py-1.5 rounded-full border border-smart-light/20">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-smart-light animate-ping' : 'bg-gray-400'}`}></div>
                <span className="text-[10px] text-smart-dark dark:text-smart-glow font-black uppercase tracking-widest">{isConnected ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          </div>

          <div className="flex-grow flex flex-col bg-smart-dark/5 dark:bg-black p-6 sm:p-10 justify-center items-center relative min-h-[300px]">
            <AnimatePresence>
              {scanMessage && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`mb-8 p-6 rounded-2xl font-black text-center text-sm shadow-xl border-2 w-full mx-auto ${scanMessage.type === 'success' ? 'bg-smart-light/20 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}
                >
                  {scanMessage.text}
                </motion.div>
              )}
            </AnimatePresence>

            <div id="reader" className="w-full bg-white dark:bg-gray-800 rounded-[30px] shadow-2xl border-4 border-smart-dark dark:border-smart-light/50 ring-8 ring-smart-bg dark:ring-gray-900 overflow-hidden"></div>
            
            <AnimatePresence>
              {isLockedUI && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-[30px]"
                >
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleNextScan} 
                    className="bg-blue-500 hover:bg-blue-600 text-white font-black py-4 px-10 rounded-2xl shadow-2xl uppercase tracking-widest text-sm"
                  >
                    Next Scan
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
            
            {!isCameraActive && !scanMessage && (
              <motion.label 
                whileHover={{ scale: 1.05 }}
                className="mt-8 text-sm text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span>Upload QR Image</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleFileScan} />
              </motion.label>
            )}
          </div>

          <div className="bg-smart-bg dark:bg-gray-900 p-6 sm:p-8 border-t border-smart-light/10 mt-auto w-full">
            <form onSubmit={handleManualOverride} className="flex flex-col space-y-4 max-w-md mx-auto w-full">
              <div className="relative">
                <input type="text" value={manualTicketId} onChange={(e) => setManualTicketId(e.target.value)} placeholder="ENTER TICKET IDENTIFIER..." className="w-full px-6 py-5 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest" />
              </div>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit" 
                className="w-full py-5 bg-smart-light hover:bg-smart-dark text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl"
              >
                Manual Entry Override
              </motion.button>
            </form>
          </div>
        </motion.div>

        {/* Hardware Alerts Table */}
        <motion.div 
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          id="hardware-alerts-panel" 
          className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-300 w-full xl:w-2/3 relative min-h-[500px]"
        >
          <AnimatePresence>
            {isLoadingAlerts && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px] z-30 flex justify-center items-center"
              >
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col lg:flex-row justify-between items-center gap-4">
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none shrink-0 w-full lg:w-auto justify-center lg:justify-start">
              <svg className="w-6 h-6 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              Hardware Alerts
            </h2>
            <div className="flex flex-row flex-wrap items-center justify-center lg:justify-end gap-3 w-full lg:w-auto text-smart-gray dark:text-gray-400">
              {isSuperAdmin && (
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); handleClearHardwareAlerts(); }} 
                  className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20" 
                  disabled={masterAlertList.length === 0}
                >
                  <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                  Clear All
                </motion.button>
              )}
              <div className="flex items-center space-x-2 bg-smart-bg dark:bg-gray-800 px-4 py-1.5 rounded-full border border-smart-light/10 mr-4">
                <div className="w-2 h-2 bg-smart-light rounded-full animate-pulse"></div>
                <span className="text-[10px] text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest hidden sm:inline">Real-time Stream</span>
              </div>
            </div>
          </div>

          <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-b border-smart-light/10 flex justify-between items-center">
            <span className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest">{totalAlertsCount} Alerts</span>
            <select value={alertFilterType} onChange={(e) => { setAlertFilterType(e.target.value); fetchDashboardAlerts(e.target.value); }} className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none transition font-mono text-[10px] font-black tracking-widest cursor-pointer">
              <option value="all">ALL ALERTS</option>
              <option value="warning">WARNINGS</option>
              <option value="info">INFO</option>
              <option value="action">ACTIONS</option>
              <option value="success">SUCCESS</option>
              <option value="error">ERRORS</option>
            </select>
          </div>

          <div className="bg-smart-bg dark:bg-gray-900 z-20 border-b border-smart-light/10">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-4 py-4 pl-6 w-1/4">Date & Time</th>
                  <th className="px-4 py-4 text-center w-[120px]">Type</th>
                  <th className="px-4 py-4 text-left">Alert Message</th>
                </tr>
              </thead>
            </table>
          </div>

          <div className="flex-grow overflow-x-hidden pr-2">
            <table className="w-full text-left table-fixed border-collapse">
              <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                {Array.isArray(filteredAlerts) && filteredAlerts.map((alert, idx) => (
                  <motion.tr 
                    key={alert._id || alert.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.2) }}
                    className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3 pl-6 align-top text-left w-1/4">
                      <div className="text-sm font-bold text-smart-dark dark:text-gray-300 italic">{alert.timeString || alert.time}</div>
                      <div className="text-xs font-bold text-smart-gray dark:text-gray-500 uppercase mt-0.5">{new Date(alert.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-center w-[120px]">
                      <span className={`text-[9px] font-black px-2.5 py-1.5 rounded-md uppercase tracking-wider border inline-block w-[72px] text-center ${
                        alert.type === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' :
                        alert.type === 'info' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-800' :
                        alert.type === 'action' ? 'bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow border-smart-light/20' :
                        alert.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800' :
                        'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800'
                      }`}>
                        {alert.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-smart-dark dark:text-gray-200 font-medium text-sm leading-relaxed break-words align-top text-left italic">
                      {alert.message}
                    </td>
                  </motion.tr>
                ))}
                {(!filteredAlerts || filteredAlerts.length === 0) && (
                  <tr>
                    <td colSpan="3" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No hardware alerts detected.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-auto flex flex-col w-full">
            {totalAlertPages > 1 && !isLoadingAlerts && (
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
                <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">Showing {(alertPage - 1) * 10 + 1} to {Math.min(alertPage * 10, totalAlertsCount)} of {totalAlertsCount}</span>
                <div className="flex space-x-2 ml-auto sm:ml-0">
                  <motion.button 
                    whileHover={{ scale: 1.05 }} 
                    whileTap={{ scale: 0.95 }} 
                    onClick={() => fetchAlertsPage(Math.max(1, alertPage - 1))} 
                    disabled={alertPage === 1} 
                    className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10"
                  >
                    Prev
                  </motion.button>
                  <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center italic">Page {alertPage} of {totalAlertPages}</span>
                  <motion.button 
                    whileHover={{ scale: 1.05 }} 
                    whileTap={{ scale: 0.95 }} 
                    onClick={() => fetchAlertsPage(Math.min(totalAlertPages, alertPage + 1))} 
                    disabled={alertPage >= totalAlertPages} 
                    className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10"
                  >
                    Next
                  </motion.button>
                </div>
              </div>
            )}

          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default HardwareTab;
