import React, { useState, useEffect, useMemo } from 'react';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';
import WidgetErrorBoundary from '../../../components/WidgetErrorBoundary';

const SalesTab = () => {
  const { showModal } = useUI();
  const [monthlySales, setMonthlySales] = useState([]);
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
      setMonthlySales(res.data || []);
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
    <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden animate-fade-in-up">
      <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex justify-between items-center">
        <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic select-none">
          <svg className="w-6 h-6 mr-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>
          Historical Revenue Analysis
        </h2>
        <button
          onClick={handleExportCSV}
          className="px-6 py-2 bg-smart-light/10 hover:bg-smart-light/20 text-smart-light rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-smart-light/20"
          disabled={monthlySales.length === 0}
        >
          Export CSV
        </button>
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
                    <div className="w-full max-w-[50px] bg-smart-light/20 group-hover:bg-smart-light transition-all rounded-t-xl relative border border-smart-light/30" style={{ height: `${heightPercent}%` }}>
                      <div className="absolute bottom-0 w-full h-1/3 bg-gradient-to-t from-smart-light/50 to-transparent"></div>
                    </div>
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
      </WidgetErrorBoundary>
    </div>
  );
};

export default SalesTab;
