import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';
import { useTelemetry } from '../../../context/TelemetryContext';

const HardwareTab = ({ isSuperAdmin }) => {
  const navigate = useNavigate();
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
  const [isHardwareAlertsExpanded, setIsHardwareAlertsExpanded] = useState(true);

  const [manualTicketId, setManualTicketId] = useState('');
  const [scanMessage, setScanMessage] = useState(null);
  const [isLockedUI, setIsLockedUI] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const scannerRef = useRef(null);
  const scanLock = useRef(false);

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

  const playErrorSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audioCtx = new AudioContext();
      const playBuzz = (start) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + 0.2);
      };
      playBuzz(audioCtx.currentTime);
      playBuzz(audioCtx.currentTime + 0.25);
      setTimeout(() => audioCtx.close(), 1000);
    } catch (err) { console.error('Audio error failed', err); }
  };

  const onScanSuccess = (decodedText) => {
    if (scanLock.current || !decodedText) return;
    scanLock.current = true;
    setIsLockedUI(true);
    playSuccessSound();
    handleScanRequest(decodedText);
  };

  const onScanFailure = (error) => {};

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
          onScanFailure
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
    <div className="flex flex-col xl:flex-row gap-8 mb-10 animate-fade-in-up items-stretch">
      {/* Gate QR Scanner */}
      <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden flex flex-col w-full xl:w-1/3">
        <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col items-center justify-center gap-4">
          <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic shrink-0">
            <svg className="w-6 h-6 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
            </svg>
            Gate QR Scanner
          </h2>
          <div className="flex flex-row flex-wrap justify-center items-center gap-3">
            <button onClick={handleToggleSensor} className="px-3 py-1.5 bg-smart-bg dark:bg-gray-800 hover:bg-smart-light/20 text-smart-dark dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm flex justify-center items-center border border-smart-light/10">
              <svg className="w-3 h-3 mr-1.5 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              {isCameraActive ? 'Halt Link' : 'Start Link'}
            </button>
            <div className="flex justify-center items-center space-x-2 bg-smart-light/10 dark:bg-smart-light/20 px-3 py-1.5 rounded-full border border-smart-light/20">
              <div className="w-2 h-2 bg-smart-light rounded-full animate-ping"></div>
              <span className="text-[10px] text-smart-dark dark:text-smart-glow font-black uppercase tracking-widest">Online</span>
            </div>
          </div>
        </div>

        <div className="flex-grow flex flex-col bg-smart-dark/5 dark:bg-black p-6 sm:p-10 justify-center items-center relative min-h-[300px]">
          {scanMessage && (
            <div className={`mb-8 p-6 rounded-2xl font-black text-center text-sm shadow-xl border-2 w-full mx-auto transform animate-fade-in ${scanMessage.type === 'success' ? 'bg-smart-light/20 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
              {scanMessage.text}
            </div>
          )}

          <div id="reader" className="w-full bg-white dark:bg-gray-800 rounded-[30px] shadow-2xl border-4 border-smart-dark dark:border-smart-light/50 ring-8 ring-smart-bg dark:ring-gray-900 overflow-hidden"></div>
          
          {isLockedUI && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-[30px]">
              <button onClick={handleNextScan} className="bg-blue-500 hover:bg-blue-600 text-white font-black py-4 px-10 rounded-2xl shadow-2xl transform transition hover:scale-105 active:scale-95 uppercase tracking-widest text-sm">Next Scan</button>
            </div>
          )}
          
          {!isCameraActive && !scanMessage && (
            <label className="mt-8 text-sm text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Upload QR Image</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileScan} />
            </label>
          )}
        </div>

        <div className="bg-smart-bg dark:bg-gray-900 p-6 sm:p-8 border-t border-smart-light/10 mt-auto w-full">
          <form onSubmit={handleManualOverride} className="flex flex-col space-y-4 max-w-md mx-auto w-full">
            <div className="relative">
              <input type="text" value={manualTicketId} onChange={(e) => setManualTicketId(e.target.value)} placeholder="ENTER TICKET IDENTIFIER..." className="w-full px-6 py-5 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest" />
            </div>
            <button type="submit" className="w-full py-5 bg-smart-light hover:bg-smart-dark text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:shadow-smart-light/20 active:scale-95">Manual Entry Override</button>
          </form>
        </div>
      </div>

      {/* Hardware Alerts Table */}
      <div id="hardware-alerts-panel" className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-300 w-full xl:w-2/3">
        <div className="bg-smart-bg dark:bg-gray-900 px-6 sm:px-8 py-6 border-b border-smart-light/10 flex flex-col lg:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none shrink-0 w-full lg:w-auto justify-center lg:justify-start">
            <svg className="w-6 h-6 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Hardware Alerts
          </h2>
          <div className="flex flex-row flex-wrap items-center justify-center lg:justify-end gap-3 w-full lg:w-auto text-smart-gray dark:text-gray-400">
            {isSuperAdmin && (
              <button onClick={(e) => { e.stopPropagation(); handleClearHardwareAlerts(); }} className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20" disabled={masterAlertList.length === 0}>
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                Clear All
              </button>
            )}
            <div className="flex items-center space-x-2 bg-smart-bg dark:bg-gray-800 px-4 py-1.5 rounded-full border border-smart-light/10 mr-4">
              <div className="w-2 h-2 bg-smart-light rounded-full animate-pulse"></div>
              <span className="text-[10px] text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest hidden sm:inline">Real-time Stream</span>
            </div>
          </div>
        </div>

        <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-b border-smart-light/10 flex justify-between items-center">
          <span className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest">{filteredAlerts.length} Alerts</span>
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

        <div className="flex-grow overflow-y-auto overflow-x-hidden h-[450px] custom-scrollbar-alerts pr-2">
          <table className="w-full text-left table-fixed border-collapse">
            <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
              {Array.isArray(filteredAlerts) && filteredAlerts.map((alert) => (
                <tr key={alert._id || alert.id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 pl-6 align-top text-left w-1/4">
                    <div className="text-sm font-bold text-smart-dark dark:text-gray-300">{alert.timeString || alert.time}</div>
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
                  <td className="px-4 py-3 text-smart-dark dark:text-gray-200 font-medium text-sm leading-relaxed break-words align-top text-left">
                    {alert.message}
                  </td>
                </tr>
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
          {(totalAlertPages > 1 || filteredAlerts.length === 0) && !isLoadingAlerts && (
            <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-6 sm:px-8 py-4 border-t border-smart-light/10 flex flex-col sm:flex-row justify-between items-center gap-4">
              <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest text-center sm:text-left w-full sm:w-auto shrink-0">
                Showing {filteredAlerts.length === 0 ? 0 : (alertPage - 1) * 10 + 1} to {Math.min(alertPage * 10, totalAlertsCount)} of {totalAlertsCount}
              </span>
              <div className="flex space-x-2 items-center justify-center sm:justify-end w-full sm:w-auto shrink-0">
                <button onClick={() => fetchAlertsPage(Math.max(1, alertPage - 1))} disabled={alertPage <= 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10 shadow-sm">Prev</button>
                <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center shrink-0">Page {filteredAlerts.length === 0 ? 0 : alertPage} of {filteredAlerts.length === 0 ? 0 : totalAlertPages}</span>
                <button onClick={() => fetchAlertsPage(Math.min(totalAlertPages, alertPage + 1))} disabled={alertPage >= totalAlertPages || filteredAlerts.length === 0} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10 shadow-sm">Next</button>
              </div>
            </div>
          )}

          <div className="bg-smart-bg dark:bg-gray-900 p-6 border-t border-smart-light/10 flex justify-center items-center">
            <button onClick={() => navigate('/admin/telemetry')} className="bg-green-600 hover:bg-green-700 text-white font-black text-[11px] py-3 px-8 rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-green-900/20">View Live Telemetry</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HardwareTab;
