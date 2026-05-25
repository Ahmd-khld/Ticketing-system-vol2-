import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import { useUI } from '../context/UIContext';
import api from '../api';
import { socket } from '../socket';
import RescheduleModal from '../components/RescheduleModal';

const Profile = () => {
  const [activeTab, setActiveTab] = useState('info');
  const { showModal, showConfirm } = useUI();
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [selectedQrTicket, setSelectedQrTicket] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [reschedulingTicketId, setReschedulingTicketId] = useState(null);
  const ticketRef = useRef(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hasDisability, setHasDisability] = useState(false);
  const [message, setMessage] = useState('');

  const navigate = useNavigate();

  const fetchTickets = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const ticketsRes = await api.get('/tickets/history', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTickets(ticketsRes.data);
      console.log('[Socket Debug] Tickets re-fetched from server');
    } catch (error) {
      console.error('Error re-fetching tickets:', error);
    }
  }, []);

  // Socket connection & Room management
  useEffect(() => {
    if (!user?._id) return;

    const token = localStorage.getItem('token');
    socket.auth = { token };
    socket.connect();
    
    socket.on('connect', () => {
      console.log('[Socket Debug] Connected to server. Socket ID:', socket.id);
      socket.emit('joinUserRoom', String(user._id));
      console.log('[Socket Debug] Emitted joinUserRoom for:', String(user._id));
    });

    const handleTicketUpdate = (payload) => {
      console.log("WebSocket payload received:", payload);
      const updatedTicketData = payload.ticket || {};
      const targetId = String(payload.ticketId || updatedTicketData._id);
      
      if (!targetId) return;

      // UPDATE LOCAL STATE IMMEDIATELY FOR INSTANT FEEDBACK
      setTickets((prev) => {
        const index = prev.findIndex((t) => String(t._id) === targetId);
        
        if (index !== -1) {
          console.log('[Socket Debug] Updating existing ticket via state injection at index:', index);
          const updated = [...prev];
          updated[index] = { 
            ...updated[index], 
            ...updatedTicketData, 
            status: payload.status || updatedTicketData.status || updated[index].status,
            paymentStatus: payload.paymentStatus || updatedTicketData.paymentStatus || updated[index].paymentStatus
          };
          return updated;
        } else {
          console.log('[Socket Debug] Adding new ticket to list via state injection');
          return [updatedTicketData, ...prev];
        }
      });

      // ALSO TRIGGER A BACKGROUND FETCH TO ENSURE FULL DATA INTEGRITY
      fetchTickets();
    };

    const handleRefreshFallback = () => {
      console.log('[Socket Debug] dataRefresh received, forcing ticket re-fetch');
      fetchTickets();
    };

    socket.on('TICKET_STATUS_UPDATED', handleTicketUpdate);
    socket.on('dataRefresh', handleRefreshFallback);

    return () => {
      console.log('[Socket Debug] Cleaning up socket listeners and leaving room.');
      socket.emit('leaveUserRoom', String(user._id));
      socket.off('connect');
      socket.off('TICKET_STATUS_UPDATED', handleTicketUpdate);
      socket.off('dataRefresh', handleRefreshFallback);
    };
  }, [user?._id, fetchTickets]);

  useEffect(() => {
    const fetchAllData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/');
        return;
      }

      try {
        // Fetch Profile & Cards
        const profileRes = await api.get('/users/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = profileRes.data;
        setUser(data);
        setName(data.name);
        setEmail(data.email);
        setPhone(data.phone);
        setHasDisability(data.hasDisability);

        // Fetch Tickets initial
        fetchTickets();
      } catch (error) {
        console.error('Error fetching profile data:', error);
        if (error.response?.status === 401) {
          navigate('/');
        }
      }
    };

    fetchAllData();
  }, [navigate, fetchTickets]);

  const handleUpdateInfo = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    try {
      await api.put(
        '/users/profile',
        { name, email, phone, hasDisability },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setMessage('Profile Updated');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Update failed');
    }
  };

  const handleDeleteCard = async (cardId) => {
    const token = localStorage.getItem('token');
    try {
      const response = await api.delete(`/users/profile/cards/${cardId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser((prev) => ({ ...prev, savedCards: response.data.savedCards }));
    } catch (error) {
      console.error('Failed to delete card:', error);
    }
  };

  const handleCancelTicket = async (ticketId) => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to cancel this ticket? A refund will be initiated.',
      'Cancel Ticket'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.patch(
        `/tickets/${ticketId}/cancel`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setTickets((prev) => prev.map((t) => (t._id === ticketId ? { ...t, status: 'cancelled' } : t)));
      if (selectedQrTicket?._id === ticketId) setSelectedQrTicket(null);
      showModal(
        'Ticket cancelled successfully! Your refund has been initiated.',
        'Success',
        'success'
      );
    } catch (error) {
      showModal(
        error.response?.data?.message || 'Network error while cancelling ticket.',
        'Error',
        'error'
      );
    }
  };

  const handleRescheduleTicket = (ticketId) => {
    setReschedulingTicketId(ticketId);
  };

  const handleDownloadTicket = async () => {
    if (!ticketRef.current) return;
    
    try {
      const canvas = await html2canvas(ticketRef.current, {
        backgroundColor: '#0B4228', // Matches smart-dark primary color
        scale: 2, // Higher quality
        logging: false,
        useCORS: true,
      });
      
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `SmartGarden-Ticket-${selectedQrTicket._id.slice(-8)}.png`;
      link.click();
    } catch (error) {
      console.error('Download failed:', error);
      showModal('Failed to generate ticket image. Please try again.', 'Download Error', 'error');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-black flex items-center justify-center transition-colors">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-smart-light"></div>
      </div>
    );
  }

  console.log("Re-rendering ticket list", tickets);
  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black py-6 md:py-12 px-4 md:px-6 font-sans text-smart-gray dark:text-gray-300 transition-colors duration-300">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 md:gap-10">
        {/* Sidebar */}
        <div className="w-full md:w-1/4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 md:p-8 border border-smart-light/30 dark:border-smart-light/10 md:sticky md:top-28">
            <div className="flex items-center space-x-4 mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-100 dark:border-gray-700">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-smart-light/10 rounded-full flex items-center justify-center text-smart-light font-black text-xl md:text-2xl uppercase shadow-inner border border-smart-light/20 shrink-0">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="overflow-hidden">
                <h2 className="text-lg md:text-xl font-black capitalize text-smart-dark dark:text-white italic truncate">
                  {user?.name}
                </h2>
                <p className="text-xs md:text-sm text-smart-gray dark:text-gray-400 font-medium">
                  {user?.role}
                </p>
              </div>
            </div>

            <nav className="flex flex-row md:flex-col gap-2 md:space-y-3 overflow-x-auto scrollbar-hide md:overflow-visible">
              {[
                { id: 'info', label: 'Info', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                { id: 'history', label: 'History', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
                { id: 'cards', label: 'Cards', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 md:w-full flex items-center justify-center md:justify-start space-x-2 md:space-x-3 px-4 md:px-5 py-3 md:py-4 rounded-xl md:rounded-2xl font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-smart-dark dark:bg-smart-light text-white dark:text-smart-dark shadow-md scale-105 md:scale-100' : 'text-smart-gray dark:text-gray-400 hover:bg-smart-bg dark:hover:bg-gray-700'}`}
                >
                  <svg className="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
                  </svg>
                  <span className="text-xs md:text-base">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="w-full md:w-3/4">
          {/* INFO TAB */}
          {activeTab === 'info' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 md:p-10 border border-smart-light/30 dark:border-smart-light/10 animate-fade-in-up">
              <h2 className="text-2xl md:text-3xl font-black text-smart-dark dark:text-white mb-6 md:mb-8 flex items-center italic">
                Personal Information
              </h2>

              {message && (
                <div
                  className={`p-4 md:p-5 mb-6 md:mb-8 rounded-2xl font-bold text-xs md:text-sm shadow-sm ${message.includes('Updated') ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}
                >
                  {message}
                </div>
              )}

              <form onSubmit={handleUpdateInfo} className="space-y-4 md:space-y-6 max-w-2xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <div>
                    <label className="block text-[10px] md:text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wide">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition bg-smart-bg dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 font-medium text-sm md:text-base text-smart-dark dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] md:text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wide">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition bg-smart-bg dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 font-medium text-sm md:text-base text-smart-dark dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] md:text-sm font-extrabold text-smart-dark dark:text-white mb-2 uppercase tracking-wide">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition bg-smart-bg dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 font-medium max-w-md text-sm md:text-base text-smart-dark dark:text-white"
                  />
                </div>

                <div className="flex items-center p-4 md:p-5 bg-smart-bg dark:bg-gray-700 rounded-2xl border border-smart-light/10 max-w-md">
                  <input
                    type="checkbox"
                    id="disability"
                    checked={hasDisability}
                    onChange={(e) => setHasDisability(e.target.checked)}
                    className="w-5 h-5 md:w-6 md:h-6 text-smart-light border-gray-300 dark:border-gray-500 rounded focus:ring-smart-light cursor-pointer"
                  />
                  <div className="ml-3 md:ml-4">
                    <label
                      htmlFor="disability"
                      className="block text-xs md:text-sm font-black text-smart-dark dark:text-white cursor-pointer italic"
                    >
                      Require accessibility features
                    </label>
                    <p className="text-[10px] md:text-xs text-smart-gray dark:text-gray-400 font-medium mt-1">
                      Wheelchair access, prioritized seating, etc.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full md:w-auto mt-6 md:mt-8 px-10 py-4 bg-smart-light hover:bg-smart-dark text-white rounded-full font-black text-base md:text-lg transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 uppercase tracking-widest"
                >
                  Save Changes
                </button>
              </form>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-10 border border-smart-light/30 dark:border-smart-light/10 animate-fade-in-up">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <h2 className="text-3xl font-black text-smart-dark dark:text-white flex items-center italic">
                  Purchase History
                </h2>
                <div className="flex bg-smart-bg dark:bg-gray-700 p-1 rounded-xl border border-smart-light/10 overflow-x-auto scrollbar-hide max-w-full">
                  {['all', 'pending', 'active', 'used', 'expired'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setHistoryFilter(status)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                        historyFilter === status
                          ? 'bg-smart-light text-white shadow-sm'
                          : 'text-smart-gray dark:text-gray-400 hover:text-smart-dark dark:hover:text-white'
                      }`}
                    >
                      {status === 'pending' ? 'Pending Cash' : status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                {tickets.filter(t => {
                  const safeStatus = t.status ? t.status.toLowerCase() : '';
                  if (historyFilter === 'all') return true;
                  if (historyFilter === 'pending') {
                    return t.paymentMethod === 'CASH' && t.paymentStatus?.toUpperCase() === 'PENDING';
                  }
                  if (historyFilter === 'active') {
                    return safeStatus === 'active' && t.paymentStatus?.toUpperCase() !== 'PENDING';
                  }
                  return safeStatus === historyFilter;
                }).length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-smart-light/20 rounded-3xl bg-smart-bg dark:bg-gray-700">
                    <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-smart-light/10 shadow-sm">
                      <svg
                        className="w-10 h-10 text-smart-light/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                        ></path>
                      </svg>
                    </div>
                    <p className="text-smart-gray dark:text-gray-400 font-bold text-lg">
                      No {historyFilter !== 'all' ? historyFilter : ''} tickets found.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {tickets
                      .filter((t) => {
                        const safeStatus = t.status ? t.status.toLowerCase() : '';
                        if (historyFilter === 'all') return true;
                        if (historyFilter === 'pending') {
                          return t.paymentMethod === 'CASH' && t.paymentStatus?.toUpperCase() === 'PENDING';
                        }
                        if (historyFilter === 'active') {
                          return safeStatus === 'active' && t.paymentStatus?.toUpperCase() !== 'PENDING';
                        }
                        return safeStatus === historyFilter;
                      })
                      .map((ticket) => {
                        const safeStatus = ticket.status ? ticket.status.toLowerCase() : '';
                        return (
                      <div
                        key={ticket._id}
                        className="bg-white dark:bg-gray-700 rounded-3xl shadow-md border border-smart-light/20 p-8 hover:shadow-lg transition-all duration-300 animate-fade-in flex flex-col justify-between h-full"
                      >
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <span
                              className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${
                                safeStatus === 'active' && ticket.paymentStatus?.toUpperCase() !== 'PENDING'
                                  ? 'bg-smart-light/20 text-smart-dark dark:text-smart-light border border-smart-light/30'
                                  : (ticket.paymentMethod === 'CASH' && ticket.paymentStatus?.toUpperCase() === 'PENDING')
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                    : safeStatus === 'used'
                                      ? 'bg-gray-100 dark:bg-gray-600 text-smart-gray dark:text-gray-400 border border-gray-200 dark:border-gray-500 opacity-60'
                                      : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-900 opacity-60'
                              }`}
                            >
                              {(ticket.paymentMethod === 'CASH' && ticket.paymentStatus?.toUpperCase() === 'PENDING') ? 'Pending Cash' : ticket.status}
                            </span>
                            <h3 className="text-2xl font-black text-smart-dark dark:text-white capitalize mt-3 italic">
                              {ticket.ticketType} Pass
                            </h3>
                            <p className="text-sm font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest mt-1">
                              {ticket.subscriptionPlan} Subscription
                            </p>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <p className="text-3xl font-black text-smart-dark dark:text-smart-glow mb-2">
                              {ticket.price}{' '}
                              <span className="text-sm text-smart-gray dark:text-gray-400 italic">
                                EGP
                              </span>
                            </p>
                            {ticket.isPromoApplied && (
                              <div className="mb-4 text-right">
                                <p className="text-[10px] font-black text-gray-400 line-through">
                                  WAS {ticket.originalPrice} EGP
                                </p>
                                <p className="text-[10px] font-black text-green-500 uppercase tracking-tighter">
                                  (Promo Applied) - {ticket.promoCodeName}
                                </p>
                              </div>
                            )}
                            {safeStatus === 'active' && (
                              <button
                                onClick={() => setSelectedQrTicket(ticket)}
                                className="text-xs bg-smart-light hover:bg-smart-dark text-white font-black uppercase tracking-widest py-3 px-6 rounded-xl shadow-lg transition-all active:scale-95"
                              >
                                Show QR Code
                              </button>
                            )}
                          </div>
                        </div>

                        {safeStatus === 'active' && (
                          <div className="flex gap-3 mt-auto mb-4">
                            {ticket.subscriptionPlan === 'one-time' && !ticket.hasRescheduled && (
                              <button
                                onClick={() => handleRescheduleTicket(ticket._id)}
                                className="text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                              >
                                Change Date
                              </button>
                            )}
                            <button
                              onClick={() => handleCancelTicket(ticket._id)}
                              className="text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              Cancel & Refund
                            </button>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-sm font-medium text-smart-gray/50 dark:text-gray-500 pt-4 border-t border-gray-100 dark:border-gray-600">
                          <p className="font-mono text-xs">ID: {ticket._id.slice(-8)}</p>
                          <p>
                            {new Date(ticket.validFrom || ticket.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CARDS TAB */}
          {activeTab === 'cards' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-10 border border-smart-light/30 dark:border-smart-light/10 animate-fade-in-up">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black text-smart-dark dark:text-white flex items-center italic">
                  Saved Cards
                </h2>
              </div>

              <div className="space-y-6 max-w-2xl">
                {!user.savedCards || user.savedCards.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed border-smart-light/20 rounded-3xl bg-smart-bg dark:bg-gray-700">
                    <div className="w-20 h-20 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-smart-light/10 shadow-sm">
                      <svg
                        className="w-10 h-10 text-smart-light/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                        ></path>
                      </svg>
                    </div>
                    <p className="text-smart-gray dark:text-gray-400 font-bold text-lg">
                      No saved cards found.
                    </p>
                  </div>
                ) : (
                  user.savedCards.map((card) => (
                    <div
                      key={card._id}
                      className="flex items-center justify-between p-6 bg-gradient-to-r from-smart-dark to-black rounded-2xl shadow-xl text-white transform transition hover:-translate-y-1 border border-white/5"
                    >
                      <div className="flex items-center space-x-6">
                        <div className="w-16 h-12 bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 flex items-center justify-center">
                          <svg
                            className="w-8 h-8 text-smart-glow"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                            ></path>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm text-smart-glow font-bold uppercase tracking-widest mb-1">
                            Credit Card
                          </p>
                          <p className="text-xl font-mono tracking-widest">
                            •••• •••• •••• {card.last4Digits}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteCard(card._id)}
                        className="p-3 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl transition-all border border-red-500/20 hover:border-transparent group"
                        title="Delete Card"
                      >
                        <svg
                          className="w-6 h-6 transform group-hover:scale-110 transition"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {reschedulingTicketId && (
        <RescheduleModal
          ticketId={reschedulingTicketId}
          onClose={() => setReschedulingTicketId(null)}
          onSuccess={(updatedTicket) => {
            setTickets((prev) => prev.map((t) => (t._id === updatedTicket._id ? updatedTicket : t)));
            setReschedulingTicketId(null);
            showModal(
              'Ticket rescheduled successfully! Your new date has been confirmed.',
              'Success',
              'success'
            );
          }}
        />
      )}

      {/* QR MODAL OVERLAY */}
      {selectedQrTicket && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 animate-fade-in"
          onClick={() => setSelectedQrTicket(null)}
        >
          <div 
            ref={ticketRef}
            className="bg-white dark:bg-gray-800 w-full max-w-[350px] rounded-[40px] shadow-2xl overflow-hidden border border-smart-light/20 transform transition-all animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-smart-dark p-6 border-b border-white/10 text-center relative">
              <button 
                onClick={() => setSelectedQrTicket(null)}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="text-xl font-black text-smart-glow italic uppercase tracking-tighter text-white">
                Entry Pass
              </h2>
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-1">
                Scan at Gate Scanner
              </p>
            </div>

            <div className="p-6 flex flex-col items-center space-y-4">
              <div className="w-48 h-48 mx-auto bg-white p-2 rounded-xl border-[4px] border-smart-dark shadow-xl flex items-center justify-center transform hover:scale-105 transition-transform duration-500">
                <QRCodeSVG value={selectedQrTicket._id} size={160} level="H" />
              </div>

              <div className="bg-smart-bg dark:bg-gray-700 px-6 py-2 rounded-2xl border border-smart-light/10 w-full text-center shadow-inner">
                <p className="text-[10px] text-smart-gray dark:text-gray-400 font-bold uppercase tracking-widest mb-1">
                  Unique Ticket ID
                </p>
                <p className="font-mono text-sm font-black text-smart-dark dark:text-white select-all tracking-widest">
                  {selectedQrTicket._id}
                </p>
              </div>

              {selectedQrTicket.validFrom && (
                <div className="text-center w-full">
                  {selectedQrTicket.subscriptionPlan === 'monthly' ? (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest">Validity Period</p>
                      <p className="font-extrabold text-smart-dark dark:text-white text-sm">
                        {new Date(selectedQrTicket.validFrom).toLocaleDateString()} — {new Date(selectedQrTicket.validUntil).toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest">Valid Date</p>
                      <p className="font-extrabold text-smart-light text-sm">
                        {new Date(selectedQrTicket.validFrom).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2 w-full pt-2">
                <button
                  onClick={handleDownloadTicket}
                  className="w-full py-3 bg-smart-light hover:bg-smart-dark text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-smart-light/20 transition-all active:scale-95"
                >
                  Download Ticket
                </button>

                <button
                  onClick={() => setSelectedQrTicket(null)}
                  className="w-full py-3 bg-smart-dark dark:bg-smart-light text-white dark:text-smart-dark font-black uppercase tracking-widest text-xs rounded-xl shadow-lg hover:shadow-smart-light/20 transition-all active:scale-95"
                >
                  Close Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
