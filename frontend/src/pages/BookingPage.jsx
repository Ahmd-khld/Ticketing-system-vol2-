import React, { useState, useEffect } from 'react';
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

const getCrowdColor = (level) => {
  switch (level) {
    case 'quiet':
      return 'bg-green-500';
    case 'moderate':
      return 'bg-yellow-500';
    case 'busy':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
};

const getCrowdText = (level) => {
  switch (level) {
    case 'quiet':
      return 'Quiet';
    case 'moderate':
      return 'Moderate';
    case 'busy':
      return 'Busy';
    default:
      return 'Unknown';
  }
};

const BookingPage = () => {
  const [tickets, setTickets] = useState({
    child: 0,
    adult: 0,
    senior: 0,
  });
  const [subscriptionType, setSubscriptionType] = useState('one-time');
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [insightStartDate, setInsightStartDate] = useState(new Date());
  const navigate = useNavigate();
  const location = useLocation();

  const wonPromoCode = location.state?.wonPromoCode;

  // Calculate week window (today through today + 6 days) using local midnight
  const getWeekWindow = () => {
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return { weekStart, weekEnd };
  };

  const { weekStart, weekEnd } = getWeekWindow();

  // Format dates for input (YYYY-MM-DD)
  const formatDateForInput = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const minDate = formatDateForInput(weekStart);
  const maxDate = formatDateForInput(weekEnd);

  // Fetch crowd insights
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

    // Listen for real-time ticket updates to refresh insights
    const onUpdate = () => {
      console.log('🔄 Refreshing crowd insights via socket signal');
      fetchInsights();
    };

    socket.on('totalTicketsUpdate', onUpdate);
    socket.on('dashboardStatsUpdated', onUpdate);
    socket.on('crowdDataUpdated', onUpdate);
    socket.on('dataRefresh', onUpdate);

    // Connect if not connected
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('totalTicketsUpdate', onUpdate);
      socket.off('dashboardStatsUpdated', onUpdate);
      socket.off('crowdDataUpdated', onUpdate);
      socket.off('dataRefresh', onUpdate);
    };
  }, [fetchInsights]);

  useEffect(() => {
    // Poll every 60 seconds as a fallback
    const interval = setInterval(fetchInsights, 60000);
    return () => clearInterval(interval);
  }, [fetchInsights]);

  const currentPrices = pricingTiers[subscriptionType];

  // Redirect to login if no token is found
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
    }
  }, [navigate]);

  const totalTickets = tickets.child + tickets.adult + tickets.senior;

  const dailyCapacity = parseInt(import.meta.env.VITE_DAILY_CAPACITY) || 1000;

  const handleIncrement = (type) => {
    // Dynamically calculate actual remaining capacity for the selected date
    let remainingCapacity = dailyCapacity;
    if (subscriptionType === 'one-time' && selectedDate && insights) {
      const dayData = insights.days.find((d) => d.date === selectedDate);
      if (dayData) {
        remainingCapacity = (insights.capacity || dailyCapacity) - dayData.count;
      }
    }

    if (totalTickets >= remainingCapacity) {
      setError(
        `Capacity reached. You can only add ${remainingCapacity} tickets for this selection.`
      );
      return;
    }
    setError('');
    setTickets((prev) => ({ ...prev, [type]: prev[type] + 1 }));
  };

  const handleDecrement = (type) => {
    setError('');
    setTickets((prev) => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
  };

  const totalPrice =
    tickets.child * currentPrices.child +
    tickets.adult * currentPrices.adult +
    tickets.senior * currentPrices.senior;

  const handleProceed = (e) => {
    e.preventDefault();
    setError('');

    if (totalPrice === 0) {
      setError('Please select at least one ticket to proceed.');
      return;
    }

    if (!subscriptionType) {
      setError('Please select a subscription duration.');
      return;
    }

    if (subscriptionType === 'one-time' && !selectedDate) {
      setError('Please select a visit date.');
      return;
    }

    navigate('/payment', {
      state: {
        tickets,
        subscriptionType,
        totalPrice,
        selectedDate,
        wonPromoCode,
      },
    });
  };

  // Check if a specific date is sold out
  const isDateSoldOut = (dateStr) => {
    if (!insights) return false;
    const day = insights.days.find((d) => d.date === dateStr);
    return day && day.count >= insights.capacity;
  };

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black flex flex-col transition-colors duration-300">
      <main className="flex-grow max-w-5xl mx-auto px-4 sm:px-6 py-6 md:py-12 flex items-center justify-center w-full">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row w-full border border-smart-light/30 dark:border-smart-light/10">
          {/* Info Side */}
          <div className="bg-smart-dark p-6 md:p-10 text-white flex-1 flex flex-col justify-between">
            <div>
              <h2 className="text-2xl md:text-4xl font-extrabold mb-4 md:mb-6 text-smart-glow">Select Your Passes</h2>
              <p className="text-white/80 text-base md:text-lg mb-6 md:mb-8 leading-relaxed">
                Choose the tickets that best fit your group. Our monthly subscriptions offer
                unlimited access to all IoT park features.
              </p>

              <div className="my-6 md:my-10 w-full flex justify-center">
                <WeatherWidget />
              </div>
            </div>

            <div className="space-y-4 md:space-y-6">

              <div className="flex items-center space-x-4">
                <div className="bg-white/10 p-2 rounded-lg">
                  <svg
                    className="w-6 h-6 text-smart-glow"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                </div>
                <span className="text-lg font-medium">Access to all inclusive paths</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="bg-white/10 p-2 rounded-lg">
                  <svg
                    className="w-6 h-6 text-smart-glow"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                </div>
                <span className="text-lg font-medium">Smart app navigation</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="bg-white/10 p-2 rounded-lg">
                  <svg
                    className="w-6 h-6 text-smart-glow"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                </div>
                <span className="text-lg font-medium">Priority support</span>
              </div>
            </div>
          </div>

          {/* Form Side */}
          <div className="p-6 md:p-10 flex-1 bg-white dark:bg-gray-800 flex flex-col justify-center">
            {error && (
              <div className="mb-6 md:mb-8 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-200 rounded-r-lg font-medium shadow-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleProceed} className="space-y-6 md:space-y-8">
              {/* Subscription Type Toggle */}
              <div>
                <label className="block text-[10px] md:text-sm font-extrabold text-smart-dark dark:text-white mb-3 md:mb-4 uppercase tracking-wider">
                  Duration
                </label>
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <label
                    className={`cursor-pointer border-2 rounded-xl p-3 md:p-5 text-center transition-all ${subscriptionType === 'one-time' ? 'border-smart-light bg-smart-light/5 dark:bg-smart-light/10 text-smart-dark dark:text-white font-extrabold shadow-sm transform scale-105' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-smart-light/40 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                  >
                    <input
                      type="radio"
                      name="subscriptionType"
                      value="one-time"
                      className="hidden"
                      checked={subscriptionType === 'one-time'}
                      onChange={() => setSubscriptionType('one-time')}
                    />
                    <div className="text-base md:text-xl mb-1">One-Time</div>
                    <div className="text-[10px] md:text-sm opacity-80 font-normal">Valid for 24 hours</div>
                  </label>

                  <label
                    className={`relative cursor-pointer border-2 rounded-xl p-3 md:p-5 text-center transition-all ${subscriptionType === 'monthly' ? 'border-smart-light bg-smart-light/5 dark:bg-smart-light/10 text-smart-dark dark:text-white font-extrabold shadow-sm transform scale-105' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-smart-light/40 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                  >
                    <input
                      type="radio"
                      name="subscriptionType"
                      value="monthly"
                      className="hidden"
                      checked={subscriptionType === 'monthly'}
                      onChange={() => setSubscriptionType('monthly')}
                    />
                    <span className="absolute -top-2 md:-top-3 -right-2 md:-right-3 bg-red-500 text-white text-[8px] md:text-xs font-black uppercase px-2 md:px-3 py-0.5 md:py-1 rounded-full shadow-lg transform rotate-3">
                      Best Value!
                    </span>
                    <div className="text-base md:text-xl mb-1">Monthly</div>
                    <div className="text-[10px] md:text-sm opacity-80 font-normal">Unlimited access</div>
                  </label>
                </div>
              </div>

              {/* Visit Date */}
              {subscriptionType === 'one-time' && (
                <div className="animate-fade-in-up">
                  <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-4 uppercase tracking-wider">
                    Select Visit Date
                  </label>
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-5 py-4 rounded-xl border border-gray-200 dark:border-gray-600 focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition bg-smart-bg dark:bg-gray-700 focus:bg-white dark:focus:bg-gray-600 font-bold text-smart-dark dark:text-white appearance-none"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="" style={{ backgroundColor: '#1f2937', color: 'white' }}>-- Select a Date --</option>
                    {insights?.days.map((day) => (
                      <option
                        key={day.date}
                        value={day.date}
                        disabled={day.count >= (insights?.capacity || 200)}
                        style={{ backgroundColor: '#1f2937', color: 'white' }}
                      >
                        {day.displayDate} -{' '}
                        {day.count >= (insights?.capacity || 200)
                          ? 'SOLD OUT'
                          : `${day.count}/${insights?.capacity || 200} tickets`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Available:{' '}
                    {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
                    {weekEnd.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}

              {/* Ticket Quantities */}
              <div>
                <label className="block text-sm font-extrabold text-smart-dark dark:text-white mb-4 uppercase tracking-wider">
                  Ticket Quantities
                </label>
                <div className="space-y-4">
                  {/* Child */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-smart-light/40 transition-colors">
                    <div>
                      <h4 className="font-bold text-smart-dark dark:text-white text-lg">Child</h4>
                      <p className="text-sm text-smart-light font-bold transition-all">
                        {currentPrices.child} EGP
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <button
                        type="button"
                        onClick={() => handleDecrement('child')}
                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-white font-bold transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M20 12H4"
                          ></path>
                        </svg>
                      </button>
                      <span className="font-extrabold text-xl w-6 text-center text-smart-dark dark:text-white">
                        {tickets.child}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleIncrement('child')}
                        className="w-10 h-10 rounded-full bg-smart-light/10 dark:bg-smart-light/20 hover:bg-smart-light/20 text-smart-light flex items-center justify-center font-bold transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 4v16m8-8H4"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Adult */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-smart-light/40 transition-colors">
                    <div>
                      <h4 className="font-bold text-smart-dark dark:text-white text-lg">Adult</h4>
                      <p className="text-sm text-smart-light font-bold transition-all">
                        {currentPrices.adult} EGP
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <button
                        type="button"
                        onClick={() => handleDecrement('adult')}
                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-white font-bold transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M20 12H4"
                          ></path>
                        </svg>
                      </button>
                      <span className="font-extrabold text-xl w-6 text-center text-smart-dark dark:text-white">
                        {tickets.adult}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleIncrement('adult')}
                        className="w-10 h-10 rounded-full bg-smart-light/10 dark:bg-smart-light/20 hover:bg-smart-light/20 text-smart-light flex items-center justify-center font-bold transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 4v16m8-8H4"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Senior */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-smart-light/40 transition-colors">
                    <div>
                      <h4 className="font-bold text-smart-dark dark:text-white text-lg">Senior</h4>
                      <p className="text-sm text-smart-light font-bold transition-all">
                        {currentPrices.senior} EGP
                      </p>
                    </div>
                    <div className="flex items-center space-x-4">
                      <button
                        type="button"
                        onClick={() => handleDecrement('senior')}
                        className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-white font-bold transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M20 12H4"
                          ></path>
                        </svg>
                      </button>
                      <span className="font-extrabold text-xl w-6 text-center text-smart-dark dark:text-white">
                        {tickets.senior}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleIncrement('senior')}
                        className="w-10 h-10 rounded-full bg-smart-light/10 dark:bg-smart-light/20 hover:bg-smart-light/20 text-smart-light flex items-center justify-center font-bold transition-colors"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 4v16m8-8H4"
                          ></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Total Price */}
              <div className="pt-6 border-t border-gray-100 dark:border-gray-700 flex justify-between items-end">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest mb-1">
                    Total Price
                  </p>
                  <p className="text-4xl font-black text-smart-dark dark:text-smart-glow transition-all">
                    {totalPrice}{' '}
                    <span className="text-xl text-gray-500 dark:text-gray-400 font-medium italic">
                      EGP
                    </span>
                  </p>
                </div>
                <button
                  type="submit"
                  className="bg-smart-light hover:bg-smart-dark text-white font-extrabold py-4 px-8 rounded-xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
                >
                  Proceed to Payment
                </button>
              </div>
            </form>

            {/* Crowd Insights Panel */}
            {subscriptionType === 'one-time' && (
              <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-extrabold text-smart-dark dark:text-white mb-4 uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      ></path>
                    </svg>
                    Availability Window
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setInsightStartDate(
                          (prev) => new Date(new Date(prev).setDate(prev.getDate() - 7))
                        )
                      }
                      className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                    >
                      &larr; Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setInsightStartDate(new Date())}
                      className="px-2 py-1 bg-smart-light/10 text-smart-light rounded text-xs font-bold hover:bg-smart-light/20 transition"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setInsightStartDate(
                          (prev) => new Date(new Date(prev).setDate(prev.getDate() + 7))
                        )
                      }
                      className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                    >
                      Next &rarr;
                    </button>
                  </div>
                </h3>
                {loadingInsights ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-smart-light"></div>
                  </div>
                ) : insights ? (
                  <div className="grid grid-cols-7 gap-2 w-full mt-4 mb-6">
                    {insights.days.map((day, index) => {
                      const isSelected = selectedDate === day.date;
                      const isToday = day.isToday;
                      return (
                        <div
                          key={index}
                          onClick={() => setSelectedDate(day.date)}
                          className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer min-w-0 overflow-hidden ${
                            isSelected
                              ? 'bg-[#2a303c] border-2 border-[#8cc63f] ring-4 ring-[#8cc63f]/10 shadow-lg'
                              : isToday
                                ? 'bg-green-500/10 border-2 border-green-500 hover:bg-green-500/20'
                                : 'bg-gray-800 border-2 border-transparent hover:bg-[#2a303c] hover:border-white/10 shadow-sm'
                          }`}
                        >
                          <div className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-tight w-full text-center">
                            {day.dayName}
                          </div>
                          <div
                            className={`text-xl md:text-2xl lg:text-3xl font-black my-1 italic tracking-tighter shrink-0 ${
                              day.crowdLevel === 'quiet'
                                ? 'text-green-500'
                                : day.crowdLevel === 'moderate'
                                  ? 'text-yellow-500'
                                  : 'text-red-500'
                            }`}
                          >
                            {day.count}
                          </div>
                          <div className="mt-1 flex justify-center items-center w-full">
                            {day.crowdLevel === 'quiet' ? (
                              <Smile className="w-5 md:w-6 h-5 md:h-6 text-green-500 shadow-sm" />
                            ) : day.crowdLevel === 'moderate' ? (
                              <Meh className="w-5 md:w-6 h-5 md:h-6 text-yellow-500 shadow-sm" />
                            ) : (
                              <Frown className="w-5 md:w-6 h-5 md:h-6 text-red-500 shadow-sm" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-4 text-center text-smart-gray dark:text-gray-500 font-bold text-sm">
                    Failed to load availability calendar.
                    <button
                      type="button"
                      onClick={fetchInsights}
                      className="block mx-auto mt-2 text-smart-light hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6 mt-6">
                  <div className="flex items-center justify-center gap-2 px-4 py-2 bg-green-500/5 rounded-full border border-green-500/10 shadow-sm">
                    <Smile className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-gray-500 dark:text-gray-400 text-xs font-medium whitespace-nowrap tracking-tight">
                      Quiet (0-30%)
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500/5 rounded-full border border-green-500/10 shadow-sm">
                    <Meh className="w-4 h-4 text-yellow-500 shrink-0" />
                    <span className="text-gray-500 dark:text-gray-400 text-xs font-medium whitespace-nowrap tracking-tight">
                      Moderate (31-70%)
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/5 rounded-full border border-red-500/10 shadow-sm">
                    <Frown className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="text-gray-500 dark:text-gray-400 text-xs font-medium whitespace-nowrap tracking-tight">
                      Busy (71-100%)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default BookingPage;
