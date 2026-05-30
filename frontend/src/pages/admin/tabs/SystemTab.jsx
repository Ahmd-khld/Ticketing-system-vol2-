import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';

const SystemTab = () => {
  const { showModal, showConfirm } = useUI();
  const [backups, setBackups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchBackups = async (p = 1) => {
    setIsLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/backups', {
        params: { page: p, limit: 10 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setBackups(res.data.backups || []);
      setTotalPages(res.data.totalPages || 1);
      setPage(res.data.currentPage || 1);
    } catch (err) {
      console.error('Failed to fetch backups', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups(page);
  }, [page]);

  const handleCreateBackup = async () => {
    const isConfirmed = await showConfirm('Trigger a manual database backup now?', 'Backup System');
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      const res = await api.post('/admin/backup', {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal(res.data.message, 'Success', 'success');
      fetchBackups(1);
    } catch (err) {
      showModal(err.response?.data?.message || 'Backup failed', 'Error', 'error');
    }
  };

  const handleDownloadBackup = (filename) => {
    const token = localStorage.getItem('token');
    const url = `${api.defaults.baseURL}/admin/backups/download/${filename}?token=${token}`;
    window.open(url, '_blank');
  };

  const handleRestoreBackup = async (filename) => {
    const isConfirmed = await showConfirm(
      `Are you sure you want to restore this backup snapshot (${filename})? This will overwrite the current database state.`,
      'Activate Snapshot'
    );
    if (!isConfirmed) return;

    setIsLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await api.post(
        `/admin/backups/${filename}/restore`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showModal(res.data.message || 'Database successfully restored.', 'Success', 'success');
      fetchBackups(page);
    } catch (err) {
      console.error('Failed to restore backup', err);
      showModal(err.response?.data?.message || 'Restore failed', 'Error', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden relative min-h-[500px]">
      <AnimatePresence>
        {isLoading && (
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
      <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center">
        <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
          <svg className="w-6 h-6 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path></svg>
          System Disaster Recovery
        </h2>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleCreateBackup} 
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
        >
          Trigger Backup
        </motion.button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left table-fixed border-collapse">
          <thead>
            <tr className="bg-smart-bg/50 dark:bg-gray-900/50 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
              <th className="px-8 py-4 w-1/2">Snapshot Identity</th>
              <th className="px-8 py-4">Created On</th>
              <th className="px-8 py-4 text-right pr-12">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
            <AnimatePresence mode="popLayout">
              {backups.map((backup, idx) => (
                <motion.tr 
                  key={backup._id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.2) }}
                  className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <td className="px-8 py-4 font-mono text-[11px] text-smart-dark dark:text-white truncate italic">{backup.filename}</td>
                  <td className="px-8 py-4 text-[11px] font-bold text-smart-gray dark:text-gray-400">{new Date(backup.createdAt).toLocaleString()}</td>
                  <td className="px-8 py-4 text-right pr-12">
                    <div className="flex items-center justify-end space-x-4">
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        onClick={() => handleRestoreBackup(backup.filename)} 
                        className="text-green-500 hover:text-green-600 text-[10px] font-black uppercase tracking-widest flex items-center"
                      >
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5"></path></svg>
                        Activate
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        onClick={() => handleDownloadBackup(backup.filename)} 
                        className="text-blue-500 hover:text-blue-600 text-[10px] font-black uppercase tracking-widest flex items-center"
                      >
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Download
                      </motion.button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {backups.length === 0 && !isLoading && (
              <tr><td colSpan="3" className="p-12 text-center text-smart-gray font-black uppercase tracking-widest">No system snapshots archived.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-center items-center">
          <div className="flex space-x-2">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Prev</motion.button>
            <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center italic">Page {page} of {totalPages}</span>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Next</motion.button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemTab;
