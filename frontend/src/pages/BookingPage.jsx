import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Smile, Meh, Frown } from 'lucide-react';
import { socket } from '../socket';
import WeatherWidget from '../components/WeatherWidget';
import api from '../api';

const pricingTiers = {
  'one-time': {
    child: parseInt(import.meta.env.VITE_TICKET_PRICE_CHILD_DAILY) || 100,
    adult: parseInt(import.meta.env.VITE_TICKET_PRICE_ADULT_DAILY) || 200,
    senior: parseInt(import.meta.env.VITE_TICKET_PRICE_SENIOR_DAILY) || 150,
  },
  monthly: {
    child: parseInt(import.meta.env.VITE_TICKET_PRICE_CHILD_MONTHLY) || 1500,
    adult: parseInt(import.meta.env.VITE_TICKET_PRICE_ADULT_MONTHLY) || 3000,
    senior: parseInt(import.meta.env.VITE_TICKET_PRICE_SENIOR_MONTHLY) || 2000,
  },
};

const BookingPage = () => {
  const [tickets, setTickets] = useState({ child: 0, adult: 0, senior: 0 });
  const [subscriptionType, setSubscriptionType] = useState('one-time');
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [insightStartDate, setInsightStartDate] = useState(new Date());
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
  const dateMenuRef = useRef(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const wonPromoCode = location.state?.wonPromoCode;

  const getWeekWindow = () => {
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return { weekStart, weekEnd };
  };

  const { weekStart, weekEnd } = getWeekWindow();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dateMenuRef.current && !dateMenuRef.current.contains(event.target)) {
        setIsDateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchInsights = React.useCallback(async () => {
    setLoadingInsights(true);
    try {
      const token = localStorage.getItem('token');
      const dateStr = insightStartDate.toISOString().split('T')[0];
      const response = await api.get('/tickets/insights', {
        params: { startDate: dateStr },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setInsights(response.data);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    } finally {
      setLoadingInsights(false);
    }
  }, [insightStartDate]);

  useEffect(() => {
    fetchInsights();
    const onUpdate = () => fetchInsights();
    socket.on('totalTicketsUpdate', onUpdate);
    socket.on('dashboardStatsUpdated', onUpdate);
    socket.on('crowdDataUpdated', onUpdate);
    socket.on('dataRefresh', onUpdate);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('totalTicketsUpdate', onUpdate);
      socket.off('dashboardStatsUpdated', onUpdate);
      socket.off('crowdDataUpdated', onUpdate);
      socket.off('dataRefresh', onUpdate);
    };
  }, [fetchInsights]);

  const currentPrices = pricingTiers[subscriptionType];
  const totalTickets = tickets.child + tickets.adult + tickets.senior;
  const dailyCapacity = parseInt(import.meta.env.VITE_DAILY_CAPACITY) || 1000;

  const handleIncrement = (type) => {
    let remainingCapacity = dailyCapacity;
    if (subscriptionType === 'one-time' && selectedDate && insights) {
      const dayData = insights.days.find((d) => d.date === selectedDate);
      if (dayData) remainingCapacity = (insights.capacity || dailyCapacity) - dayData.count;
    }
    if (totalTickets >= remainingCapacity) {
      setError(`Capacity reached. Only ${remainingCapacity} spots left.`);
      return;
    }
    setError('');
    setTickets((prev) => ({ ...prev, [type]: prev[type] + 1 }));
  };

  const handleDecrement = (type) => {
    setError('');
    setTickets((prev) => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
  };

  const totalPrice = tickets.child * currentPrices.child + tickets.adult * currentPrices.adult + tickets.senior * currentPrices.senior;

  const handleProceed = (e) => {
    e.preventDefault();
    if (totalPrice === 0) return setError('Please select at least one ticket.');
    if (subscriptionType === 'one-time' && !selectedDate) return setError('Please select a visit date.');
    navigate('/payment', { state: { tickets, subscriptionType, totalPrice, selectedDate, wonPromoCode } });
  };

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black flex flex-col transition-colors duration-300">
      <main className="flex-grow max-w-5xl mx-auto px-4 sm:px-6 py-6 md:py-12 flex items-center justify-center w-full">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row w-full border border-smart-light/30 dark:border-smart-light/10">
          <div className="bg-smart-dark p-6 md:p-10 text-white flex-1 flex flex-col justify-between">
            <div>
              <h2 className="text-2xl md:text-4xl font-extrabold mb-4 md:mb-6 text-smart-glow">Select Your Passes</h2>
              <p className="text-white/80 text-base md:text-lg mb-6 md:mb-8 leading-relaxed">
                Choose the tickets that best fit your group. Our monthly subscriptions offer unlimited access to all IoT park features.
              </p>
              <div className="my-6 md:my-10 w-full flex justify-center">
                <WeatherWidget />
              </div>
            </div>
            <div className="space-y-4 md:space-y-6">
              {["Access to all inclusive paths", "Smart app navigation", "Priority support"].map((text, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="bg-white/10 p-2 rounded-lg">
                    <svg className="w-6 h-6 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-lg font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 md:p-10 flex-1 bg-white dark:bg-gray-800 flex flex-col justify-center">
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-200 rounded-r-lg font-medium shadow-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleProceed} className="space-y-6 md:space-y-8">
              <div>
                <label className="block text-[10px] md:text-sm font-extrabold text-smart-dark dark:text-white mb-3 uppercase tracking-wider">Duration</label>
                <div className="grid grid-cols-2 gap-4">
                  <label className={`cursor-pointer border-2 rounded-xl p-4 text-center transition-all ${subscriptionType === 'one-time' ? 'border-smart-light bg-smart-light/5 dark:bg-smart-light/10 text-smart-dark dark:text-white font-extrabold scale-105' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-smart-light/40'}`}>
                    <input type="radio" className="hidden" checked={subscriptionType === 'one-time'} onChange={() => setSubscriptionType('one-time')} />
                    <div className="text-lg">One-Time</div>
                    <div className="text-[10px] opacity-80 font-normal">24h Access</div>
                  </label>
                  <label className={`relative cursor-pointer border-2 rounded-xl p-4 text-center transition-all ${subscriptionType === 'monthly' ? 'border-smart-light bg-smart-light/5 dark:bg-smart-light/10 text-smart-dark dark:text-white font-extrabold scale-105' : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-smart-light/40'}`}>
                    <input type="radio" className="hidden" checked={subscriptionType === 'monthly'} onChange={() => setSubscriptionType('monthly')} />
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full">Best Value!</span>
                    <div className="text-lg">Monthly</div>
                    <div className="text-[10px] opacity-80 font-normal">Unlimited</div>
                  </label>
                </div>
              </div>

              {subscriptionType === 'one-time' && (
                <div className="animate-fade-in-up relative" ref={dateMenuRef}>
                  <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-4 uppercase tracking-wider">Select Visit Date</label>
                  <div 
                    onClick={() => setIsDateMenuOpen(!isDateMenuOpen)}
                    className={`w-full px-6 py-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center group ${isDateMenuOpen ? 'border-smart-light bg-white dark:bg-gray-700 ring-4 ring-smart-light/10 shadow-lg' : 'border-gray-200 dark:border-gray-700 bg-smart-bg dark:bg-gray-900 hover:border-smart-light/40'}`}
                  >
                    <div className="flex items-center space-x-3">
                      <svg className={`w-5 h-5 ${isDateMenuOpen ? 'text-smart-light' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className={`font-black uppercase tracking-widest text-xs ${selectedDate ? 'text-smart-dark dark:text-white' : 'text-gray-400'}`}>
                        {selectedDate ? (
                          (() => {
                            const day = insights?.days.find(d => d.date === selectedDate);
                            return day ? `${day.dayName} - ${day.displayDate}` : selectedDate;
                          })()
                        ) : 'CHOOSE A VISIT DATE'}
                      </span>
                    </div>
                    <svg className={`w-5 h-5 text-gray-400 transition-transform ${isDateMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {isDateMenuOpen && (
                    <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-gray-800 border-2 border-smart-light/20 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-fade-in py-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                      {insights?.days.map((day) => {
                        const isSoldOut = day.count >= (insights?.capacity || 200);
                        return (
                          <div
                            key={day.date}
                            onClick={() => { if (!isSoldOut) { setSelectedDate(day.date); setIsDateMenuOpen(false); } }}
                            className={`px-6 py-4 flex justify-between items-center transition-colors cursor-pointer ${selectedDate === day.date ? 'bg-smart-light text-white' : isSoldOut ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-900/50' : 'hover:bg-smart-light/10 text-smart-dark dark:text-gray-200'}`}
                          >
                            <span className="font-black uppercase tracking-widest text-xs italic">
                              {day.dayName} - {day.displayDate}
                            </span>
                            {isSoldOut && <span className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase">Sold Out</span>}
                            {selectedDate === day.date && !isSoldOut && <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {Object.keys(tickets).map((type) => (
                  <div key={type} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-smart-light/40 transition-colors">
                    <div>
                      <h4 className="font-bold text-smart-dark dark:text-white text-lg capitalize">{type}</h4>
                      <p className="text-sm text-smart-light font-bold">{currentPrices[type]} EGP</p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <button type="button" onClick={() => handleDecrement(type)} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 flex items-center justify-center font-bold">-</button>
                      <span className="font-extrabold text-xl w-6 text-center text-smart-dark dark:text-white">{tickets[type]}</span>
                      <button type="button" onClick={() => handleIncrement(type)} className="w-10 h-10 rounded-full bg-smart-light/10 text-smart-light hover:bg-smart-light/20 flex items-center justify-center font-bold">+</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-between items-end">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-1">Total Price</p>
                  <p className="text-4xl font-black text-smart-dark dark:text-smart-glow">{totalPrice} <span className="text-xl text-gray-500 font-medium italic">EGP</span></p>
                </div>
                <button type="submit" className="bg-smart-light hover:bg-smart-dark text-white font-extrabold py-4 px-8 rounded-xl transition-all shadow-xl hover:-translate-y-1">Confirm Booking</button>
              </div>
            </form>

            {/* Availability Window (Original Greyish Style - Integrated) */}
            <div className="mt-12 bg-gray-50 dark:bg-gray-900 rounded-[40px] border-l-[8px] border-[#047857] overflow-hidden relative transition-all shadow-2xl border border-gray-100 dark:border-gray-800">
              <div className="p-8 sm:p-10">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#047857]/10 rounded-xl">
                      <svg className="w-6 h-6 text-smart-dark dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    </div>
                    <h3 className="text-lg font-black text-smart-dark dark:text-white italic uppercase tracking-wider">Availability Window</h3>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setInsightStartDate(p => new Date(new Date(p).setDate(p.getDate() - 7)))} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition text-smart-dark dark:text-white font-bold">
                      &larr; Prev
                    </button>
                    <button type="button" onClick={() => setInsightStartDate(new Date())} className="px-4 py-1 bg-smart-light/10 text-smart-light rounded-lg text-xs font-bold hover:bg-smart-light/20 transition">
                      Today
                    </button>
                    <button type="button" onClick={() => setInsightStartDate(p => new Date(new Date(p).setDate(p.getDate() + 7)))} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-lg text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition text-smart-dark dark:text-white font-bold">
                      Next &rarr;
                    </button>
                  </div>
                </div>

                {loadingInsights ? (
                  <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-smart-light"></div></div>
                ) : insights ? (
                  <>
                    <div className="grid grid-cols-7 gap-2 w-full mt-4 mb-10">
                      {insights.days.map((day, idx) => {
                        const isSelected = selectedDate === day.date;
                        const isToday = day.isToday;
                        const isSoldOut = day.count >= (insights?.capacity || 200);
                        return (
                          <div 
                            key={idx} 
                            className={`flex flex-col items-center justify-center py-4 px-1 rounded-2xl transition-all cursor-default min-w-0 overflow-hidden border-2 ${       
                              isSelected
                                ? 'bg-white dark:bg-[#2a303c] border-[#8cc63f] ring-4 ring-[#8cc63f]/10 shadow-lg z-10 scale-[1.05]'
                                : isToday
                                  ? 'bg-green-500/10 dark:bg-green-500/5 border-green-500/50 hover:bg-green-500/20'
                                  : 'bg-white dark:bg-gray-800 border-transparent hover:bg-gray-50 dark:hover:bg-[#2a303c] hover:border-black/5 dark:hover:border-white/10 shadow-sm'
                            } ${isSoldOut ? 'opacity-40 grayscale-[0.5]' : ''}`}
                          >
                            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-tight w-full text-center">      
                              {day.dayName.slice(0, 3)}
                            </div>
                            <div
                              className={`text-2xl md:text-3xl font-black my-1 italic tracking-tighter shrink-0 ${
                                day.crowdLevel === 'quiet' ? 'text-green-500' : 
                                day.crowdLevel === 'moderate' ? 'text-yellow-500' : 
                                'text-red-500'
                              }`}
                            >
                              {day.count}
                            </div>
                            <div className="mt-1 flex justify-center items-center w-full">
                              {day.crowdLevel === 'quiet' ? (
                                <Smile className="w-6 h-6 text-green-500" />
                              ) : day.crowdLevel === 'moderate' ? (
                                <Meh className="w-6 h-6 text-yellow-500" />
                              ) : (
                                <Frown className="w-6 h-6 text-red-500" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-6 mt-6 pt-8 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500/5 rounded-full border border-green-500/10 shadow-sm">
                        <Smile className="w-4 h-4 text-green-500 shrink-0" />
                        <span className="text-gray-500 dark:text-gray-400 text-[10px] font-black uppercase tracking-widest">Quiet (0-30%)</span>
                      </div>
                      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500/5 rounded-full border border-yellow-500/10 shadow-sm">
                        <Meh className="w-4 h-4 text-yellow-500 shrink-0" />
                        <span className="text-gray-500 dark:text-gray-400 text-[10px] font-black uppercase tracking-widest">Moderate (31-70%)</span>
                      </div>
                      <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/5 rounded-full border border-red-500/10 shadow-sm">
                        <Frown className="w-4 h-4 text-red-500" />
                        <span className="text-gray-500 dark:text-gray-400 text-[10px] font-black uppercase tracking-widest">Busy (71-100%)</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-16 text-center text-gray-400 font-bold uppercase tracking-[0.2em] italic border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl">System Insights Offline</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BookingPage;
