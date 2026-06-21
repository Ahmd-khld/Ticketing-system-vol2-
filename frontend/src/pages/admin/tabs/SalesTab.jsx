import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';
import WidgetErrorBoundary from '../../../components/WidgetErrorBoundary';

const SalesTab = () => {
  const { showModal } = useUI();
  const [monthlySales, setMonthlySales] = useState([]);
  const [miningData, setMiningData] = useState(null);
  const [salesStartDate, setSalesStartDate] = useState('');
  const [salesEndDate, setSalesEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchSales = async () => {
    const token = localStorage.getItem('token');
    try {
      const params = {};
      if (salesStartDate) params.startDate = salesStartDate;
      if (salesEndDate) params.endDate = salesEndDate;

      const res = await api.get('/admin/monthly-sales', {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data && res.data.monthlySales) {
        setMonthlySales(res.data.monthlySales || []);
        setMiningData(res.data.miningData || null);
      } else {
        setMonthlySales(res.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch sales data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [salesStartDate, salesEndDate]);

  const maxMonthlySales = useMemo(() => 
    Math.max(...monthlySales.map((s) => s.totalTickets), 1), 
  [monthlySales]);

  const renderMiningWidgets = () => {
    if (!miningData) return null;

    const totalTickets = miningData.ticketTypes.reduce((acc, curr) => acc + curr.count, 0);
    if (totalTickets === 0) return null;

    const getCount = (arr, id) => arr.find(item => item._id === id)?.count || 0;
    
    const childCount = getCount(miningData.ticketTypes, 'child');
    const adultCount = getCount(miningData.ticketTypes, 'adult');
    const seniorCount = getCount(miningData.ticketTypes, 'senior');
    
    const onlineCount = getCount(miningData.payments, 'ONLINE');
    const cashCount = getCount(miningData.payments, 'CASH');

    const monthlyCount = getCount(miningData.subscriptions, 'monthly');
    const onetimeCount = getCount(miningData.subscriptions, 'one-time');

    const promoYes = getCount(miningData.promos, true);
    const promoNo = getCount(miningData.promos, false);

    const activeCount = getCount(miningData.statuses, 'ACTIVE');
    const usedCount = getCount(miningData.statuses, 'USED');
    const expiredCount = getCount(miningData.statuses, 'EXPIRED');
    const cancelledCount = getCount(miningData.statuses, 'CANCELLED');

    const reschedYes = getCount(miningData.reschedules, true);
    const reschedNo = getCount(miningData.reschedules, false);

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // In MongoDB, dayOfWeek returns 1 (Sunday) to 7 (Saturday).
    const daysData = [1, 2, 3, 4, 5, 6, 7].map(dayNum => ({
      day: dayLabels[dayNum - 1],
      count: getCount(miningData.daysOfWeek, dayNum)
    }));
    const maxDayCount = Math.max(...daysData.map(d => d.count), 1);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-8 py-8 bg-smart-bg/50 dark:bg-gray-900/50 border-t border-smart-light/10">
        {/* Ticket Types Distribution */}
        <div className="bg-white/5 dark:bg-gray-800 p-6 rounded-2xl border border-smart-light/10 shadow-inner group hover:bg-white/10 transition-colors">
          <h3 className="text-xs font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-6 flex items-center">
            <svg className="w-4 h-4 mr-2 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            Customer Demographics
          </h3>
          <div className="flex w-full h-4 rounded-full overflow-hidden mb-4 bg-gray-700 shadow-inner">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(adultCount / totalTickets) * 100}%` }} className="h-full bg-emerald-500" />
            <motion.div initial={{ width: 0 }} animate={{ width: `${(childCount / totalTickets) * 100}%` }} className="h-full bg-blue-500" />
            <motion.div initial={{ width: 0 }} animate={{ width: `${(seniorCount / totalTickets) * 100}%` }} className="h-full bg-purple-500" />
          </div>
          <div className="flex justify-between text-[10px] font-bold uppercase text-gray-500">
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>Adult ({Math.round((adultCount/totalTickets)*100)}%)</span>
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>Child ({Math.round((childCount/totalTickets)*100)}%)</span>
            <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-purple-500 mr-1 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></span>Senior ({Math.round((seniorCount/totalTickets)*100)}%)</span>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white/5 dark:bg-gray-800 p-6 rounded-2xl border border-smart-light/10 shadow-inner group hover:bg-white/10 transition-colors">
          <h3 className="text-xs font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-6 flex items-center">
            <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            Payment Channels
          </h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-300">Online</span>
            <span className="text-xs font-bold text-gray-300">Cash/Box Office</span>
          </div>
          <div className="flex w-full h-3 rounded-full overflow-hidden bg-gray-700 shadow-inner">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(onlineCount / (onlineCount + cashCount || 1)) * 100}%` }} className="h-full bg-blue-500" />
            <motion.div initial={{ width: 0 }} animate={{ width: `${(cashCount / (onlineCount + cashCount || 1)) * 100}%` }} className="h-full bg-orange-500" />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-gray-500 mt-2">
            <span>{onlineCount} TXNs</span>
            <span>{cashCount} TXNs</span>
          </div>
        </div>

        {/* Subscriptions */}
        <div className="bg-white/5 dark:bg-gray-800 p-6 rounded-2xl border border-smart-light/10 shadow-inner group hover:bg-white/10 transition-colors">
          <h3 className="text-xs font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-6 flex items-center">
            <svg className="w-4 h-4 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Subscription Types
          </h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-300">Monthly Subs</span>
            <span className="text-xs font-bold text-gray-300">One-Time Passes</span>
          </div>
          <div className="flex w-full h-3 rounded-full overflow-hidden bg-gray-700 shadow-inner">
            <motion.div initial={{ width: 0 }} animate={{ width: `${(monthlyCount / (monthlyCount + onetimeCount || 1)) * 100}%` }} className="h-full bg-orange-500" />
            <motion.div initial={{ width: 0 }} animate={{ width: `${(onetimeCount / (monthlyCount + onetimeCount || 1)) * 100}%` }} className="h-full bg-slate-500" />
          </div>
          <div className="flex justify-between text-[10px] font-bold text-gray-500 mt-2">
            <span>{Math.round((monthlyCount / (monthlyCount + onetimeCount || 1)) * 100)}%</span>
            <span>{Math.round((onetimeCount / (monthlyCount + onetimeCount || 1)) * 100)}%</span>
          </div>
        </div>

        {/* Promo Usage */}
        <div className="bg-white/5 dark:bg-gray-800 p-6 rounded-2xl border border-smart-light/10 shadow-inner group hover:bg-white/10 transition-colors">
          <h3 className="text-xs font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-6 flex items-center">
            <svg className="w-4 h-4 mr-2 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
            Promo Code Utilization
          </h3>
          <div className="flex items-center justify-between">
            <div className="relative w-16 h-16">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path className="text-gray-700" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <motion.path 
                  className="text-pink-500" 
                  strokeWidth="3" 
                  strokeDasharray={`${(promoYes / (promoYes + promoNo || 1)) * 100}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor" 
                  fill="none" 
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                  initial={{ strokeDasharray: "0, 100" }}
                  animate={{ strokeDasharray: `${(promoYes / (promoYes + promoNo || 1)) * 100}, 100` }}
                  transition={{ duration: 1 }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                {Math.round((promoYes / (promoYes + promoNo || 1)) * 100)}%
              </div>
            </div>
            <div className="flex flex-col items-end text-xs font-bold text-gray-400">
              <span className="text-pink-500 flex items-center"><span className="w-1.5 h-1.5 bg-pink-500 rounded-full mr-1.5 shadow-[0_0_8px_rgba(236,72,153,0.8)]"></span>{promoYes} with Promo</span>
              <span className="text-gray-500 flex items-center mt-1.5"><span className="w-1.5 h-1.5 bg-gray-500 rounded-full mr-1.5"></span>{promoNo} without</span>
            </div>
          </div>
        </div>

        {/* Operational Status */}
        <div className="bg-white/5 dark:bg-gray-800 p-6 rounded-2xl border border-smart-light/10 shadow-inner group hover:bg-white/10 transition-colors">
          <h3 className="text-xs font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-6 flex items-center">
            <svg className="w-4 h-4 mr-2 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Ticket Lifecycle Status
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900/50 p-3 rounded-xl border border-gray-700">
              <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Active</div>
              <div className="text-xl font-black text-white">{activeCount}</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded-xl border border-gray-700">
              <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Used</div>
              <div className="text-xl font-black text-white">{usedCount}</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded-xl border border-gray-700">
              <div className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Expired</div>
              <div className="text-xl font-black text-white">{expiredCount}</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded-xl border border-gray-700">
              <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Cancelled</div>
              <div className="text-xl font-black text-white">{cancelledCount}</div>
            </div>
          </div>
        </div>

        {/* Flexibility (Reschedules) */}
        <div className="bg-white/5 dark:bg-gray-800 p-6 rounded-2xl border border-smart-light/10 shadow-inner group hover:bg-white/10 transition-colors">
          <h3 className="text-xs font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-6 flex items-center">
            <svg className="w-4 h-4 mr-2 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Rescheduling Frequency
          </h3>
          <div className="flex items-center justify-between">
            <div className="relative w-16 h-16">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path className="text-gray-700" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <motion.path 
                  className="text-cyan-500" 
                  strokeWidth="3" 
                  strokeDasharray={`${(reschedYes / (reschedYes + reschedNo || 1)) * 100}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor" 
                  fill="none" 
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                  initial={{ strokeDasharray: "0, 100" }}
                  animate={{ strokeDasharray: `${(reschedYes / (reschedYes + reschedNo || 1)) * 100}, 100` }}
                  transition={{ duration: 1 }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                {Math.round((reschedYes / (reschedYes + reschedNo || 1)) * 100)}%
              </div>
            </div>
            <div className="flex flex-col items-end text-xs font-bold text-gray-400">
              <span className="text-cyan-500 flex items-center"><span className="w-1.5 h-1.5 bg-cyan-500 rounded-full mr-1.5 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></span>{reschedYes} Rescheduled</span>
              <span className="text-gray-500 flex items-center mt-1.5"><span className="w-1.5 h-1.5 bg-gray-500 rounded-full mr-1.5"></span>{reschedNo} Unchanged</span>
            </div>
          </div>
        </div>

        {/* Purchase Velocity (Day of Week) */}
        <div className="md:col-span-2 bg-white/5 dark:bg-gray-800 p-6 rounded-2xl border border-smart-light/10 shadow-inner group hover:bg-white/10 transition-colors">
          <h3 className="text-xs font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest mb-6 flex items-center">
            <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Weekly Sales Velocity
          </h3>
          <div className="flex items-end justify-between h-32 mt-4 space-x-2">
            {daysData.map((d, idx) => (
              <div key={idx} className="flex flex-col items-center justify-end w-full h-full group/bar">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((d.count / maxDayCount) * 100, 5)}%` }}
                  transition={{ delay: idx * 0.05, duration: 0.5 }}
                  className="w-full bg-indigo-500/30 group-hover/bar:bg-indigo-500 rounded-t-lg border border-indigo-500/50 transition-colors relative flex justify-center"
                >
                  <div className="absolute -top-8 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-10 whitespace-nowrap pointer-events-none">
                    {d.count}
                  </div>
                </motion.div>
                <span className="text-[10px] font-bold text-gray-500 uppercase mt-2">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    );
  };

  const handleExportCSV = () => {
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
    link.setAttribute('download', 'sales-report.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden relative min-h-[500px]">
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px] z-30 flex justify-center items-center"
          >
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center">
        <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
          <svg className="w-6 h-6 mr-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>
          Historical Revenue Analysis
        </h2>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleExportCSV}
          className="px-6 py-2 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-smart-light/20"
          disabled={monthlySales.length === 0}
        >
          Export CSV
        </motion.button>
      </div>

      <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-5 border-b border-smart-light/10 flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="flex items-center space-x-3">
          <span className="text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-widest">Filter:</span>
          <input type="month" value={salesStartDate} onChange={(e) => setSalesStartDate(e.target.value)} className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-xs font-mono outline-none" />
          <span className="text-gray-500 italic">to</span>
          <input type="month" value={salesEndDate} onChange={(e) => setSalesEndDate(e.target.value)} className="px-4 py-2 rounded-xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-xs font-mono outline-none" />
        </div>
      </div>

      <WidgetErrorBoundary>
        <div className="p-8 overflow-x-auto">
          {isLoading ? (
            <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div></div>
          ) : monthlySales.length > 0 ? (
            <div className="flex items-end justify-between space-x-4 min-w-[600px] h-64 mt-4 mb-12 border-b-2 border-smart-light/20 pb-4">
              {monthlySales.map((sale, index) => {
                const heightPercent = Math.max((sale.totalTickets / maxMonthlySales) * 100, 5);
                return (
                  <div key={index} className="flex flex-col items-center justify-end w-full h-full group relative">
                    <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity text-center bg-smart-dark text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                      {sale.totalTickets} Tickets<br />{sale.revenue} EGP
                    </div>
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: `${heightPercent}%` }}
                      transition={{ delay: index * 0.05, duration: 0.5, ease: "easeOut" }}
                      className="w-full max-w-[50px] bg-smart-light/20 group-hover:bg-smart-light transition-all rounded-t-xl relative border border-smart-light/30"
                    >
                      <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-smart-light/50 to-transparent"></div>
                    </motion.div>
                    <div className="absolute -bottom-10 text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase text-center w-full">
                      {sale.month}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-smart-gray font-black uppercase tracking-widest">No analytical data found for this period.</div>
          )}
        </div>
        {renderMiningWidgets()}
      </WidgetErrorBoundary>
    </div>
  );
};

export default SalesTab;
