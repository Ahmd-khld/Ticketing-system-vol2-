import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';
import { useTelemetry } from '../../../context/TelemetryContext';
import { socket } from '../../../socket';

const SecurityTab = () => {
  const { showModal, showConfirm } = useUI();
  const { setUnreadAuditCount } = useTelemetry();

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [totalAuditLogPages, setTotalAuditLogPages] = useState(1);
  const [totalAuditLogsCount, setTotalAuditLogsCount] = useState(0);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchAuditLogs = async (page = 1) => {
    setIsLoadingAuditLogs(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/audit-logs', {
        params: { page, limit: 10 },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      setAuditLogs(data.logs || []);
      setAuditLogPage(data.currentPage || 1);
      setTotalAuditLogPages(data.totalPages || 1);
      setTotalAuditLogsCount(data.totalLogs || 0);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs(auditLogPage);
  }, [auditLogPage]);

  useEffect(() => {
    setUnreadAuditCount(0);
    
    // Connect socket if not connected
    if (!socket.connected) {
      socket.connect();
    }

    // Listen for live audit log updates
    const handleAuditUpdate = (newLog) => {
      setAuditLogs((prevLogs) => {
        // If we're on the first page, we can prepend the new log
        if (auditLogPage === 1) {
          // Check if log already exists (optional safety)
          if (prevLogs.find(log => log._id === newLog._id)) return prevLogs;
          const updatedLogs = [newLog, ...prevLogs].slice(0, 10);
          return updatedLogs;
        }
        return prevLogs;
      });
      setTotalAuditLogsCount((prev) => prev + 1);
    };

    socket.on('auditLogUpdate', handleAuditUpdate);

    return () => {
      socket.off('auditLogUpdate', handleAuditUpdate);
    };
  }, [auditLogPage]);

  useEffect(() => {
    setUnreadAuditCount(0);
  }, []);

  const handleRefreshLogs = (e) => {
    if (e) e.stopPropagation();
    fetchAuditLogs(1);
  };

  const handleClearAuditLogs = async (olderThan = null) => {
    const confirmMsg = olderThan
      ? `Are you sure you want to wipe security audit logs older than ${olderThan} days?`
      : 'Are you sure you want to completely wipe the security audit history? This action cannot be undone.';
    if (!(await showConfirm(confirmMsg, 'Clear Audit Logs'))) return;

    const token = localStorage.getItem('token');
    try {
      await api.delete('/admin/audit-logs', {
        params: olderThan ? { olderThan } : {},
        headers: { Authorization: `Bearer ${token}` },
      });
      showModal(`Logs ${olderThan ? `older than ${olderThan} days ` : ''}cleared successfully.`, 'Success', 'success');
      fetchAuditLogs(1);
    } catch (err) {
      showModal('Failed to clear logs.', 'Error', 'error');
    }
  };

  const handleExportAuditLogsCSV = () => {
    if (auditLogs.length === 0) return;
    const headers = ['Date & Time', 'Identity', 'Action', 'Status', 'IP Address'];
    const csvRows = [headers.join(',')];
    auditLogs.forEach((log) => {
      csvRows.push(`"${new Date(log.createdAt).toLocaleString()}","${log.email}","${log.action}","${log.status}","${log.ipAddress}"`);
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart-park-audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div>
      {/* Security Audit Logs Panel */}
      <div id="audit-logs-panel" className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 relative h-auto max-h-[800px] flex flex-col min-h-[500px]">
        <AnimatePresence>
          {isLoadingAuditLogs && (
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
        <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-default">
          <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
            <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            Security Audit Logs
            <motion.button
              whileHover={{ rotate: 90, scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleRefreshLogs}
              className="ml-4 p-2 bg-white/10 hover:bg-white/20 rounded-full border border-white/10 transition-colors"
              title="Refresh Logs"
            >
              <svg className="w-4 h-4 text-smart-gray dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </motion.button>
          </h2>
          <div className="flex items-center text-smart-gray dark:text-gray-400">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); handleClearAuditLogs(30); }} className="hidden sm:flex items-center mr-2 px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-yellow-500/20" disabled={totalAuditLogsCount === 0}>
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              Clear &gt; 30 Days
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); handleClearAuditLogs(null); }} className="hidden sm:flex items-center mr-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20" disabled={totalAuditLogsCount === 0}>
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              Clear All
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); handleExportAuditLogsCSV(); }} className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20" disabled={totalAuditLogsCount === 0}>
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Export CSV
            </motion.button>
            <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalAuditLogsCount} Records</span>
          </div>
        </div>
        <div className="overflow-hidden flex flex-col h-full">
            <div className="bg-smart-bg dark:bg-gray-900 z-20 border-b border-smart-light/10">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-4 pl-6 w-[200px]">Date & Time</th>
                    <th className="px-4 py-4 w-1/4">Email Attempted</th>
                    <th className="px-4 py-4">Action / Details</th>
                    <th className="px-4 py-4 text-center w-[120px]">Status</th>
                    <th className="px-4 py-4 text-center w-[150px]">IP Address</th>
                  </tr>
                </thead>
              </table>
            </div>

            <div className="overflow-x-auto flex-grow custom-scrollbar">
              <table className="w-full text-left table-fixed border-collapse">
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  <AnimatePresence>
                    {auditLogs.map((log, idx) => (
                      <motion.tr 
                        key={log._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => setSelectedLog(log)}
                        className="hover:bg-smart-light/5 dark:hover:bg-gray-700/50 transition-all duration-200 group cursor-pointer"
                      >
                        <td className="px-4 py-3 pl-6 w-[200px]">
                          <div className="text-[10px] uppercase tracking-widest text-smart-gray dark:text-gray-400 font-bold mb-0.5">
                            {new Date(log.createdAt).toLocaleDateString()}
                          </div>
                          <div className="text-[12px] font-black text-smart-dark dark:text-white">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 w-1/4">
                          <div className="flex items-center">
                            <div className="w-8 h-8 shrink-0 rounded-xl bg-smart-light/10 flex items-center justify-center mr-3 text-smart-light font-black text-[12px] uppercase">
                              {log.email.charAt(0)}
                            </div>
                            <div className="font-black text-smart-dark dark:text-white italic overflow-hidden truncate text-[13px] group-hover:text-smart-light transition-colors">
                              {log.email}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[13px] text-smart-dark dark:text-gray-300 overflow-hidden truncate">
                            {log.action || 'Authentication / System'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center w-[120px]">
                          {log.status === 'success' ? (
                            <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-[10px] font-black px-4 py-1.5 rounded-xl uppercase tracking-widest border border-green-200 dark:border-green-800 inline-block w-[80px] text-center shadow-sm">
                              Success
                            </span>
                          ) : (
                            <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[10px] font-black px-4 py-1.5 rounded-xl uppercase tracking-widest border border-red-200 dark:border-red-800 inline-block w-[80px] text-center shadow-sm">
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center w-[150px]">
                          <div className="inline-block px-3 py-1 bg-smart-bg dark:bg-gray-800 rounded-lg border border-smart-light/10 font-mono text-[10px] text-smart-gray dark:text-gray-400">
                            {log.ipAddress}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {auditLogs.length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No audit logs found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {totalAuditLogPages > 1 && (
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
                <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">Showing {(auditLogPage - 1) * 10 + 1} to {Math.min(auditLogPage * 10, totalAuditLogsCount)} of {totalAuditLogsCount}</span>
                <div className="flex space-x-2 ml-auto sm:ml-0">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setAuditLogPage((p) => Math.max(1, p - 1))} disabled={auditLogPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Prev</motion.button>
                  <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center italic">Page {auditLogPage} of {totalAuditLogPages}</span>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setAuditLogPage((p) => Math.min(totalAuditLogPages, p + 1))} disabled={auditLogPage >= totalAuditLogPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Next</motion.button>
                </div>
              </div>
            )}
          </div>
      </div>

      {/* Log Details Modal */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-[8px]"
            onClick={() => setSelectedLog(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#111827] rounded-[24px] p-0 max-w-2xl w-full shadow-[0_30px_60px_rgba(0,0,0,0.4)] border border-smart-light/10 overflow-hidden relative"
            >
              {/* Header Banner */}
              <div className={`h-2 w-full ${selectedLog.status === 'success' ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}></div>
              
              <button
                onClick={() => setSelectedLog(null)}
                className="absolute top-6 right-6 p-2 text-smart-gray hover:text-smart-dark dark:hover:text-white transition-transform hover:scale-110 hover:rotate-90 bg-smart-bg dark:bg-gray-800 rounded-full z-10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
              
              <div className="p-8">
                <div className="flex items-center mb-8">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mr-5 shadow-lg border ${selectedLog.status === 'success' ? 'bg-green-100 border-green-200 text-green-600 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400' : 'bg-red-100 border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400'}`}>
                    {selectedLog.status === 'success' ? (
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ) : (
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    )}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-smart-dark dark:text-white uppercase tracking-tight leading-none mb-1">Audit Event Record</h3>
                    <p className="text-[11px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-[0.2em]">{new Date(selectedLog.createdAt).toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="bg-smart-bg dark:bg-gray-800/50 p-5 rounded-2xl border border-smart-light/5">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 mb-2">Identity</span>
                    <div className="font-bold text-smart-dark dark:text-white flex items-center">
                      <div className="w-7 h-7 shrink-0 rounded-xl bg-smart-light/10 flex items-center justify-center mr-3 text-smart-light font-black text-[12px] uppercase">
                        {selectedLog.email.charAt(0)}
                      </div>
                      <span className="truncate">{selectedLog.email}</span>
                    </div>
                  </div>
                  
                  <div className="bg-smart-bg dark:bg-gray-800/50 p-5 rounded-2xl border border-smart-light/5">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 mb-2">Network Origin</span>
                    <div className="font-mono text-sm font-semibold text-smart-dark dark:text-gray-300 flex items-center">
                      <svg className="w-4 h-4 mr-2 text-smart-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
                      {selectedLog.ipAddress}
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 mb-2 pl-1">Action Attempted</span>
                  <div className="font-bold text-lg text-smart-dark dark:text-white pl-1 border-l-4 border-smart-light/30 ml-1 pl-4">
                    {selectedLog.action || 'Authentication / System Event'}
                  </div>
                </div>

                {selectedLog.details && (
                  <div className="mt-8">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 mb-2 pl-1 flex items-center">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                      System Payload
                    </span>
                    <div className="bg-[#0d1117] rounded-2xl p-5 border border-gray-800 shadow-inner overflow-x-auto custom-scrollbar relative group">
                      <pre className="text-[13px] text-[#c9d1d9] font-mono whitespace-pre-wrap leading-relaxed">
                        {typeof selectedLog.details === 'object' ? JSON.stringify(selectedLog.details, null, 2) : selectedLog.details}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SecurityTab;
