import React, { useState, useEffect, useMemo } from 'react';
import api from '../../../api';
import { useUI } from '../../../context/UIContext';

const CollectionsTab = () => {
  const { showModal, showConfirm } = useUI();
  const [pendingCashTickets, setPendingCashTickets] = useState([]);
  const [isLoadingPendingCash, setIsLoadingPendingCash] = useState(true);
  const [cashSearchQuery, setCashSearchQuery] = useState('');
  const [cashFilterStatus, setCashFilterStatus] = useState('PENDING'); // PENDING or PAID
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPendingCashTickets = async (silent = false) => {
    if (!silent) setIsLoadingPendingCash(true);
    const token = localStorage.getItem('token');
    try {
      const response = await api.get('/admin/pending-cash-tickets', {
        params: { status: cashFilterStatus },
        headers: { Authorization: `Bearer ${token}` },
      });
      // Use functional update to ensure we're working with the latest state
      setPendingCashTickets(response.data || []);
    } catch (error) {
      console.error('Failed to fetch cash tickets', error);
      // Optional: show error message to user
    } finally {
      if (!silent) setIsLoadingPendingCash(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setIsLoadingPendingCash(true);
      const token = localStorage.getItem('token');
      try {
        const response = await api.get('/admin/pending-cash-tickets', {
          params: { status: cashFilterStatus },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (isMounted) {
          setPendingCashTickets(response.data || []);
          setIsLoadingPendingCash(false);
        }
      } catch (error) {
        if (isMounted) {
          console.error('Failed to fetch cash tickets', error);
          setIsLoadingPendingCash(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [cashFilterStatus]);

  const filteredCashTickets = useMemo(() => {
    return pendingCashTickets.filter((ticket) => {
      const query = cashSearchQuery.toLowerCase();
      return (
        ticket._id.toString().toLowerCase().includes(query) ||
        (ticket.userId?.name || '').toLowerCase().includes(query) ||
        (ticket.userId?.email || '').toLowerCase().includes(query) ||
        (ticket.userId?.phone || '').includes(query)
      );
    });
  }, [pendingCashTickets, cashSearchQuery]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchPendingCashTickets(true); // Silent fetch for manual refresh
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleConfirmCash = async (ticketId, amount) => {
    const isConfirmed = await showConfirm(`Confirm collection of ${amount} EGP and activate ticket?`, 'Collect Cash');
    if (!isConfirmed) return;
    const token = localStorage.getItem('token');
    try {
      await api.put(`/admin/activate-cash-ticket/${ticketId}`, {}, { headers: { Authorization: `Bearer ${token}` } });
      showModal('Payment confirmed. Ticket is now active.', 'Success', 'success');
      fetchPendingCashTickets(true); // Silent re-fetch after confirmation
    } catch (err) {
      showModal(err.response?.data?.message || 'Failed to confirm payment.', 'Error', 'error');
    }
  };

  return (
    <div className="mb-10 bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/10 dark:border-gray-700 overflow-hidden transition-all duration-300">
      <div className="bg-smart-bg dark:bg-gray-900 px-8 py-6 border-b border-smart-light/10 flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-xl font-black text-smart-dark dark:text-white flex items-center tracking-tighter uppercase italic">
          <svg className="w-6 h-6 mr-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
          Cash Collections
        </h2>
        <div className="flex items-center text-smart-gray dark:text-gray-400">
          <div className="flex bg-white dark:bg-gray-800 p-1 rounded-xl border border-smart-light/10 mr-4">
            <button onClick={() => setCashFilterStatus('PENDING')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${cashFilterStatus === 'PENDING' ? 'bg-smart-light text-white shadow-md' : 'text-smart-gray hover:text-smart-dark dark:hover:text-white'}`}>Pending</button>
            <button onClick={() => setCashFilterStatus('PAID')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${cashFilterStatus === 'PAID' ? 'bg-smart-light text-white shadow-md' : 'text-smart-gray hover:text-smart-dark dark:hover:text-white'}`}>History</button>
          </div>
          <button onClick={handleManualRefresh} disabled={isRefreshing} className="p-2 hover:bg-smart-light/10 rounded-full transition-colors disabled:opacity-50">
            <svg className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
        </div>
      </div>

      <div className="bg-smart-bg/30 dark:bg-gray-900/30 px-8 py-4 border-b border-smart-light/10">
        <input type="text" placeholder="SEARCH BY NAME, EMAIL, PHONE OR TICKET ID..." value={cashSearchQuery} onChange={e => setCashSearchQuery(e.target.value)} className="w-full pl-6 pr-4 py-3 rounded-2xl border-2 border-smart-light/20 bg-white dark:bg-gray-800 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-mono text-xs font-black tracking-widest" />
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
        {isLoadingPendingCash ? (
          <div className="flex justify-center items-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div></div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-smart-bg dark:bg-gray-900 z-10">
              <tr className="border-b border-smart-light/10 text-smart-gray dark:text-gray-500 text-[10px] font-black uppercase tracking-widest">
                <th className="px-6 py-4">Ticket ID</th>
                <th className="px-6 py-4">Customer Details</th>
                <th className="px-6 py-4 text-center">Amount Due</th>
                <th className="px-6 py-4 text-right pr-8">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-smart-bg dark:divide-gray-700">
              {filteredCashTickets.map(ticket => (
                <tr key={ticket._id} className="hover:bg-smart-bg/50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-5 font-mono text-[11px] font-black text-smart-dark dark:text-white">#{ticket._id.toString().slice(-8).toUpperCase()}</td>
                  <td className="px-6 py-5">
                    <div className="font-black text-smart-dark dark:text-white italic uppercase text-xs">{ticket.userId?.name || 'Unknown User'}</div>
                    <div className="text-[10px] text-smart-gray dark:text-gray-400 font-medium">{ticket.userId?.email || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-5 text-center"><span className="text-lg font-black text-smart-dark dark:text-smart-glow italic">{ticket.price} EGP</span></td>
                  <td className="px-6 py-5 pr-8 text-right">
                    {ticket.paymentStatus === 'PENDING' ? (
                      <button onClick={() => handleConfirmCash(ticket._id, ticket.price)} className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all">Collect & Activate</button>
                    ) : (
                      <span className="bg-smart-light/10 text-smart-dark dark:text-smart-glow text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest border border-smart-light/20">Fully Collected</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CollectionsTab;
