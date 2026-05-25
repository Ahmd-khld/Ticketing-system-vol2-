import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';

const UsersTab = ({ isSuperAdmin }) => {
  const navigate = useNavigate();
  const { showModal, showConfirm, showPrompt } = useUI();
  const [regularUsers, setRegularUsers] = useState([]);
  const [totalUserPages, setTotalUserPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [isUserManagementExpanded, setIsUserManagementExpanded] = useState(true);

  const fetchUsers = async (page = 1) => {
    const token = localStorage.getItem('token');
    try {
      const usersRes = await api.get('/admin/users', {
        params: { role: 'user', page, limit: 10 },
        headers: { Authorization: `Bearer ${token}` },
      });
      setRegularUsers(usersRes.data.users || []);
      setTotalUserPages(usersRes.data.totalPages || 1);
      setTotalUsersCount(usersRes.data.totalUsers || 0);
      setUserPage(page);
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  };

  useEffect(() => {
    fetchUsers(userPage);
  }, [userPage]);

  const filteredUsers = useMemo(() => {
    return regularUsers.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus =
        filterStatus === 'ALL' ||
        (filterStatus === 'ACTIVE' && !user.isRestricted) ||
        (filterStatus === 'RESTRICTED' && user.isRestricted);
      
      return matchesSearch && matchesStatus;
    });
  }, [regularUsers, searchQuery, filterStatus]);

  const handleRestrictUser = async (userId, currentlyRestricted) => {
    const action = currentlyRestricted ? 'unrestrict' : 'restrict';
    let restrictionReason = '';

    if (currentlyRestricted) {
      const isConfirmed = await showConfirm(
        'Are you sure you want to unrestrict this user? They will regain full access to the platform.',
        'Unrestrict User'
      );
      if (!isConfirmed) return;
    } else {
      restrictionReason = await showPrompt(
        'Please provide a formal reason for restricting this user account. This will be visible to the user.',
        'Restrict User',
        'Violating platform terms and conditions'
      );
      if (restrictionReason === null) return; // User cancelled
    }

    const token = localStorage.getItem('token');
    try {
      await api.patch(
        `/admin/users/${userId}/restrict`,
        { isRestricted: !currentlyRestricted, restrictionReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showModal(`User ${currentlyRestricted ? 'unrestricted' : 'restricted'} successfully.`, 'Success', 'success');
      fetchUsers(userPage);
    } catch (error) {
      console.error(`Failed to ${action} user`, error);
      showModal(error.response?.data?.message || `Failed to ${action} user`, 'Error', 'error');
    }
  };

  const handleDeleteUser = async (userId) => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to permanently delete this user? This action cannot be undone.',
      'Delete User'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.delete(`/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showModal('User deleted successfully.', 'Success', 'success');
      fetchUsers(userPage);
    } catch (error) {
      console.error('Failed to delete user', error);
      showModal(error.response?.data?.message || 'Failed to delete user', 'Error', 'error');
    }
  };

  const handleExportUsersCSV = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await api.get('/admin/users', {
        params: {
          role: 'user',
          limit: 10000,
          ...(searchQuery ? { search: searchQuery } : {}),
          ...(filterStatus !== 'ALL' ? { status: filterStatus } : {}),
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      const exportData = data.users || [];
      if (exportData.length === 0) return;

      const headers = ['Name', 'Email', 'Phone', 'Age', 'Role', 'Status', 'Has Disability'];
      const csvRows = [headers.join(',')];

      exportData.forEach((user) => {
        const row = [
          `"${(user.name || '').replace(/"/g, '""')}"`,
          `"${(user.email || '').replace(/"/g, '""')}"`,
          `"${(user.phone || 'N/A').replace(/"/g, '""')}"`,
          `"${user.age || 'N/A'}"`,
          `"${user.role || 'user'}"`,
          `"${user.isRestricted ? 'Restricted' : 'Active'}"`,
          `"${user.hasDisability ? 'Yes' : 'No'}"`,
        ];
        csvRows.push(row.join(','));
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smart-park-users-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export error:', err);
      showModal('Failed to export users CSV', 'Error', 'error');
    }
  };

  return (
    <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300">
      <div
        className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center cursor-pointer hover:bg-smart-bg/80 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setIsUserManagementExpanded(!isUserManagementExpanded)}
      >
        <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
          <svg className="w-6 h-6 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
          </svg>
          User Management
        </h2>
        <div className="flex items-center text-smart-gray dark:text-gray-400">
          <button
            onClick={(e) => { e.stopPropagation(); handleExportUsersCSV(); }}
            className="hidden sm:flex items-center mr-4 px-3 py-1.5 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors border border-smart-light/20"
            disabled={totalUsersCount === 0}
          >
            <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            Export CSV
          </button>
          <span className="text-xs font-bold mr-4 uppercase tracking-widest">{totalUsersCount} Total Users</span>
          <svg className={`w-6 h-6 transform transition-transform duration-300 ${isUserManagementExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </div>
      </div>

      {isUserManagementExpanded && (
        <>
          <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:max-w-md">
              <input
                type="text"
                placeholder="SEARCH BY NAME OR EMAIL..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest"
              />
              <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-smart-light/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
            <div className="w-full md:w-auto">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full md:w-auto px-5 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest cursor-pointer"
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="ACTIVE">ACTIVE USERS</option>
                <option value="RESTRICTED">RESTRICTED USERS</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-smart-bg dark:bg-gray-900 border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-4 py-3 pl-6">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-center">Tickets</th>
                  <th className="px-4 py-3 text-center">Security Status</th>
                  <th className="px-4 py-3 pr-6 text-right">Access Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
                {Array.isArray(filteredUsers) && filteredUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 pl-6 font-black text-smart-dark dark:text-white italic capitalize">{user.name}</td>
                    <td className="px-4 py-3 text-smart-gray dark:text-gray-400 font-medium">{user.email}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-3 py-1 bg-blue-500/10 text-blue-500 rounded-full font-black text-[11px] border border-blue-500/20">{user.ticketCount || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center space-y-1">
                        {user.isRestricted ? (
                          <button onClick={() => showModal(user.restrictionReason || 'No reason provided', 'Restriction Details', 'warning')} className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-orange-200 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors">Restricted</button>
                        ) : (
                          <span className="bg-smart-light/10 dark:bg-smart-light/20 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest border border-smart-light/20">Active</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 pr-6 text-right">
                      <div className="flex justify-end items-center space-x-2">
                        <button onClick={() => navigate(`/admin/users/${user._id}/tickets`)} className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-200 dark:border-blue-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm">View Tickets</button>
                        <button onClick={() => handleRestrictUser(user._id, user.isRestricted)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${user.isRestricted ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-200 dark:border-orange-800 shadow-sm'}`}>{user.isRestricted ? 'Unrestrict' : 'Restrict'}</button>
                        {isSuperAdmin && <button onClick={() => handleDeleteUser(user._id)} className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 shadow-sm">Delete</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!filteredUsers || filteredUsers.length === 0) && (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-smart-gray dark:text-gray-500 font-black uppercase tracking-widest text-[10px]">No users found matching your criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalUserPages > 1 && (
            <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-t border-smart-light/10 flex justify-between items-center">
              <span className="text-[10px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest hidden sm:inline">Showing {(userPage - 1) * 10 + 1} to {Math.min(userPage * 10, totalUsersCount)} of {totalUsersCount}</span>
              <div className="flex space-x-2 ml-auto sm:ml-0">
                <button onClick={() => setUserPage((p) => Math.max(1, p - 1))} disabled={userPage === 1} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Prev</button>
                <span className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-smart-dark dark:text-white flex items-center">Page {userPage} of {totalUserPages}</span>
                <button onClick={() => setUserPage((p) => Math.min(totalUserPages, p + 1))} disabled={userPage >= totalUserPages} className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-smart-light/20 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-smart-light/10">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UsersTab;
