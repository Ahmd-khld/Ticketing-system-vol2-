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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const ticketRef = useRef(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hasDisability, setHasDisability] = useState(false);
  const [message, setMessage] = useState('');

  // Deletion states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteOtp, setDeleteOtp] = useState(['', '', '', '', '', '']);
  const [deleteStep, setDeleteStep] = useState(1); // 1: Password, 2: OTP
  const [isDeleting, setIsDeleting] = useState(false);

  // Secure email-change states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailStep, setEmailStep] = useState(1); // 1: Password, 2: 2FA code, 3: New-email code
  const [emailPassword, setEmailPassword] = useState('');
  const [emailCurrentOtp, setEmailCurrentOtp] = useState(['', '', '', '', '', '']);
  const [emailNewOtp, setEmailNewOtp] = useState(['', '', '', '', '', '']);
  const [emailTempToken, setEmailTempToken] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isEmailProcessing, setIsEmailProcessing] = useState(false);
  const pendingEmailRef = useRef(''); // the desired new email captured at save time

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

    socket.on('ticket_state_updated', handleTicketUpdate);
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
    const emailChanged = email.trim().toLowerCase() !== (user?.email || '').trim().toLowerCase();

    try {
      // Name and phone are immutable; email goes through the secure flow below.
      // Only the accessibility preference is updated directly here.
      await api.put('/users/profile', { hasDisability });

      if (emailChanged) {
        // Kick off the secure email-change dialog: password -> 2FA -> new-email code.
        pendingEmailRef.current = email.trim();
        setEmailPassword('');
        setEmailCurrentOtp(['', '', '', '', '', '']);
        setEmailNewOtp(['', '', '', '', '', '']);
        setEmailTempToken('');
        setEmailError('');
        setEmailStep(1);
        setShowEmailModal(true);
        return;
      }

      setMessage('Profile Updated');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Update failed');
    }
  };

  // Step 1: re-authenticate with password -> sends a 2FA code to the current email.
  const handleEmailInitiate = async (e) => {
    e.preventDefault();
    setIsEmailProcessing(true);
    setEmailError('');
    try {
      await api.post('/users/email-change/initiate', { password: emailPassword });
      setEmailStep(2);
    } catch (error) {
      setEmailError(error.response?.data?.message || 'Verification failed.');
    } finally {
      setIsEmailProcessing(false);
    }
  };

  // Step 2: verify the 2FA code, then immediately register the new email (dup check)
  // which sends a confirmation code to the new address.
  const handleEmailVerify2fa = async (e) => {
    e.preventDefault();
    setIsEmailProcessing(true);
    setEmailError('');
    try {
      const otp = emailCurrentOtp.join('');
      const verifyRes = await api.post('/users/email-change/verify-2fa', { otp });
      const tempToken = verifyRes.data.token;
      setEmailTempToken(tempToken);

      // Duplicate check + send code to the new address.
      await api.post('/users/email-change/set-new-email', {
        newEmail: pendingEmailRef.current,
        token: tempToken,
      });
      setEmailStep(3);
    } catch (error) {
      setEmailError(error.response?.data?.message || 'Verification failed.');
    } finally {
      setIsEmailProcessing(false);
    }
  };

  // Step 3: verify the code sent to the new email -> commit + refresh session token.
  const handleEmailVerifyNew = async (e) => {
    e.preventDefault();
    setIsEmailProcessing(true);
    setEmailError('');
    try {
      const otp = emailNewOtp.join('');
      const res = await api.post('/users/email-change/verify-new', {
        otp,
        token: emailTempToken,
      });

      // Old sessions are invalidated server-side; adopt the fresh token.
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
      }
      setUser((prev) => ({ ...prev, email: res.data.email }));
      setEmail(res.data.email);
      setShowEmailModal(false);
      showModal('Your email address has been updated successfully.', 'Email Updated', 'success');
    } catch (error) {
      setEmailError(error.response?.data?.message || 'Verification failed.');
    } finally {
      setIsEmailProcessing(false);
    }
  };

  const closeEmailModal = () => {
    setShowEmailModal(false);
    setEmailStep(1);
    setEmailPassword('');
    setEmailError('');
    // Revert the form field to the real current email so the UI isn't misleading.
    setEmail(user?.email || '');
  };

  // Generic 6-box OTP input handler bound to a given state setter.
  const handleBoxedOtpChange = (element, index, otpArray, setter) => {
    if (isNaN(element.value)) return false;
    const next = [...otpArray];
    next[index] = element.value;
    setter(next);
    if (element.nextSibling && element.value !== '') {
      element.nextSibling.focus();
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

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchTickets();
    setTimeout(() => setIsRefreshing(false), 500); // Visual feedback duration
  };

  const handleRequestDeletion = async (e) => {
    e.preventDefault();
    setIsDeleting(true);
    const token = localStorage.getItem('token');
    try {
      await api.post('/users/request-deletion', { password: deletePassword }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeleteStep(2);
    } catch (error) {
      showModal(error.response?.data?.message || 'Verification failed', 'Error', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeletion = async (e) => {
    e.preventDefault();
    setIsDeleting(true);
    const token = localStorage.getItem('token');
    try {
      const otpCode = deleteOtp.join('');
      const response = await api.post('/users/confirm-deletion',
        { password: deletePassword, otp: otpCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setUser(prev => ({ ...prev, deletionDate: response.data.deletionDate }));
      setShowDeleteModal(false);
      setDeletePassword('');
      setDeleteOtp(['', '', '', '', '', '']);
      setDeleteStep(1);

      showModal('Account scheduled for deletion. You have 7 days to undo this.', 'Scheduled', 'success');

      // Force logout and redirect to landing page
      setTimeout(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('userId');
        localStorage.removeItem('adminEmail');
        window.location.href = '/?message=' + encodeURIComponent('Account scheduled for deletion. You have been logged out.');
      }, 2000);
    } catch (error) {
      showModal(error.response?.data?.message || 'Deletion failed', 'Error', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    const isConfirmed = await showConfirm(
      'Are you sure you want to keep your account?',
      'Cancel Deletion'
    );
    if (!isConfirmed) return;

    const token = localStorage.getItem('token');
    try {
      await api.post('/users/cancel-deletion', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(prev => ({ ...prev, deletionDate: null }));
      showModal('Account deletion cancelled. Welcome back!', 'Success', 'success');
    } catch (error) {
      showModal('Failed to cancel deletion', 'Error', 'error');
    }
  };

  const handleOtpChange = (element, index) => {
    if (isNaN(element.value)) return false;
    const newOtp = [...deleteOtp];
    newOtp[index] = element.value;
    setDeleteOtp(newOtp);
    if (element.nextSibling && element.value !== '') {
      element.nextSibling.focus();
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
              <div className="flex-1 min-w-0 break-words">
                <h2 className="text-lg md:text-xl font-black capitalize text-smart-dark dark:text-white italic leading-tight mb-1">
                  {user?.name}
                </h2>
                <span className="inline-block px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-gray-100 dark:bg-gray-700 text-smart-gray dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                  {user?.role}
                </span>
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
          {user.deletionDate && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-pulse">
              <div className="flex items-center gap-4 text-center md:text-left">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center text-red-600 dark:text-red-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-black text-red-800 dark:text-red-200 uppercase italic">Account Scheduled for Deletion</h3>
                  <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">
                    Permanent removal on: {new Date(user.deletionDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelDeletion}
                className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg hover:shadow-red-900/20"
              >
                Undo Deletion
              </button>
            </div>
          )}

          {/* INFO TAB */}
          {activeTab === 'info' && (
            <div className="space-y-6 md:space-y-10">
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
                        readOnly
                        disabled
                        title="Your name cannot be changed"
                        className="w-full px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-600 outline-none bg-gray-100 dark:bg-gray-800 font-medium text-sm md:text-base text-smart-gray dark:text-gray-400 cursor-not-allowed"
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
                      readOnly
                      disabled
                      title="Your phone number cannot be changed"
                      className="w-full sm:w-[280px] px-4 md:px-5 py-3 md:py-4 rounded-xl border border-gray-200 dark:border-gray-600 outline-none bg-gray-100 dark:bg-gray-800 font-medium text-sm md:text-base text-smart-gray dark:text-gray-400 cursor-not-allowed"
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

              {/* Luxury Account Closure Trigger - Danger Zone Card */}
              {!user.deletionDate && (
                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 md:p-10 border border-red-100 dark:border-red-900/30 animate-fade-in-up flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-black text-red-600 dark:text-red-400 italic mb-2">Danger Zone</h3>
                    <p className="text-xs font-bold text-smart-gray dark:text-gray-400 uppercase tracking-widest">
                      Permanently close your account and delete all data.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="group relative px-8 py-4 rounded-2xl bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border border-red-200 dark:border-red-900/50 hover:border-red-500 transition-all duration-500 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(239,68,68,0.2)] active:scale-95 flex items-center gap-4 overflow-hidden shrink-0 w-full md:w-auto"
                  >
                    {/* Animated background gradient on hover */}
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/10 to-red-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out"></div>

                    {/* Icon container */}
                    <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-red-50 dark:bg-red-500/10 group-hover:bg-red-100 dark:group-hover:bg-red-500/20 transition-colors duration-500 border border-transparent group-hover:border-red-200 dark:group-hover:border-red-500/30 shrink-0">
                      <svg className="w-4 h-4 text-red-500 transition-transform duration-500 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </div>

                    {/* Text */}
                    <span className="relative text-xs font-black uppercase tracking-[0.2em] text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors duration-500 whitespace-nowrap text-center flex-1 md:flex-none">
                      Close Account
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-10 border border-smart-light/30 dark:border-smart-light/10 animate-fade-in-up">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-3xl font-black text-smart-dark dark:text-white flex items-center italic">
                    Purchase History
                  </h2>
                  <button
                    onClick={handleManualRefresh}
                    disabled={isRefreshing}
                    className="p-2 rounded-full hover:bg-smart-bg dark:hover:bg-gray-700 text-smart-light transition-all disabled:opacity-50"
                    title="Refresh Tickets"
                  >
                    <svg
                      className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <div className="flex bg-smart-bg dark:bg-gray-700 p-1 rounded-xl border border-smart-light/10 overflow-x-auto scrollbar-hide max-w-full">
                  {['all', 'pending', 'active', 'used', 'expired'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setHistoryFilter(status)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${historyFilter === status
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
                                  className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${safeStatus === 'active' && ticket.paymentStatus?.toUpperCase() !== 'PENDING'
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
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
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
      {/* Account Deletion Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border border-red-500/20 transform transition-all animate-scale-up">
            <div className="bg-red-600 p-8 text-center relative">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteStep(1);
                  setDeletePassword('');
                }}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/20">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                {deleteStep === 1 ? 'Verify Identity' : 'Enter 2FA Code'}
              </h2>
              <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">
                {deleteStep === 1 ? 'Enter your password to continue' : `Code sent to ${user.email}`}
              </p>
            </div>

            <div className="p-10">
              {deleteStep === 1 ? (
                <form onSubmit={handleRequestDeletion} className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-smart-dark dark:text-white mb-3 uppercase tracking-widest">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      className="w-full px-6 py-4 rounded-2xl border-2 border-red-100 dark:border-gray-700 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition font-medium"
                      placeholder="••••••••"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isDeleting}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl shadow-xl transition-all hover:-translate-y-1 uppercase tracking-widest text-sm disabled:opacity-50"
                  >
                    {isDeleting ? 'Verifying...' : 'Request Deletion'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleConfirmDeletion} className="space-y-8">
                  <div className="flex justify-between gap-2">
                    {deleteOtp.map((data, index) => (
                      <input
                        key={index}
                        type="text"
                        maxLength="1"
                        required
                        className="w-11 h-12 border-2 border-red-500/30 rounded-xl text-center text-xl font-black bg-red-50/30 dark:bg-gray-700 text-red-600 dark:text-white focus:border-red-500 outline-none transition-all"
                        value={data}
                        onChange={(e) => handleOtpChange(e.target, index)}
                        onFocus={(e) => e.target.select()}
                      />
                    ))}
                  </div>
                  <div className="space-y-4">
                    <button
                      type="submit"
                      disabled={isDeleting}
                      className="w-full py-5 bg-black text-white font-black rounded-2xl shadow-2xl transition-all hover:bg-red-600 uppercase tracking-widest text-xs disabled:opacity-50"
                    >
                      {isDeleting ? 'Confirming...' : 'Confirm Permanent Deletion'}
                    </button>
                    <p className="text-[10px] text-center text-gray-500 font-bold uppercase leading-relaxed">
                      By confirming, your account will be marked for deletion. You will have exactly 7 days to undo this from your profile.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Secure Email-Change Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border border-smart-light/20 transform transition-all animate-scale-up">
            <div className="bg-smart-dark p-8 text-center relative">
              <button
                onClick={closeEmailModal}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/20">
                <svg className="w-10 h-10 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                {emailStep === 1 ? 'Verify Identity' : emailStep === 2 ? 'Two-Factor Check' : 'Confirm New Email'}
              </h2>
              <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-1">
                {emailStep === 1
                  ? 'Enter your password to change your email'
                  : emailStep === 2
                    ? `Code sent to ${user.email}`
                    : `Code sent to ${pendingEmailRef.current}`}
              </p>
            </div>

            <div className="p-10">
              {emailError && (
                <div className="p-4 mb-6 rounded-2xl font-bold text-xs bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                  {emailError}
                </div>
              )}

              {emailStep === 1 && (
                <form onSubmit={handleEmailInitiate} className="space-y-6">
                  <div>
                    <label className="block text-xs font-black text-smart-dark dark:text-white mb-3 uppercase tracking-widest">
                      Current Password
                    </label>
                    <input
                      type="password"
                      required
                      autoFocus
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      className="w-full px-6 py-4 rounded-2xl border-2 border-gray-100 dark:border-gray-700 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/10 focus:border-smart-light outline-none transition font-medium"
                      placeholder="••••••••"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isEmailProcessing}
                    className="w-full py-4 bg-smart-light hover:bg-smart-dark text-white font-black rounded-2xl shadow-xl transition-all hover:-translate-y-1 uppercase tracking-widest text-sm disabled:opacity-50"
                  >
                    {isEmailProcessing ? 'Sending Code...' : 'Send Security Code'}
                  </button>
                </form>
              )}

              {emailStep === 2 && (
                <form onSubmit={handleEmailVerify2fa} className="space-y-8">
                  <div className="flex justify-between gap-2">
                    {emailCurrentOtp.map((data, index) => (
                      <input
                        key={index}
                        type="text"
                        maxLength="1"
                        required
                        className="w-11 h-12 border-2 border-smart-light/30 rounded-xl text-center text-xl font-black bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:border-smart-light outline-none transition-all"
                        value={data}
                        onChange={(e) => handleBoxedOtpChange(e.target, index, emailCurrentOtp, setEmailCurrentOtp)}
                        onFocus={(e) => e.target.select()}
                      />
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={isEmailProcessing}
                    className="w-full py-4 bg-smart-light hover:bg-smart-dark text-white font-black rounded-2xl shadow-xl transition-all hover:-translate-y-1 uppercase tracking-widest text-sm disabled:opacity-50"
                  >
                    {isEmailProcessing ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                </form>
              )}

              {emailStep === 3 && (
                <form onSubmit={handleEmailVerifyNew} className="space-y-8">
                  <div className="flex justify-between gap-2">
                    {emailNewOtp.map((data, index) => (
                      <input
                        key={index}
                        type="text"
                        maxLength="1"
                        required
                        className="w-11 h-12 border-2 border-smart-light/30 rounded-xl text-center text-xl font-black bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:border-smart-light outline-none transition-all"
                        value={data}
                        onChange={(e) => handleBoxedOtpChange(e.target, index, emailNewOtp, setEmailNewOtp)}
                        onFocus={(e) => e.target.select()}
                      />
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={isEmailProcessing}
                    className="w-full py-4 bg-smart-light hover:bg-smart-dark text-white font-black rounded-2xl shadow-xl transition-all hover:-translate-y-1 uppercase tracking-widest text-sm disabled:opacity-50"
                  >
                    {isEmailProcessing ? 'Updating...' : 'Confirm New Email'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
