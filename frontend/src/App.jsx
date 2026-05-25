import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import BookingPage from './pages/BookingPage';
import Payment from './pages/Payment';
import About from './pages/About';
import AdminDashboard from './pages/AdminDashboard';
import AdminHardwareAlerts from './pages/AdminHardwareAlerts';
import AdminUserTickets from './pages/AdminUserTickets';
import AdminTelemetry from './pages/AdminTelemetry';
import AdminGRC from './pages/AdminGRC';
import Profile from './pages/Profile';
import ParkMap from './pages/ParkMap';
import ResetPassword from './pages/ResetPassword';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import VerifyEmail from './pages/VerifyEmail';
import GamePage from './pages/GamePage';
import CloudBackground from './components/CloudBackground';
import { Navigate } from 'react-router-dom';
import { socket } from './socket';
import { TelemetryProvider } from './context/TelemetryContext';

// Safe local storage utility to prevent complete app crashes when
// the browser restricts cookies/local storage (e.g. Incognito mode)
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
  
  if (!token) return <Navigate to="/login" replace />;
  if (role !== 'admin' && role !== 'sub-admin') return <Navigate to="/" replace />;
  
  return children;
};

// User Protection Component
const PrivateRoute = ({ children }) => {
  const token = getSafeStorage('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  // Application locked to dark mode per requirement
  const [darkMode] = React.useState(true);

  React.useEffect(() => {
    // 1. Listen for account restriction (Instant Kick)
    const handleAccountRestricted = (data) => {
      if (!data) return;
      const localUserId = localStorage.getItem('userId'); 
      if (localUserId === data.userId) {
        // CLEANUP FIRST
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('userId');
        localStorage.removeItem('adminEmail');
        
        // HARD REDIRECT TO BYPASS REACT RENDER CYCLE CRASHES
        window.location.href = `/login?restrictionReason=${encodeURIComponent(data.message)}`;
      }
    };

    socket.on('accountRestricted', handleAccountRestricted);

    return () => {
      socket.off('accountRestricted', handleAccountRestricted);
    };
  }, []);

  React.useEffect(() => {
    try {
      // Force dark mode implementation
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } catch (error) {
      console.warn('Local storage restricted: could not save theme');
    }
  }, []);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TelemetryProvider>
        <div className="min-h-screen bg-[#020617] text-gray-100 font-sans flex flex-col transition-colors duration-500 relative">
          <CloudBackground />
          <div className="relative z-10 flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow w-full flex flex-col">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route
                  path="/book"
                  element={
                    <PrivateRoute>
                      <BookingPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/payment"
                  element={
                    <PrivateRoute>
                      <Payment />
                    </PrivateRoute>
                  }
                />
                <Route path="/about" element={<About />} />
                <Route path="/map" element={<ParkMap />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                <Route
                  path="/admin/dashboard"
                  element={
                    <AdminRoute>
                      <AdminDashboard />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/alerts"
                  element={
                    <AdminRoute>
                      <AdminHardwareAlerts />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/users/:userId/tickets"
                  element={
                    <AdminRoute>
                      <AdminUserTickets />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/telemetry"
                  element={
                    <AdminRoute>
                      <AdminTelemetry socket={socket} />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/grc"
                  element={
                    <AdminRoute>
                      <AdminGRC />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <PrivateRoute>
                      <Profile />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/rewards"
                  element={
                    <PrivateRoute>
                      <GamePage />
                    </PrivateRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </TelemetryProvider>
    </Router>
  );
}

export default App;
