import React, { useState, useEffect } from 'react';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';

const SystemTab = () => {
  const { showModal, showConfirm } = useUI();
  const [backups, setBackups] = useState([]);
  const [isBackupsExpanded, setIsBackupsExpanded] = useState(true);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState(null);
  const [backupPage, setBackupPage] = useState(1);
  const [totalBackupPages, setTotalBackupPages] = useState(1);
  const [totalBackupsCount, setTotalBackupsCount] = useState(0);

  const fetchBackups = async (page = 1) => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/backups', { 
        params: { page, limit: 10 },
        headers: { Authorization: `Bearer ${token}` } 
      });
      const data = res.data;
      setBackups(data.backups || []);
      setTotalBackupsCount(data.totalBackups || 0);
      setTotalBackupPages(data.totalPages || 1);
      setBackupPage(data.currentPage || 1);
    } catch (err) {
      console.error('Failed to fetch backups', err);
    }
  };

  useEffect(() => {
    fetchBackups(backupPage);
  }, [backupPage]);

  const handleDownloadBackup = async (filename) => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get(`/admin/backups/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      showModal('Failed to download backup.', 'Error', 'error');
    }
  };

  const handleRestoreBackup = async (filename) => {
    const isConfirmed = await showConfirm(`Are you sure you want to restore the database from ${filename}? Current data will be overwritten.`, 'Restore Database');
    if (!isConfirmed) return;

    setRestoringBackupFilename(filename);
    const token = localStorage.getItem('token');
    try {
      await api.post(`/admin/backups/${filename}/restore`, {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal('Database restored successfully. The page will now reload.', 'Success', 'success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      showModal(err.response?.data?.message || 'Restore failed.', 'Error', 'error');
      setRestoringBackupFilename(null);
    }
  };

  const handleDeleteBackup = async (filename) => {
    const isConfirmed = await showConfirm(`Delete backup file ${filename} permanently?`, 'Delete Backup');
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/backups/${filename}`, { headers: { Authorization: `Bearer ${token}` } });
      showModal('Backup deleted.', 'Success', 'success');
      fetchBackups();
    } catch (err) {
      showModal('Delete failed.', 'Error', 'error');
    }
  };

  return (
    <div className={`mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300 ${isBackupsExpanded ? 'h-auto max-h-[800px] flex flex-col' : ''}`}>
      <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors" onClick={() => setIsBackupsExpanded(!isBackupsExpanded)}>
        <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
          <svg className="w-6 h-6 mr-3 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
          Database Backups
        </h2>
        <div className="flex items-center text-smart-gray dark:text-gray-400">
          <span className="text-xs font-bold mr-4 uppercase tracking-widest">{backups.length} Files</span>
          <svg className={`w-6 h-6 transform transition-transform duration-300 ${isBackupsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
      </div>

      {isBackupsExpanded && (
        <div className="flex flex-col h-full">
          <div className="bg-smart-bg dark:bg-gray-900 z-20 border-b border-smart-light/10">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-4 py-4 pl-6 w-1/2">Filename</th>
                  <th className="px-4 py-4 w-32">Size</th>
                  <th className="px-4 py-4 w-48">Created On</th>
                  <th className="px-4 py-4 text-right pr-6 w-[320px]">Actions</th>
                </tr>
              </thead>
            </table>
          </div>

          <div className="overflow-x-auto flex-grow custom-scrollbar">
            <table className="w-full text-left table-fixed border-collapse">
              <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                {backups.map(backup => (
                  <tr key={backup.filename} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white w-1/2 overflow-hidden truncate">{backup.filename}</td>
                    <td className="px-4 py-3 text-xs text-smart-gray font-medium w-32">{backup.size}</td>
                    <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500 w-48">{new Date(backup.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 pr-6 text-right w-[320px]">
                      <div className="flex justify-end items-center space-x-2">
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
                          {restoringBackupFilename === backup.filename ? 'Restoring...' : 'Restore'}
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup.filename)}
                          className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-red-500/20"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!backups || backups.length === 0) && (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">
                      No backup files found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalBackupPages > 1 && (
        <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
          <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">Showing {(backupPage - 1) * 10 + 1} to {Math.min(backupPage * 10, totalBackupsCount)} of {totalBackupsCount}</span>
          <div className="flex space-x-2 ml-auto sm:ml-0">
            <button onClick={() => setBackupPage((p) => Math.max(1, p - 1))} disabled={backupPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Prev</button>
            <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center">Page {backupPage} of {totalBackupPages}</span>
            <button onClick={() => setBackupPage((p) => Math.min(totalBackupPages, p + 1))} disabled={backupPage >= totalBackupPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Next</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemTab;
