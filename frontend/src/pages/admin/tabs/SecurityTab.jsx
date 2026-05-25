import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';
import { useTelemetry } from '../../../context/TelemetryContext';

const SecurityTab = () => {
  const { showModal, showConfirm } = useUI();
  const { setUnreadAuditCount, setUnreadBannedCount } = useTelemetry();

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogPage, setAuditLogPage] = useState(1);
  const [totalAuditLogPages, setTotalAuditLogPages] = useState(1);
  const [totalAuditLogsCount, setTotalAuditLogsCount] = useState(0);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [isAuditLogsExpanded, setIsAuditLogsExpanded] = useState(true);

  // Banned IP State
  const [bannedIPs, setBannedIPs] = useState([]);
  const [bannedIPsPage, setBannedIPsPage] = useState(1);
  const [totalBannedIPsPages, setTotalBannedIPsPages] = useState(1);
  const [totalBannedIPsCount, setTotalBannedIPsCount] = useState(0);
  const [isLoadingBannedIPs, setIsLoadingBannedIPs] = useState(false);
  const [isBannedIPsExpanded, setIsBannedIPsExpanded] = useState(true);
  const [bannedIPsSearchQuery, setBannedIPsSearchQuery] = useState('');

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

  const fetchBannedIPs = async (page = 1) => {
    setIsLoadingBannedIPs(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/banned-ips', {
        params: { page, limit: 10, search: bannedIPsSearchQuery },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data;
      setBannedIPs(data.bannedIPs || []);
      setTotalBannedIPsCount(data.totalBannedIPs || 0);
      setBannedIPsPage(data.currentPage || 1);
      setTotalBannedIPsPages(data.totalPages || 1);
    } catch (error) {
      console.error('Failed to load banned IPs', error);
    } finally {
      setIsLoadingBannedIPs(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs(auditLogPage);
  }, [auditLogPage]);

  useEffect(() => {
    fetchBannedIPs(bannedIPsPage);
  }, [bannedIPsPage, bannedIPsSearchQuery]);

  useEffect(() => {
    setUnreadAuditCount(0);
    setUnreadBannedCount(0);
  }, []);

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

  const handleExportBannedIPsCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/banned-ips', {
        params: { limit: 10000, search: bannedIPsSearchQuery },
        headers: { Authorization: `Bearer ${token}` },
      });
      const exportData = res.data.bannedIPs || [];
      if (exportData.length === 0) return;
      const headers = ['IP Address', 'Reason', 'Date Banned'];
      const csvRows = [headers.join(',')];
      exportData.forEach((b) => {
        csvRows.push(`"${b.ipAddress}","${b.reason}","${new Date(b.createdAt).toLocaleString()}"`);
      });
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smart-park-banned-ips-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      showModal('Export failed.', 'Error', 'error');
    }
  };

  const handleUnbanIP = async (id) => {
    if (!(await showConfirm('Unban this IP address?', 'Unban IP'))) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/banned-ips/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      showModal('IP unbanned successfully.', 'Success', 'success');
      fetchBannedIPs(bannedIPsPage);
    } catch (err) {
      showModal('Failed to unban IP.', 'Error', 'error');
    }
  };

  return (
    <div>
      {/* Security Audit Logs Panel */}
      <div id="audit-logs-panel" className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 relative ${isAuditLogsExpanded ? 'h-auto max-h-[800px] flex flex-col min-h-[500px]' : ''}`}>
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
        <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors" onClick={() => setIsAuditLogsExpanded(!isAuditLogsExpanded)}>
          <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
            <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            Security Audit Logs
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
            <motion.svg animate={{ rotate: isAuditLogsExpanded ? 180 : 0 }} className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </motion.svg>
          </div>
        </div>
        {isAuditLogsExpanded && (
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
                  {auditLogs.map(log => (
                    <tr key={log._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 pl-6 text-[11px] font-bold text-smart-gray dark:text-gray-400 w-[200px]">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-black text-smart-dark dark:text-white italic w-1/4 overflow-hidden truncate">{log.email}</td>
                      <td className="px-4 py-3 font-medium text-smart-dark dark:text-gray-300 overflow-hidden truncate">{log.action || 'Authentication / System'}</td>
                      <td className="px-4 py-3 text-center w-[120px]">
                        {log.status === 'success' ? (
                          <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-green-200 dark:border-green-800 inline-block w-[80px] text-center">
                            Success
                          </span>
                        ) : (
                          <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-red-200 dark:border-red-800 inline-block w-[80px] text-center">
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-[10px] text-smart-gray dark:text-gray-500 w-[150px]">{log.ipAddress}</td>
                    </tr>
                  ))}
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
        )}
      </div>

      {/* Banned IP Addresses Panel */}
      <div id="banned-ips-panel" className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isBannedIPsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}>
        <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors" onClick={() => setIsBannedIPsExpanded(!isBannedIPsExpanded)}>
          <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
            <svg className="w-6 h-6 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            Banned IP Addresses
          </h2>
          <div className="flex items-center text-smart-gray dark:text-gray-400">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); handleExportBannedIPsCSV(); }} className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20" disabled={totalBannedIPsCount === 0}>
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Export CSV
            </motion.button>
            <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalBannedIPsCount} Banned</span>
            <motion.svg animate={{ rotate: isBannedIPsExpanded ? 180 : 0 }} className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </motion.svg>
          </div>
        </div>
        {isBannedIPsExpanded && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="relative w-full md:max-w-md">
                <input type="text" placeholder="SEARCH BY IP OR REASON..." value={bannedIPsSearchQuery} onChange={(e) => { setBannedIPsSearchQuery(e.target.value); setBannedIPsPage(1); }} className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest" />
                <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>

            <div className="bg-smart-bg dark:bg-gray-900 z-20 border-b border-smart-light/10">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-4 py-4 pl-6 w-1/4">IP Address</th>
                    <th className="px-4 py-4">Reason</th>
                    <th className="px-4 py-4 w-[180px]">Date Banned</th>
                    <th className="px-4 py-4 text-right pr-6 w-[120px]">Action</th>
                  </tr>
                </thead>
              </table>
            </div>

            <div className="overflow-y-auto overflow-x-auto flex-grow custom-scrollbar max-h-[400px]">
              <table className="w-full text-left table-fixed border-collapse">
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  {bannedIPs.map(banned => (
                    <tr key={banned._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white w-1/4 overflow-hidden truncate">{banned.ipAddress}</td>
                      <td className="px-4 py-3 text-xs text-smart-gray dark:text-gray-400 font-medium overflow-hidden truncate">{banned.reason}</td>
                      <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500 w-[180px]">{new Date(banned.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 pr-6 text-right w-[120px]">
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleUnbanIP(banned._id)} className="px-4 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-smart-glow rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20">Unban</motion.button>
                      </td>
                    </tr>
                  ))}
                  {bannedIPs.length === 0 && (
                    <tr><td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No banned IP addresses found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalBannedIPsPages > 1 && (
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
                <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">Showing {(bannedIPsPage - 1) * 10 + 1} to {Math.min(bannedIPsPage * 10, totalBannedIPsCount)} of {totalBannedIPsCount}</span>
                <div className="flex space-x-2 ml-auto sm:ml-0">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setBannedIPsPage((p) => Math.max(1, p - 1))} disabled={bannedIPsPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Prev</motion.button>
                  <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center italic">Page {bannedIPsPage} of {totalBannedIPsPages}</span>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setBannedIPsPage((p) => Math.min(totalBannedIPsPages, p + 1))} disabled={bannedIPsPage >= totalBannedIPsPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Next</motion.button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityTab;
