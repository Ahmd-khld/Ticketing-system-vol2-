import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';

const AccessControlTab = ({ isSuperAdmin }) => {
  const navigate = useNavigate();
  const { showModal, showConfirm, showPrompt } = useUI();
  const superAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('sub-admins');

  // Sub-Admin State
  const [subAdmins, setSubAdmins] = useState([]);
  const [subAdminPage, setSubAdminPage] = useState(1);
  const [totalSubAdminPages, setTotalSubAdminPages] = useState(1);
  const [totalSubAdminsCount, setTotalSubAdminsCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Provisioning State
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminIp, setNewAdminIp] = useState('');
  const [newAdminMac, setNewAdminMac] = useState('');

  const fetchSubAdmins = async (page = 1) => {
    const token = localStorage.getItem('token');
    try {
      const adminsRes = await api.get('/admin/admins', {
        params: { page, limit: 10, search: searchQuery, status: filterStatus !== 'ALL' ? filterStatus : undefined },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = adminsRes.data;
      setSubAdmins(data.users || []);
      setTotalSubAdminPages(data.totalPages || 1);
      setTotalSubAdminsCount(data.totalUsers || 0);
      setSubAdminPage(data.currentPage || 1);
    } catch (err) {
      console.error('Failed to fetch sub-admins', err);
    }
  };

  useEffect(() => {
    fetchSubAdmins(subAdminPage);
  }, [subAdminPage, searchQuery, filterStatus]);

  const handleCreateSubAdmin = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      await api.post('/admin/sub-admin', {
        name: newAdminName,
        email: newAdminEmail,
        password: newAdminPassword,
        ipAddress: newAdminIp,
        macAddress: newAdminMac,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setNewAdminName(''); setNewAdminEmail(''); setNewAdminPassword(''); setNewAdminIp(''); setNewAdminMac('');
      showModal('Sub-Admin provisioned successfully.', 'Success', 'success');
      fetchSubAdmins();
      setActiveSubTab('sub-admins');
    } catch (err) {
      showModal(err.response?.data?.message || 'Failed to create sub-admin', 'Error', 'error');
    }
  };

  const handleRestrictUser = async (userId, currentlyRestricted) => {
    const action = currentlyRestricted ? 'unrestrict' : 'restrict';
    let restrictionReason = '';

    if (currentlyRestricted) {
      const isConfirmed = await showConfirm(
        'Are you sure you want to unrestrict this admin account? They will regain full administrative access.',
        'Unrestrict Admin'
      );
      if (!isConfirmed) return;
    } else {
      restrictionReason = await showPrompt(
        'Please provide a formal reason for restricting this administrator. This action will be logged in the security audit.',
        'Restrict Admin',
        'Security policy violation'
      );
      if (restrictionReason === null) return;
    }

    const token = localStorage.getItem('token');
    try {
      await api.patch(`/admin/users/${userId}/restrict`, { isRestricted: !currentlyRestricted, restrictionReason }, { headers: { Authorization: `Bearer ${token}` } });
      showModal(`Administrator ${currentlyRestricted ? 'unrestricted' : 'restricted'} successfully.`, 'Success', 'success');
      fetchSubAdmins();
    } catch (err) {
      console.error(`Failed to ${action} admin`, err);
      showModal(err.response?.data?.message || `Failed to ${action} administrator.`, 'Error', 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    const isConfirmed = await showConfirm('Delete this sub-admin permanently?', 'Delete Admin');
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      showModal('Admin deleted.', 'Success', 'success');
      fetchSubAdmins();
    } catch (err) {
      showModal('Failed to delete admin.', 'Error', 'error');
    }
  };

  const handleForceLogoutAnd2FA = async (userId, adminName) => {
    const isConfirmed = await showConfirm(
      `This will immediately terminate ${adminName}'s session and mandate 2FA on their next login. Continue?`,
      'Emergency Security Reset'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.patch(`/admin/users/${userId}/force-logout-2fa`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showModal(`Session terminated for ${adminName}.`, 'Success', 'success');
      fetchSubAdmins();
    } catch (err) {
      showModal(err.response?.data?.message || 'Failed to trigger reset', 'Error', 'error');
    }
  };

  const filteredSubAdmins = useMemo(() => {
    return subAdmins.filter((admin) => {
      const matchesSearch =
        admin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        admin.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus =
        filterStatus === 'ALL' ||
        (filterStatus === 'ACTIVE' && !admin.isRestricted) ||
        (filterStatus === 'RESTRICTED' && admin.isRestricted);
      
      return matchesSearch && matchesStatus;
    });
  }, [subAdmins, searchQuery, filterStatus]);

  return (
    <div>
      {/* Sub-Tab Navigation Bar */}
      <div className="mb-8 flex justify-center sticky top-4 z-40 px-4">
        <div className="bg-[#161b22] p-1.5 rounded-full shadow-2xl border border-gray-800 flex items-center gap-1">
          {[
            { id: 'sub-admins', label: 'Sub-Admins' },
            { id: 'provisioning', label: 'Provisioning' }
          ].map(tab => (
            <motion.button
              key={tab.id}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${
                activeSubTab === tab.id ? 'bg-emerald-400 text-smart-dark shadow-lg shadow-emerald-400/20 scale-105' : 'bg-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Sub-Admin Accounts Panel */}
      {activeSubTab === 'sub-admins' && (
        <div 
          className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden"
        >
          <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-default">
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              Sub-Admin Accounts
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{subAdmins.length} Admins</span>
            </div>
          </div>
          
            <>
              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:max-w-md">
                  <input type="text" placeholder="SEARCH BY NAME OR EMAIL..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest" />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <div className="w-full md:w-auto">
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full md:w-auto px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest cursor-pointer">
                    <option value="ALL">ALL STATUSES</option>
                    <option value="ACTIVE">ACTIVE ADMINS</option>
                    <option value="RESTRICTED">RESTRICTED ADMINS</option>
                  </select>
                </div>
              </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left table-fixed border-collapse min-w-[1000px]">
              <thead className="bg-smart-bg dark:bg-gray-900 z-20 border-b border-smart-light/10 sticky top-0 shadow-sm">
                <tr className="text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-4 py-4 pl-6 w-1/4">Name</th>
                  <th className="px-4 py-4 w-1/4">Email</th>
                  <th className="px-4 py-4 text-center w-[150px]">Security Status</th>
                  <th className="px-4 py-4 pr-6 text-right">Access Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                <AnimatePresence>
                  {filteredSubAdmins.map((admin, idx) => (
                    <motion.tr 
                      key={admin._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <td className="px-4 py-3 pl-6 font-black text-smart-dark dark:text-white italic capitalize w-1/4">
                        <div className="flex items-center min-w-0">
                          <span className="truncate">{admin.name}</span>
                          {admin.email === superAdminEmail && <span className="ml-3 text-[9px] bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded-full uppercase tracking-widest not-italic flex-shrink-0">System Owner</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-smart-gray dark:text-gray-400 font-medium w-1/4 overflow-hidden truncate">{admin.email}</td>
                      <td className="px-4 py-3 text-center w-[150px]">
                        <div className="flex flex-col items-center space-y-1">
                          {admin.isRestricted ? (
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => showModal(admin.restrictionReason || 'No reason provided', 'Restriction Details', 'warning')} className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-orange-200 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors">Restricted</motion.button>
                          ) : (
                            <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-smart-light/20">Active</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 pr-6 text-right space-x-2">
                        {admin.email !== superAdminEmail ? (
                          <div className="flex items-center justify-end gap-2">
                            <motion.button 
                              whileHover={{ scale: 1.05 }} 
                              whileTap={{ scale: 0.95 }} 
                              onClick={() => navigate(`/admin/users/${admin._id}/tickets`, { state: { userName: admin.name, fromTab: 'access' } })} 
                              className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                            >
                              View
                            </motion.button>

                            <motion.button 
                              whileHover={{ scale: 1.05 }} 
                              whileTap={{ scale: 0.95 }} 
                              onClick={() => handleForceLogoutAnd2FA(admin._id, admin.name)} 
                              className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-600 hover:text-white border border-amber-200 dark:border-amber-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                            >
                              2FA
                            </motion.button>

                            <motion.button 
                              whileHover={{ scale: 1.05 }} 
                              whileTap={{ scale: 0.95 }} 
                              onClick={() => handleRestrictUser(admin._id, admin.isRestricted)} 
                              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all w-[105px] text-center flex-shrink-0 ${admin.isRestricted ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-200 dark:border-orange-800 shadow-sm'}`}
                            >
                              {admin.isRestricted ? 'Unrestrict' : 'Restrict'}
                            </motion.button>

                            <motion.button 
                              whileHover={{ scale: 1.05 }} 
                              whileTap={{ scale: 0.95 }} 
                              onClick={() => handleDeleteUser(admin._id)} 
                              className="p-2.5 rounded-xl transition-all bg-red-500/10 hover:bg-red-600 hover:text-white text-red-500 border border-red-500/20 shadow-sm" 
                              title="Delete Account"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </motion.button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 mr-2">Protected</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
                {filteredSubAdmins.length === 0 && (
                  <tr><td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No administrative accounts found matching your criteria.</td></tr>
                )}
              </tbody>
            </table>
          </div>

                {totalSubAdminPages > 1 && (
                  <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">Showing {(subAdminPage - 1) * 10 + 1} to {Math.min(subAdminPage * 10, totalSubAdminsCount)} of {totalSubAdminsCount}</span>
                    <div className="flex space-x-2 ml-auto sm:ml-0">
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setSubAdminPage((p) => Math.max(1, p - 1))} disabled={subAdminPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Prev</motion.button>
                      <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center italic">Page {subAdminPage} of {totalSubAdminPages}</span>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setSubAdminPage((p) => Math.min(totalSubAdminPages, p + 1))} disabled={subAdminPage >= totalSubAdminPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Next</motion.button>
                    </div>
                  </div>
                )}
              </>
        </div>
      )}

      {/* Sub-Admin Provisioning Panel */}
      {activeSubTab === 'provisioning' && (
        <div 
          className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-500"
        >
          <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-default">
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              Provision Sub-Admin
            </h2>
          </div>
            <div className="p-8">
              <form onSubmit={handleCreateSubAdmin} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Full Name</label>
                    <input type="text" placeholder="Admin Name" value={newAdminName} onChange={e => setNewAdminName(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white outline-none focus:ring-2 focus:ring-smart-light/50 transition-all" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Email Address</label>
                    <input type="email" placeholder="admin@smartpark.com" value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white outline-none focus:ring-2 focus:ring-smart-light/50 transition-all" required />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Password</label>
                    <input type="password" placeholder="••••••••" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white outline-none focus:ring-2 focus:ring-smart-light/50 transition-all" required />
                  </div>
                </div>
                <div className="p-6 bg-smart-bg dark:bg-gray-900 rounded-3xl border border-smart-light/10">
                  <h3 className="text-xs font-black text-smart-dark dark:text-white uppercase tracking-widest mb-4 flex items-center">
                    <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    Network Binding (Required)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Bound IP Address</label>
                      <input type="text" placeholder="e.g. 192.168.1.50" value={newAdminIp} onChange={e => setNewAdminIp(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white outline-none font-mono text-sm focus:ring-2 focus:ring-smart-light/50 transition-all" required />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-2">Bound MAC Address (Optional)</label>
                      <input type="text" placeholder="e.g. 00:1B:44:11:3A:B7" value={newAdminMac} onChange={e => setNewAdminMac(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white outline-none font-mono text-sm focus:ring-2 focus:ring-smart-light/50 transition-all" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" className="px-8 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg transition-all transform hover:-translate-y-0.5">Provision Sub-Admin</motion.button>
                </div>
              </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default AccessControlTab;
