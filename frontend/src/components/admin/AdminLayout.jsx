import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AdminHeader from '../AdminHeader';
import MandatoryPasswordModal from '../MandatoryPasswordModal';
import { useUI } from '../../context/UIContext';
import { useTelemetry } from '../../context/TelemetryContext';
import api from '../../api';

const isTokenExpired = (token) => {
  if (!token || token === 'undefined' || token === 'null') return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    return payload.exp ? Date.now() >= payload.exp * 1000 : false;
  } catch (error) {
    return true;
  }
};

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showModal } = useUI();
  const [showMandatoryPasswordModal, setShowMandatoryPasswordModal] = useState(
    localStorage.getItem('requiresPasswordReset') === 'true'
  );
  
  const superAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
  const currentAdminEmail = (localStorage.getItem('adminEmail') || '').toLowerCase().trim();
  const isSuperAdmin = currentAdminEmail === superAdminEmail;

  const { 
    unreadAlertsCount, setUnreadAlertsCount,
    unreadAuditCount, setUnreadAuditCount,
    unreadBannedCount, setUnreadBannedCount 
  } = useTelemetry();

  useEffect(() => {
    // Check token on mount
    const token = localStorage.getItem('token');
    if (isTokenExpired(token)) {
      handleLogout();
      return;
    }

    // Socket Event Handlers for Global Counts
    const onHardwareAlert = () => {
      if (!location.pathname.includes('/hardware')) {
        setUnreadAlertsCount(prev => prev + 1);
      }
    };

    const onAuditLogUpdate = () => {
      if (!location.pathname.includes('/security')) {
        setUnreadAuditCount(prev => prev + 1);
      }
    };

    const onBannedIpAdded = () => {
      if (!location.pathname.includes('/network-access')) {
        setUnreadBannedCount(prev => prev + 1);
      }
    };

    const onConnect = () => {
      const role = localStorage.getItem('role');
      if (role === 'admin' || role === 'sub-admin') {
        import('../../socket').then(({ socket }) => {
          socket.emit('join-admin-room');
        });
      }
    };

    import('../../socket').then(({ socket }) => {
      socket.on('hardwareAlert', onHardwareAlert);
      socket.on('auditLogUpdate', onAuditLogUpdate);
      socket.on('bannedIpAdded', onBannedIpAdded);
      socket.on('connect', onConnect);
      
      if (socket.connected) onConnect();
    });

    return () => {
      import('../../socket').then(({ socket }) => {
        socket.off('hardwareAlert', onHardwareAlert);
        socket.off('auditLogUpdate', onAuditLogUpdate);
        socket.off('bannedIpAdded', onBannedIpAdded);
        socket.off('connect', onConnect);
      });
    };
  }, [location.pathname]);

  useEffect(() => {
    // Reset counts when entering tabs
    if (location.pathname.includes('/hardware')) setUnreadAlertsCount(0);
    if (location.pathname.includes('/security')) {
      setUnreadAuditCount(0);
    }
    if (location.pathname.includes('/network-access')) {
      setUnreadBannedCount(0);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    localStorage.removeItem('adminEmail');
    // Force a full page redirect to / to ensure all state is cleared and avoid any route/animation deadlocks
    window.location.href = '/';
  };

  const navItems = [
    {
      id: 'overview',
      path: '/admin/dashboard/overview',
      label: 'Overview & Stats',
      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    },
    {
      id: 'users',
      path: '/admin/dashboard/users',
      label: 'User Management',
      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    },
    { id: 'hardware', path: '/admin/dashboard/hardware', label: 'Gate & Hardware', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    {
      id: 'collections',
      path: '/admin/dashboard/collections',
      label: 'Cash Collections',
      icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    },
    {
      id: 'sales',
      path: '/admin/dashboard/sales',
      label: 'Historical Sales',
      icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z',
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'access',
            path: '/admin/dashboard/access',
            label: 'Access Control',
            icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
          },
          {
            id: 'network',
            path: '/admin/dashboard/network-access',
            label: 'Network Access',
            icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
          },
          {
            id: 'security',
            path: '/admin/dashboard/security',
            label: 'Security Logs',
            icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
          },
          {
            id: 'grc',
            path: '/admin/grc',
            label: 'GRC & Security',
            icon: 'M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4',
          },
          {
            id: 'system',
            path: '/admin/dashboard/system',
            label: 'System Backups',
            icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black font-sans flex flex-col transition-colors duration-300">
      <MandatoryPasswordModal 
        isOpen={showMandatoryPasswordModal} 
        onSuccess={() => setShowMandatoryPasswordModal(false)} 
      />

      <AdminHeader
        title="Admin Control Panel"
        subtitle={
          isSuperAdmin ? 'Smart Park Ecosystem (Super Admin)' : 'Smart Park Ecosystem (Sub-Admin)'
        }
        userName={localStorage.getItem('adminEmail')}
        unreadAlertsCount={unreadAlertsCount}
        unreadAuditCount={isSuperAdmin ? unreadAuditCount : 0}
        unreadBannedCount={isSuperAdmin ? unreadBannedCount : 0}
        onAlertsClick={() => navigate('/admin/dashboard/hardware')}
        onAuditClick={isSuperAdmin ? () => navigate('/admin/dashboard/security') : undefined}
        onBannedClick={isSuperAdmin ? () => navigate('/admin/dashboard/network-access') : undefined}
        onLogout={handleLogout}
      />

      <div className="flex flex-grow w-full max-w-[1440px] mx-auto px-4 md:px-8">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-72 py-6 pr-6 flex-shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-[30px] p-5 shadow-2xl border border-smart-light/10 dark:border-gray-700 sticky top-8 flex flex-col space-y-2">
            <h3 className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-3 px-4 pt-2">
              Admin Modules
            </h3>
            {navItems.map((item) => (
              <motion.div
                key={item.id}
                whileHover={{ x: 5 }}
                whileTap={{ scale: 0.98 }}
              >
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center px-5 py-4 rounded-xl text-xs font-black uppercase tracking-widest w-full transition-all duration-300 ${
                      isActive
                        ? 'bg-smart-dark text-white shadow-lg transform scale-[1.02] dark:bg-smart-light dark:text-smart-dark'
                        : 'bg-transparent text-smart-gray dark:text-gray-400 hover:bg-smart-light/10 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <svg className="w-5 h-5 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon}></path>
                  </svg>
                  {item.label}
                </NavLink>
              </motion.div>
            ))}
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-6 py-8 w-full">
          {/* Mobile Tab Navigation Menu */}
          <div className="lg:hidden flex flex-nowrap space-x-4 bg-white dark:bg-gray-800 p-3 rounded-3xl mb-8 overflow-x-auto border border-smart-light/20 shadow-xl scrollbar-hide">
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center flex-1 shrink-0 justify-center px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all duration-300 ${
                    isActive
                      ? 'bg-smart-light text-white shadow-lg transform -translate-y-1'
                      : 'bg-transparent text-smart-gray dark:text-gray-400 hover:bg-smart-light/10 dark:hover:bg-gray-700'
                  }`
                }
              >
                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon}></path>
                </svg>
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="relative min-h-[600px] w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="w-full h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;

