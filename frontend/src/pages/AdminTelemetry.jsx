import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import AdminHeader from '../components/AdminHeader';
import HardwareStatsWidget from '../components/HardwareStatsWidget';
import { useTelemetry } from '../context/TelemetryContext';
import { socket } from '../socket';

const AdminTelemetry = () => {
  const navigate = useNavigate();
  const { totalAlertsCount } = useTelemetry();
  const [telemetry, setTelemetry] = useState(null);

  useEffect(() => {
    // 1. Fetch initial data
    const fetchInitialTelemetry = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await api.get('/telemetry/latest', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTelemetry(res.data);
      } catch (err) {
        console.error('Failed to fetch initial telemetry:', err);
      }
    };

    fetchInitialTelemetry();

    // 2. Setup socket listener
    const handleTelemetryUpdate = (data) => {
      setTelemetry(data);
    };

    socket.on('telemetryUpdate', handleTelemetryUpdate);

    return () => {
      socket.off('telemetryUpdate', handleTelemetryUpdate);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    localStorage.removeItem('adminEmail');
    window.location.href = '/';
  };

  const formatValue = (val) => (val === -1 || val === "-1" ? 'N/A' : val);

  const SensorCard = ({ title, value, unit, icon, colorClass }) => (
    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-smart-light/10 shadow-xl flex flex-col items-center justify-center text-center group hover:border-smart-light/40 transition-all duration-300">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${colorClass}`}>
        {icon}
      </div>
      <h3 className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-1">{title}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-black text-smart-dark dark:text-white italic tracking-tighter">
          {formatValue(value)}
        </span>
        {value !== -1 && unit && <span className="text-sm font-bold text-smart-light">{unit}</span>}
      </div>
    </div>
  );

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
          {telemetry?.lastUpdated && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black text-smart-light uppercase tracking-widest">
                Last Pulse: {new Date(telemetry.lastUpdated).toLocaleString()}
              </span>
            </div>
          )}
          <div className="h-1 w-24 bg-smart-light mx-auto mt-4 rounded-full"></div>
        </div>

        {/* Live Sensor Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <SensorCard 
            title="Soil Moisture" 
            value={telemetry?.moisture} 
            unit="" 
            colorClass="bg-blue-500/10 text-blue-500"
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          />
          <SensorCard 
            title="Humidity" 
            value={telemetry?.humidity} 
            unit="%" 
            colorClass="bg-cyan-500/10 text-cyan-500"
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>}
          />
          <SensorCard 
            title="Temperature" 
            value={telemetry?.temperature} 
            unit="°C" 
            colorClass="bg-orange-500/10 text-orange-500"
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          />
          <SensorCard 
            title="RGB Range" 
            value={telemetry?.rgbDistance} 
            unit="cm" 
            colorClass="bg-purple-500/10 text-purple-500"
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-smart-light/10 shadow-xl flex flex-col items-center justify-center text-center group hover:border-smart-light/40 transition-all duration-300">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${telemetry?.ldrStatus === 'ON' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-gray-500/10 text-gray-500'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <h3 className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-1">LDR Status</h3>
            <span className={`text-xl font-black italic uppercase ${telemetry?.ldrStatus === 'ON' ? 'text-yellow-500' : 'text-gray-500'}`}>
              {telemetry?.ldrStatus || 'OFF'}
            </span>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-smart-light/10 shadow-xl flex flex-col items-center justify-center text-center group hover:border-smart-light/40 transition-all duration-300">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${telemetry?.pumpStatus === 'ON' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h3 className="text-[10px] font-black text-smart-gray dark:text-gray-500 uppercase tracking-widest mb-1">Water Pump</h3>
            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${telemetry?.pumpStatus === 'ON' ? 'bg-green-500 text-white shadow-lg shadow-green-900/20' : 'bg-red-500 text-white shadow-lg shadow-red-900/20'}`}>
              {telemetry?.pumpStatus || 'OFF'}
            </span>
          </div>
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

