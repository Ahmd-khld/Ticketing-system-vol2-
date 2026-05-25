import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [isSubAdminsExpanded, setIsSubAdminsExpanded] = useState(true);
  const [isSubAdminProvisioningExpanded, setIsSubAdminProvisioningExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Provisioning State
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminIp, setNewAdminIp] = useState('');
  const [newAdminMac, setNewAdminMac] = useState('');

  // Whitelist State
  const [whitelistedIPs, setWhitelistedIPs] = useState([]);
  const [totalWhitelistedIPs, setTotalWhitelistedIPs] = useState(0);
  const [isWhitelistExpanded, setIsWhitelistExpanded] = useState(true);
  const [newWhitelistIp, setNewWhitelistIp] = useState('');
  const [newWhitelistMac, setNewWhitelistMac] = useState('');
  const [newWhitelistDesc, setNewWhitelistDesc] = useState('');
  const [whitelistSearchQuery, setWhitelistSearchQuery] = useState('');
  const [whitelistPage, setWhitelistPage] = useState(1);
  const [whitelistHasMore, setWhitelistHasMore] = useState(false);
  const [isLoadingWhitelist, setIsLoadingWhitelist] = useState(false);

  const fetchSubAdmins = async () => {
    const token = localStorage.getItem('token');
    try {
      const adminsRes = await api.get('/admin/users', {
        params: { role: 'admin' },
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubAdmins(adminsRes.data.users || []);
    } catch (err) {
      console.error('Failed to fetch sub-admins', err);
    }
  };

  const fetchWhitelistedIPs = async (page = 1, append = false) => {
    setIsLoadingWhitelist(true);
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/whitelisted-ips', {
        params: { page, limit: 10, search: whitelistSearchQuery },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      if (append) setWhitelistedIPs(prev => [...prev, ...data.ips]);
      else setWhitelistedIPs(data.ips || []);
      setTotalWhitelistedIPs(data.totalIps || 0);
      setWhitelistPage(data.currentPage);
      setWhitelistHasMore(data.currentPage < data.totalPages);
    } catch (err) {
      console.error('Failed to fetch whitelist', err);
    } finally {
      setIsLoadingWhitelist(false);
    }
  };

  useEffect(() => {
    fetchSubAdmins();
    fetchWhitelistedIPs();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchWhitelistedIPs(1, false), 500);
    return () => clearTimeout(timer);
  }, [whitelistSearchQuery]);

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

  const handleWhitelistIP = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      await api.post('/admin/whitelisted-ips', { ipAddress: newWhitelistIp, macAddress: newWhitelistMac, description: newWhitelistDesc }, { headers: { Authorization: `Bearer ${token}` } });
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

  const handleExportWhitelistedIPsCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/whitelisted-ips', {
        params: { limit: 10000, search: whitelistSearchQuery },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      const exportData = data.ips || [];
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

  const handleLoadMoreWhitelistIPs = () => fetchWhitelistedIPs(whitelistPage + 1, true);

  return (
    <div className="animate-fade-in-up">
      {/* Sub-Tab Navigation Bar */}
      <div className="mb-8 flex justify-center sticky top-4 z-40 px-4">
        <div className="bg-[#161b22] p-1.5 rounded-full shadow-2xl border border-gray-800 flex items-center gap-1">
          {[
            { id: 'sub-admins', label: 'Sub-Admins' },
            { id: 'provisioning', label: 'Provisioning' },
            { id: 'whitelist', label: 'IP Whitelist' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-6 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${
                activeSubTab === tab.id ? 'bg-emerald-400 text-smart-dark shadow-lg shadow-emerald-400/20 scale-105' : 'bg-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-Admin Accounts Panel */}
      {activeSubTab === 'sub-admins' && (
        <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-500 animate-in fade-in zoom-in-95">
          <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-default hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors" onClick={() => setIsSubAdminsExpanded(!isSubAdminsExpanded)}>
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              Sub-Admin Accounts
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{subAdmins.length} Admins</span>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isSubAdminsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          
          {isSubAdminsExpanded && (
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

              <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-4 py-3 pl-6">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3 text-center">Security Status</th>
                      <th className="px-4 py-3 pr-6 text-right">Access Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                    {filteredSubAdmins.map((admin) => (
                      <tr key={admin._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 pl-6 font-black text-smart-dark dark:text-white italic capitalize">
                          {admin.name}
                          {admin.email === superAdminEmail && <span className="ml-3 text-[9px] bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded-full uppercase tracking-widest not-italic">System Owner</span>}
                        </td>
                        <td className="px-4 py-3 text-smart-gray dark:text-gray-400 font-medium">{admin.email}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center space-y-1">
                            {admin.isRestricted ? (
                              <button onClick={() => showModal(admin.restrictionReason || 'No reason provided', 'Restriction Details', 'warning')} className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-orange-200 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors">Restricted</button>
                            ) : (
                              <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-smart-light/20">Active</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 pr-6 text-right space-x-2">
                          {admin.email !== superAdminEmail ? (
                            <>
                              <button onClick={() => navigate(`/admin/users/${admin._id}/tickets`, { state: { userName: admin.name, fromTab: 'access' } })} className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm">View Tickets</button>
                              <button onClick={() => handleRestrictUser(admin._id, admin.isRestricted)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${admin.isRestricted ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-200 dark:border-orange-800 shadow-sm'}`}>{admin.isRestricted ? 'Unrestrict' : 'Restrict'}</button>
                              <button onClick={() => handleDeleteUser(admin._id)} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 shadow-sm">Delete</button>
                            </>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-500 mr-2">Protected</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredSubAdmins.length === 0 && (
                      <tr><td colSpan="4" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No administrative accounts found matching your criteria.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Sub-Admin Provisioning Panel */}
      {activeSubTab === 'provisioning' && (
        <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-500 animate-in fade-in zoom-in-95">
          <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-default hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors" onClick={() => setIsSubAdminProvisioningExpanded(!isSubAdminProvisioningExpanded)}>
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              Provision Sub-Admin
            </h2>
            <svg className={`w-6 h-6 transform transition-transform duration-300 ${isSubAdminProvisioningExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
          {isSubAdminProvisioningExpanded && (
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
                  <button type="submit" className="px-8 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg transition-all transform hover:-translate-y-0.5 active:scale-95">Provision Sub-Admin</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Admin IP Whitelist Panel */}
      {activeSubTab === 'whitelist' && (
        <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-500 animate-in fade-in zoom-in-95">
          <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-default hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors" onClick={() => setIsWhitelistExpanded(!isWhitelistExpanded)}>
            <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
              <svg className="w-6 h-6 mr-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              Admin IP Whitelist
            </h2>
            <div className="flex items-center text-smart-gray dark:text-gray-400">
              <button onClick={(e) => { e.stopPropagation(); handleExportWhitelistedIPsCSV(); }} className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20" disabled={totalWhitelistedIPs === 0}>
                <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export CSV
              </button>
              <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalWhitelistedIPs} Allowed IPs</span>
              <svg className={`w-6 h-6 transform transition-transform duration-300 ${isWhitelistExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
          {isWhitelistExpanded && (
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
                  <button type="submit" className="w-full md:w-auto px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-sm transition-all whitespace-nowrap border border-blue-600 active:scale-95">Add to Whitelist</button>
                </form>
              </div>

              <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center mb-4 rounded-t-3xl">
                <div className="relative w-full md:max-w-md">
                  <input type="text" placeholder="SEARCH BY IP OR NOTE..." value={whitelistSearchQuery} onChange={e => setWhitelistSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest" />
                  <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[400px] rounded-b-3xl border border-smart-light/10 custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
                    <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-6 py-4">IP Address</th>
                      <th className="px-6 py-4">MAC Address</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-4 py-3">Added On</th>
                      <th className="px-4 py-3 text-right pr-6">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                    {whitelistedIPs.map(ip => (
                      <tr key={ip._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-6 py-4 font-mono text-[13px] font-bold text-smart-dark dark:text-white">{ip.ipAddress}</td>
                        <td className="px-6 py-4 font-mono text-xs text-smart-gray dark:text-gray-400 font-medium">{ip.macAddress || 'N/A'}</td>
                        <td className="px-6 py-4 text-xs text-smart-gray dark:text-gray-400 font-medium">{ip.description || 'N/A'}</td>
                        <td className="px-4 py-3 text-[11px] font-bold text-smart-gray dark:text-gray-500">{new Date(ip.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right pr-6">
                          <button onClick={() => handleRemoveWhitelistIP(ip._id)} className="px-4 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-[10px] font-black uppercase transition-colors border border-red-500/20">Remove</button>
                        </td>
                      </tr>
                    ))}
                    {whitelistedIPs.length === 0 && (
                      <tr><td colSpan="5" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No whitelisted nodes found.</td></tr>
                    )}
                  </tbody>
                </table>
                {whitelistHasMore && (
                  <div className="p-4 bg-smart-bg/30 flex justify-center border-t border-smart-light/10">
                    <button onClick={handleLoadMoreWhitelistIPs} className="px-6 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest border border-smart-light/20 hover:bg-smart-light/10 transition-colors">Load More IPs</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AccessControlTab;
