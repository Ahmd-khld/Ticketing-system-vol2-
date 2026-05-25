import React, { useState, useEffect } from 'react';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';

const SystemTab = () => {
  const { showModal, showConfirm } = useUI();
  const [backups, setBackups] = useState([]);
  const [isBackupsExpanded, setIsBackupsExpanded] = useState(true);
  const [restoringBackupFilename, setRestoringBackupFilename] = useState(null);

  const fetchBackups = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/backups', { headers: { Authorization: `Bearer ${token}` } });
      setBackups(res.data || []);
    } catch (err) {
      console.error('Failed to fetch backups', err);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

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
              {backups.map(backup => (
                <tr key={backup.filename} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-4 py-3 pl-6 font-mono text-[13px] font-bold text-smart-dark dark:text-white">{backup.filename}</td>
                  <td className="px-4 py-3 text-xs text-smart-gray font-medium">{backup.size}</td>
                  <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500">{new Date(backup.createdAt).toLocaleString()}</td>
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
                          <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
                  <td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">
                    No backup files found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SystemTab;
