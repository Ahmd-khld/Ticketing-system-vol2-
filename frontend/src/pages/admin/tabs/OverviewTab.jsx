import React, { useState, useEffect, useMemo } from 'react';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';

const OverviewTab = ({ isSuperAdmin }) => {
  const { showModal, showConfirm } = useUI();
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Historical Sales State
  const [monthlySales, setMonthlySales] = useState([]);
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  const [isMonthlySalesExpanded, setIsMonthlySalesExpanded] = useState(true);

  const fetchStats = async () => {
    const token = localStorage.getItem('token');
    try {
      const statsRes = await api.get('/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(statsRes.data);

      const salesRes = await api.get('/admin/monthly-sales', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMonthlySales(salesRes.data);
    } catch (error) {
      console.error('Failed to refresh stats', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const fetchFilteredSales = async () => {
      if (!salesStartDate && !salesEndDate) return;
      const token = localStorage.getItem('token');
      try {
        const res = await api.get('/admin/monthly-sales', {
          params: { startDate: salesStartDate, endDate: salesEndDate },
          headers: { Authorization: `Bearer ${token}` },
        });
        setMonthlySales(res.data);
      } catch (err) {
        console.error('Failed to fetch filtered sales', err);
      }
    };
    fetchFilteredSales();
  }, [salesStartDate, salesEndDate]);

  const maxMonthlySales = useMemo(() => 
    Math.max(...monthlySales.map((s) => s.totalTickets), 1), 
  [monthlySales]);

  const handleExportMonthlySalesCSV = () => {
    if (monthlySales.length === 0) return;
    const headers = ['Month', 'Total Tickets', 'Revenue (EGP)'];
    const csvRows = [headers.join(',')];
    monthlySales.forEach((sale) => {
      csvRows.push(`"${sale.month}",${sale.totalTickets},${sale.revenue}`);
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'ticket-sales-report.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleResetOccupancy = async () => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to reset the park occupancy? This will archive all currently scanned tickets. This action cannot be undone.',
      'Reset Occupancy'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.post('/admin/reset-occupancy', {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal('Park occupancy has been reset successfully.', 'Success', 'success');
      fetchStats();
    } catch (error) {
      console.error('Reset Occupancy Error:', error);
      showModal(error.response?.data?.message || 'Failed to reset occupancy', 'Error', 'error');
    }
  };

  const handleToggleMockTelemetry = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.post('/telemetry/toggle-mock', {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal(response.data.message || 'Telemetry mock mode updated!', 'Mock Mode Toggled', 'success');
    } catch (error) {
      console.error('Toggle Mock Telemetry Error:', error);
      showModal(error.response?.data?.message || 'Failed to toggle mock telemetry', 'Error', 'error');
    }
  };

  const handleGenerateDummyTickets = async () => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.post('/admin/generate-mock-data', {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal(response.data.message || 'Simulation data generated successfully!', 'Success', 'success');
      fetchStats();
    } catch (error) {
      console.error('Generate Mock Data Error:', error);
      showModal(error.response?.data?.message || 'Failed to generate mock data', 'Error', 'error');
    }
  };

  const handleClearDummyData = async () => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to delete all tickets? This will clear all chart data and cannot be undone.',
      'Clear Database'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.delete('/admin/clear-dummy-tickets', { headers: { Authorization: `Bearer ${token}` } });
      showModal('All dummy data cleared successfully!', 'Success', 'success');
      fetchStats();
    } catch (error) {
      console.error('Clear Dummy Data Error:', error);
      showModal(error.response?.data?.message || 'Failed to clear dummy data', 'Error', 'error');
    }
  };

  const handleBackupDatabase = async () => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to trigger a manual database backup now?',
      'Database Backup'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      const response = await api.post('/admin/backup', {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal(response.data.message, 'Success', 'success');
    } catch (error) {
      console.error('Backup Error:', error);
      showModal(error.response?.data?.message || 'Failed to trigger backup', 'Error', 'error');
    }
  };

  return (
    <div className="p-4 md:p-8 bg-white dark:bg-gray-800/30 rounded-[40px] border border-smart-light/10 shadow-2xl mb-10 animate-fade-in-up w-full max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-black text-smart-dark dark:text-white uppercase italic tracking-tighter flex items-center">
          <svg className="w-8 h-8 mr-3 text-smart-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          System Overview
        </h2>
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="group flex items-center px-6 py-3 bg-white dark:bg-gray-800 border-2 border-smart-light/20 rounded-2xl text-[10px] font-black uppercase tracking-widest text-smart-gray dark:text-gray-400 hover:text-smart-dark dark:hover:text-white hover:border-smart-light transition-all shadow-xl hover:shadow-smart-light/20 active:scale-95 disabled:opacity-50"
        >
          <svg
            className={`w-5 h-5 mr-3 transition-transform duration-500 ${isRefreshing ? 'animate-spin text-smart-light' : 'group-hover:rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            ></path>
          </svg>
          {isRefreshing ? 'Syncing Ecosystem...' : 'Refresh Live Data'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 w-full mb-10">
        {/* Total Tickets Sold */}
        <div className="relative bg-white dark:bg-gray-800 rounded-full w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] lg:w-[240px] lg:h-[240px] flex-shrink-0 flex flex-col items-center justify-center p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] border-[10px] border-blue-500/20 hover:border-blue-500/40 transition-all transform hover:scale-105 text-center group">
          <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-3 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path>
            </svg>
          </div>
          <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1">Total Tickets Sold</h3>
          {isLoadingStats ? (
            <span className="text-sm font-bold text-gray-400 animate-pulse">Analyzing...</span>
          ) : (
            <span className="text-4xl font-black text-smart-dark dark:text-white italic">{stats?.totalTicketsSold || 0}</span>
          )}
        </div>

        {/* Current Occupancy */}
        <div className="relative bg-white dark:bg-gray-800 rounded-full w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] lg:w-[240px] lg:h-[240px] flex-shrink-0 flex flex-col items-center justify-center p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] text-center transform transition-transform hover:scale-105 group">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-700" />
            <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="289" strokeDashoffset={289 - (289 * (stats?.capacityPercentage || 0)) / 100} strokeLinecap="round" className="text-smart-light transition-all duration-1000 ease-out" />
          </svg>
          <div className="w-12 h-12 bg-smart-light/10 rounded-full flex items-center justify-center mb-3 text-smart-light group-hover:bg-smart-light group-hover:text-white transition-colors z-10">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
            </svg>
          </div>
          <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1 z-10">Current Occupancy</h3>
          {isLoadingStats ? (
            <span className="text-sm font-bold text-gray-400 animate-pulse z-10">Analyzing...</span>
          ) : (
            <div className="flex flex-col items-center z-10">
              <span className="text-4xl font-black text-smart-light italic leading-none">{stats?.currentOccupancy || 0}</span>
              <span className="text-smart-gray dark:text-gray-500 font-bold text-[10px] uppercase tracking-widest mt-1">/ {stats?.maxCapacity || 1000} Limit</span>
            </div>
          )}
        </div>

        {/* Most Sold Ticket */}
        <div className="relative bg-white dark:bg-gray-800 rounded-full w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] lg:w-[240px] lg:h-[240px] flex-shrink-0 flex flex-col items-center justify-center p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] border-[10px] border-orange-500/20 hover:border-orange-500/40 transition-all transform hover:scale-105 text-center group">
          <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-3 text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1">Most Sold Ticket</h3>
          {isLoadingStats ? (
            <span className="text-sm font-bold text-gray-400 animate-pulse">Analyzing...</span>
          ) : (
            <span className="text-lg font-black text-smart-dark dark:text-white uppercase italic leading-tight px-2">{stats?.mostSoldTicket || 'N/A'}</span>
          )}
        </div>

        {/* User Statistics */}
        <div className="relative bg-white dark:bg-gray-800 rounded-full w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] lg:w-[240px] lg:h-[240px] flex-shrink-0 flex flex-col items-center justify-center p-4 shadow-[0_10px_40px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] text-center transform transition-transform hover:scale-105 group">
          <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-700" />
            <circle cx="50" cy="50" r="46" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="289" strokeDashoffset={289 - (289 * (stats?.activeUsers ? stats.purchasingUsers / stats.activeUsers : 0)) / 100} strokeLinecap="round" className="text-smart-glow transition-all duration-1000 ease-out" />
          </svg>
          <div className="w-12 h-12 bg-smart-glow/10 rounded-full flex items-center justify-center mb-3 text-smart-glow group-hover:bg-smart-glow group-hover:text-white transition-colors z-10">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
          </div>
          <h3 className="text-smart-gray dark:text-gray-400 font-black text-[10px] uppercase tracking-widest mb-1 z-10">User Statistics</h3>
          {isLoadingStats ? (
            <span className="text-sm font-bold text-gray-400 animate-pulse z-10">Analyzing...</span>
          ) : (
            <div className="flex flex-col items-center z-10">
              <span className="text-4xl font-black text-smart-dark dark:text-white italic leading-none">{stats?.purchasingUsers || 0}</span>
              <span className="text-smart-gray dark:text-gray-500 font-bold text-[10px] uppercase tracking-widest mt-1">of {stats?.activeUsers || 0} Total</span>
            </div>
          )}
        </div>
      </div>

      {/* Admin Quick Actions Row */}
      {isSuperAdmin && !isLoadingStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <button onClick={handleResetOccupancy} className="py-4 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-red-900/40 active:scale-95 flex flex-col items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Reset Occupancy
          </button>
          <button onClick={handleGenerateDummyTickets} className="py-4 bg-smart-light hover:bg-smart-dark text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-smart-light/40 active:scale-95 flex flex-col items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
            Generate Data
          </button>
          <button onClick={handleToggleMockTelemetry} className="py-4 bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-orange-900/40 active:scale-95 flex flex-col items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            Mock Telemetry
          </button>
          <button onClick={handleClearDummyData} className="py-4 bg-gray-600 hover:bg-gray-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-gray-900/40 active:scale-95 flex flex-col items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            Clear Data
          </button>
          <button onClick={handleBackupDatabase} className="py-4 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-lg hover:shadow-blue-900/40 active:scale-95 flex flex-col items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
            Backup DB
          </button>
        </div>
      )}
    </div>
  );
};

export default OverviewTab;
