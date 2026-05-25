import React from 'react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from '../components/AdminHeader';
import HardwareStatsWidget from '../components/HardwareStatsWidget';
import { useTelemetry } from '../context/TelemetryContext';
import { socket } from '../socket';

const AdminTelemetry = () => {
  const navigate = useNavigate();
  const { totalAlertsCount } = useTelemetry();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    localStorage.removeItem('adminEmail');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-gray-900 transition-colors duration-500 flex flex-col">
      <AdminHeader
        title="Live Telemetry"
        subtitle="Real-time System Matrix"
        userName={localStorage.getItem('adminEmail')}
        onLogout={handleLogout}
        onAlertsClick={() => navigate('/admin/alerts')}
        onAuditClick={() => navigate('/admin/dashboard')}
        unreadAlertsCount={totalAlertsCount}
      />
      
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="w-full flex justify-start mb-8">
          <button
            onClick={() => navigate('/admin/dashboard?tab=hardware')}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase tracking-widest rounded-xl border border-slate-700 transition-all duration-200 shadow-lg hover:shadow-smart-light/10 group"
          >
            <svg 
              className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Gate & Hardware</span>
          </button>
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-black text-smart-dark dark:text-white uppercase tracking-tighter mb-3 italic">
            Hardware Telemetry
          </h1>
          <p className="text-smart-gray dark:text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs">
            Dedicated Live System Health & Sensor Data
          </p>
          <div className="h-1 w-24 bg-smart-light mx-auto mt-4 rounded-full"></div>
        </div>

        <HardwareStatsWidget socket={socket} />

        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 md:p-10 border border-smart-light/20 shadow-2xl">
          <h3 className="text-lg font-black text-smart-dark dark:text-white uppercase tracking-tight mb-4 italic flex items-center">
            <svg className="w-5 h-5 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Telemetry Insights
          </h3>
          <p className="text-sm text-smart-gray dark:text-gray-400 leading-relaxed max-w-3xl">
            This page provides a dedicated, high-frequency stream of IoT sensor data from across the park. 
            Use the statistics above to monitor the real-time health of your hardware infrastructure. 
            New alerts and state changes are pushed instantly via Socket.io.
          </p>
        </div>
      </main>
    </div>
  );
};

export default AdminTelemetry;
