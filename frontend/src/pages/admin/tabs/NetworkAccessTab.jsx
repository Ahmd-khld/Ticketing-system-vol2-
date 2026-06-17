import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';
import { useTelemetry } from '../../../context/TelemetryContext';

const NetworkAccessTab = ({ isSuperAdmin }) => {
  const { showModal, showConfirm } = useUI();
  const { setUnreadBannedCount } = useTelemetry();

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('whitelist');

  // Whitelist State
  const [whitelistedIPs, setWhitelistedIPs] = useState([]);
  const [totalWhitelistedIPs, setTotalWhitelistedIPs] = useState(0);
  const [newWhitelistIp, setNewWhitelistIp] = useState('');
  const [newWhitelistMac, setNewWhitelistMac] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [whitelistSearchQuery, setWhitelistSearchQuery] = useState('');
  const [whitelistPage, setWhitelistPage] = useState(1);
  const [totalWhitelistPages, setTotalWhitelistPages] = useState(1);
  const [isLoadingWhitelist, setIsLoadingWhitelist] = useState(false);

  // Banned IP State
  const [bannedIPs, setBannedIPs] = useState([]);
  const [bannedIPsPage, setBannedIPsPage] = useState(1);
  const [totalBannedIPsPages, setTotalBannedIPsPages] = useState(1);
  const [totalBannedIPsCount, setTotalBannedIPsCount] = useState(0);
  const [isLoadingBannedIPs, setIsLoadingBannedIPs] = useState(false);
  const [bannedIPsSearchQuery, setBannedIPsSearchQuery] = useState('');

  const fetchWhitelistedIPs = async (page = 1) => {
    setIsLoadingWhitelist(true);
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/whitelisted-ips', {
        params: { page, limit: 10, search: whitelistSearchQuery },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      setWhitelistedIPs(data.ips || []);
      setTotalWhitelistedIPs(data.totalIps || 0);
      setWhitelistPage(data.currentPage || 1);
      setTotalWhitelistPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch whitelist', err);
    } finally {
      setIsLoadingWhitelist(false);
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
    fetchWhitelistedIPs(whitelistPage);
  }, [whitelistPage, whitelistSearchQuery]);

  useEffect(() => {
    fetchBannedIPs(bannedIPsPage);
  }, [bannedIPsPage, bannedIPsSearchQuery]);

  useEffect(() => {
    setUnreadBannedCount(0);
  }, []);

  const handleWhitelistIP = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      await api.post('/admin/whitelisted-ips', { 
        ipAddress: newWhitelistIp, 
        macAddress: newWhitelistMac, 
        description: newWhitelistDesc 
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewWhitelistIp(''); setNewWhitelistMac(''); setNewWhitelistDesc('');
      showModal('IP whitelisted successfully.', 'Success', 'success');
      fetchWhitelistedIPs();
    } catch (err) {
      showModal(err.response?.data?.message || 'Failed to whitelist IP', 'Error', 'error');
    }
  };

  const handleRemoveWhitelistIP = async (id) => {
    const isConfirmed = await showConfirm('Remove this IP from whitelist?', 'Remove IP');
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/whitelisted-ips/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      showModal('IP removed.', 'Success', 'success');
      fetchWhitelistedIPs();
    } catch (err) {
      showModal('Failed to remove IP.', 'Error', 'error');
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

  const handleExportWhitelistedIPsCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/whitelisted-ips', {
        params: { limit: 10000, search: whitelistSearchQuery },
        headers: { Authorization: `Bearer ${token}` },
      });
      const exportData = res.data.ips || [];
      if (exportData.length === 0) return;

      const headers = ['IP Address', 'Description', 'Added On'];
      const csvRows = [headers.join(',')];
      exportData.forEach((ip) => {
        csvRows.push(`"${ip.ipAddress || ''}","${ip.description ? ip.description.replace(/"/g, '""') : ''}","${new Date(ip.createdAt).toLocaleString()}"`);
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smart-park-whitelisted-ips-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      showModal('Failed to export whitelist CSV', 'Error', 'error');
    }
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

  return (
    <div>
      {/* Sub-Tab Navigation Bar */}
      <div className="mb-8 flex justify-center sticky top-4 z-40 px-4">
        <div className="bg-[#161b22] p-1.5 rounded-full shadow-2xl border border-gray-800 flex items-center gap-1">
          {[
            { id: 'whitelist', label: 'Admin IP Whitelist' },
            { id: 'banned', label: 'Banned IP Addresses' }
          ].map(tab => (
            <motion.button
              key={tab.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${
                activeSubTab === tab.id ? 'bg-blue-400 text-smart-dark shadow-lg shadow-blue-400/20 scale-105' : 'bg-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Admin IP Whitelist Panel */}
      {activeSubTab === 'whitelist' && (
        <div 
          className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-500 relative min-h-[500px]"
        >
          <AnimatePresence>
            {isLoadingWhitelist && (
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
              <svg className="w-6 h-6 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              Admin IP Whitelist
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); handleExportWhitelistedIPsCSV(); }} className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20" disabled={totalWhitelistedIPs === 0}>
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </motion.button>
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalWhitelistedIPs} Allowed IPs</span>
            </div>
          </div>
            <div className="p-8">
              <div className="mb-8 p-6 bg-smart-bg dark:bg-gray-900 rounded-3xl border border-smart-light/10">
                <h3 className="text-xs font-black text-smart-dark dark:text-white uppercase tracking-widest mb-4 flex items-center">
                  <svg className="w-4 h-4 mr-2 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  Whitelist New Security Node
                </h3>
                <form onSubmit={handleWhitelistIP} className="flex flex-col md:flex-row items-end gap-4">
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">IP Address</label>
                    <input type="text" placeholder="e.g. 192.168.1.100" value={newWhitelistIp} onChange={e => setNewWhitelistIp(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs transition-all" required />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">MAC Address (Optional)</label>
                    <input type="text" placeholder="e.g. 00:1B:44:11:3A:B7" value={newWhitelistMac} onChange={e => setNewWhitelistMac(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs transition-all" />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Description / Note</label>
                    <input type="text" placeholder="e.g. Head Office Network" value={newWhitelistDesc} onChange={e => setNewWhitelistDesc(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-2 focus:ring-smart-light/50 outline-none font-mono text-xs transition-all" />
                  </div>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className="w-full md:w-auto px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-sm transition-all whitespace-nowrap border border-blue-600">Add to Whitelist</motion.button>
                </form>
              </div>

              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center mb-4 rounded-t-3xl">
                <div className="relative w-full md:max-w-md">
                  <input type="text" placeholder="SEARCH BY IP OR NOTE..." value={whitelistSearchQuery} onChange={e => setWhitelistSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest" />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>

            <div className="bg-smart-bg dark:bg-gray-900 z-20 border-b border-smart-light/10">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                    <th className="px-6 py-4 w-1/4">IP Address</th>
                    <th className="px-6 py-4 w-80">MAC Address</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-4 py-3 w-40">Added On</th>
                    <th className="px-4 py-3 text-right pr-6 w-32">Action</th>
                  </tr>
                </thead>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left table-fixed border-collapse">
                <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                  <AnimatePresence mode="popLayout">
                    {whitelistedIPs.map((ip, idx) => (
                      <motion.tr 
                        key={ip._id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.2) }}
                        className="hover:bg-smart-bg/50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-6 py-4 font-mono text-[13px] font-bold text-smart-dark dark:text-white w-1/4 overflow-hidden truncate">{ip.ipAddress}</td>
                        <td className="px-6 py-4 font-mono text-xs text-smart-gray dark:text-gray-400 font-medium w-80 overflow-hidden truncate">{ip.macAddress || 'N/A'}</td>
                        <td className="px-6 py-4 text-xs text-smart-gray dark:text-gray-400 font-medium overflow-hidden truncate">{ip.description || 'N/A'}</td>
                        <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500 w-40">{new Date(ip.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right pr-6 w-32">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleRemoveWhitelistIP(ip._id)} className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-black uppercase transition-colors border border-red-500/20">Remove</motion.button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {whitelistedIPs.length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No whitelisted nodes found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
              {totalWhitelistPages > 1 && (
                <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center rounded-b-3xl">
                  <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">Showing {(whitelistPage - 1) * 10 + 1} to {Math.min(whitelistPage * 10, totalWhitelistedIPs)} of {totalWhitelistedIPs}</span>
                  <div className="flex space-x-2 ml-auto sm:ml-0">
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setWhitelistPage((p) => Math.max(1, p - 1))} disabled={whitelistPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Prev</motion.button>
                    <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center">Page {whitelistPage} of {totalWhitelistPages}</span>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setWhitelistPage((p) => Math.min(totalWhitelistPages, p + 1))} disabled={whitelistPage >= totalWhitelistPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Next</motion.button>
                  </div>
                </div>
              )}
            </div>
        </div>
      )}

      {/* Banned IP Addresses Panel */}
      {activeSubTab === 'banned' && (
        <div 
          className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 relative min-h-[500px]"
        >
          <AnimatePresence>
            {isLoadingBannedIPs && (
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
              <svg className="w-6 h-6 mr-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              Banned IP Addresses
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); handleExportBannedIPsCSV(); }} className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20" disabled={totalBannedIPsCount === 0}>
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </motion.button>
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalBannedIPsCount} Banned</span>
            </div>
          </div>
            <div className="p-8">
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center mb-4 rounded-t-3xl">
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

              <div className="overflow-x-auto">
                <table className="w-full text-left table-fixed border-collapse">
                  <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                    <AnimatePresence mode="popLayout">
                      {bannedIPs.map((banned, idx) => (
                        <motion.tr 
                          key={banned._id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.2) }}
                          className="hover:bg-smart-bg/50 dark:hover:bg-gray-800/50 transition-colors"
                        >
                          <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white w-1/4 overflow-hidden truncate">{banned.ipAddress}</td>
                          <td className="px-4 py-3 text-xs text-smart-gray dark:text-gray-400 font-medium overflow-hidden truncate">{banned.reason}</td>
                          <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500 w-[180px]">{new Date(banned.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-3 pr-6 text-right w-[120px]">
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleUnbanIP(banned._id)} className="px-4 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-smart-glow rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20">Unban</motion.button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {bannedIPs.length === 0 && (
                      <tr><td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No banned IP addresses found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalBannedIPsPages > 1 && (
                <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center rounded-b-3xl">
                  <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">Showing {(bannedIPsPage - 1) * 10 + 1} to {Math.min(bannedIPsPage * 10, totalBannedIPsCount)} of {totalBannedIPsCount}</span>
                  <div className="flex space-x-2 ml-auto sm:ml-0">
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setBannedIPsPage((p) => Math.max(1, p - 1))} disabled={bannedIPsPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Prev</motion.button>
                    <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center">Page {bannedIPsPage} of {totalBannedIPsPages}</span>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setBannedIPsPage((p) => Math.min(totalBannedIPsPages, p + 1))} disabled={bannedIPsPage >= totalBannedIPsPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Next</motion.button>
                  </div>
                </div>
              )}
            </div>
        </div>
      )}
    </div>
  );
};

export default NetworkAccessTab;
