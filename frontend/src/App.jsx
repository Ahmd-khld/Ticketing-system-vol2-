import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from './components/Navbar';
import CloudBackground from './components/CloudBackground';
import { socket } from './socket';
import { TelemetryProvider } from './context/TelemetryContext';

// Lazy loaded page components
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const BookingPage = React.lazy(() => import('./pages/BookingPage'));
const Payment = React.lazy(() => import('./pages/Payment'));
const About = React.lazy(() => import('./pages/About'));
const AdminHardwareAlerts = React.lazy(() => import('./pages/AdminHardwareAlerts'));
const AdminUserTickets = React.lazy(() => import('./pages/AdminUserTickets'));
const AdminGRC = React.lazy(() => import('./pages/AdminGRC'));
const Profile = React.lazy(() => import('./pages/Profile'));
const ParkMap = React.lazy(() => import('./pages/ParkMap'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const GamePage = React.lazy(() => import('./pages/GamePage'));

// Lazy loaded Admin Segmented Components
const AdminLayout = React.lazy(() => import('./components/admin/AdminLayout'));
const OverviewTab = React.lazy(() => import('./pages/admin/tabs/OverviewTab'));
const UsersTab = React.lazy(() => import('./pages/admin/tabs/UsersTab'));
const HardwareTab = React.lazy(() => import('./pages/admin/tabs/HardwareTab'));
const CollectionsTab = React.lazy(() => import('./pages/admin/tabs/CollectionsTab'));
const AccessControlTab = React.lazy(() => import('./pages/admin/tabs/AccessControlTab'));
const SecurityTab = React.lazy(() => import('./pages/admin/tabs/SecurityTab'));
const SystemTab = React.lazy(() => import('./pages/admin/tabs/SystemTab'));
const SalesTab = React.lazy(() => import('./pages/admin/tabs/SalesTab'));
const NetworkAccessTab = React.lazy(() => import('./pages/admin/tabs/NetworkAccessTab'));

const PageLoader = () => (
  <div className="flex-grow flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-smart-light/20 border-t-smart-light rounded-full animate-spin"></div>
      <p className="text-smart-light text-xs font-black uppercase tracking-widest animate-pulse">Loading Workspace...</p>
    </div>
  </div>
);

// Safe local storage utility
const getSafeStorage = (key) => {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Local storage restricted: could not read ${key}`);
    return null;
  }
};

// Admin Protection Component
const AdminRoute = ({ children }) => {
  const token = getSafeStorage('token');
  const role = getSafeStorage('role');
  
  if (!token) return <Navigate to="/" replace />;
  if (role !== 'admin' && role !== 'sub-admin') return <Navigate to="/" replace />;
  
  return children;
};

// User Protection Component
const PrivateRoute = ({ children }) => {
  const token = getSafeStorage('token');
  if (!token) return <Navigate to="/" replace />;
  return children;
};

const AnimatedRoutes = ({ isSuperAdmin }) => {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname.split('/')[1]} // Animate on main path changes to avoid double animation with tabs
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="flex-grow w-full flex flex-col"
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/book" element={<PrivateRoute><BookingPage /></PrivateRoute>} />
            <Route path="/payment" element={<PrivateRoute><Payment /></PrivateRoute>} />
            <Route path="/about" element={<About />} />
            <Route path="/map" element={<ParkMap />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/?action=forgot" replace />} />
            <Route path="/verify-email" element={<Navigate to="/?action=verify" replace />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* Admin Nested Routes */}
            <Route path="/admin/dashboard" element={<AdminRoute><AdminLayout /></AdminRoute>}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<OverviewTab isSuperAdmin={isSuperAdmin} />} />
              <Route path="users" element={<UsersTab isSuperAdmin={isSuperAdmin} />} />
              <Route path="hardware" element={<HardwareTab isSuperAdmin={isSuperAdmin} />} />
              <Route path="collections" element={<CollectionsTab isSuperAdmin={isSuperAdmin} />} />
              <Route path="access" element={<AccessControlTab isSuperAdmin={isSuperAdmin} />} />
              <Route path="network-access" element={<NetworkAccessTab isSuperAdmin={isSuperAdmin} />} />
              <Route path="security" element={<SecurityTab isSuperAdmin={isSuperAdmin} />} />
              <Route path="system" element={<SystemTab isSuperAdmin={isSuperAdmin} />} />
              <Route path="sales" element={<SalesTab isSuperAdmin={isSuperAdmin} />} />
            </Route>

            <Route path="/admin/alerts" element={<AdminRoute><AdminHardwareAlerts /></AdminRoute>} />
            <Route path="/admin/users/:userId/tickets" element={<AdminRoute><AdminUserTickets /></AdminRoute>} />
            <Route path="/admin/grc" element={<AdminRoute><AdminGRC /></AdminRoute>} />

            <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
            <Route path="/rewards" element={<PrivateRoute><GamePage /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

function App() {
  React.useEffect(() => {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');

    // 1. Establish Authenticated Socket Connection
    if (token && !socket.connected) {
      socket.auth = { token };
      socket.connect();
    }

    // 2. Room Management & Security Listeners
    const onConnect = () => {
      if (userId) {
        socket.emit('joinUserRoom', userId);
      }
    };

    const handleAccountRestricted = (data) => {
      if (!data) return;
      if (userId === data.userId) {
        performLogout(data.message);
      }
    };

    const handleForceLogout = (data) => {
      if (!data) return;
      const localAdminEmail = localStorage.getItem('adminEmail');
      
      const isIdMatch = userId && userId === data.userId;
      const isEmailMatch = localAdminEmail && data.email && localAdminEmail.toLowerCase() === data.email.toLowerCase();
      
      if (isIdMatch || isEmailMatch) {
        performLogout(data.message);
      }
    };

    const performLogout = (message) => {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('userId');
      localStorage.removeItem('adminEmail');
      localStorage.removeItem('twoFactorRemembered');
      window.location.href = `/?message=${encodeURIComponent(message)}`;
    };

    socket.on('connect', onConnect);
    socket.on('accountRestricted', handleAccountRestricted);
    socket.on('forceLogout', handleForceLogout); // Support legacy name
    socket.on('force_logout', handleForceLogout); // Targeted event
    
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('accountRestricted', handleAccountRestricted);
      socket.off('forceLogout', handleForceLogout);
      socket.off('force_logout', handleForceLogout);
    };
  }, []);

  React.useEffect(() => {
    try {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } catch (error) {
      console.warn('Local storage restricted: could not save theme');
    }
  }, []);

  const superAdminEmail = (import.meta.env.VITE_SUPER_ADMIN_EMAIL || 'admin@smartpark.com').toLowerCase();
  const currentAdminEmail = (getSafeStorage('adminEmail') || '').toLowerCase().trim();
  const isSuperAdmin = currentAdminEmail === superAdminEmail;

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TelemetryProvider>
        <div className="min-h-screen bg-[#020617] text-gray-100 font-sans flex flex-col transition-colors duration-500 relative">
          <CloudBackground />
          <div className="relative z-10 flex flex-col min-h-screen">
            <Navbar />
            <AnimatedRoutes isSuperAdmin={isSuperAdmin} />
          </div>
        </div>
      </TelemetryProvider>
    </Router>
  );
}

export default App;
