import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

const StatCircle = ({ percent, label, subtitle, color }) => {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center">
        <svg className="w-24 h-24 transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            fill="transparent"
            className="text-gray-100 dark:text-gray-700"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            className={color}
          />
        </svg>
        <span className="absolute text-base font-black text-smart-dark dark:text-white">{percent}%</span>
      </div>
      <p className="mt-2 text-[9px] font-black uppercase tracking-tighter text-smart-dark dark:text-white text-center">
        {label}
      </p>
      <p className="text-[8px] font-bold text-smart-gray dark:text-gray-400 uppercase tracking-[0.15em] opacity-60 text-center mt-0.5">
        {subtitle}
      </p>
    </div>
  );
};

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await api.post('/users/forgot-password', { email });

      if (response.status === 200) {
        setMessage({ type: 'success', text: 'Verification code sent! Redirecting...' });
        setTimeout(() => {
          navigate(`/reset-password/${email}`);
        }, 2000);
      } else {
        setMessage({
          type: 'error',
          text: response.data?.message || 'Something went wrong. Please try again.',
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Server connection failed. Please try again later.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-smart-bg dark:bg-black transition-colors duration-500">
      <div className="bg-white dark:bg-gray-800 rounded-[40px] shadow-2xl border border-smart-light/20 max-w-4xl w-full relative overflow-hidden flex flex-col md:flex-row">
        {/* Top Accent Bar */}
        <div className="absolute top-0 left-0 w-full h-2 bg-smart-light z-10"></div>

        {/* Left Side: Form */}
        <div className="w-full md:w-1/2 p-10 md:p-14 border-b md:border-b-0 md:border-r border-smart-light/10 relative">
          <h2 className="text-3xl font-black text-smart-dark dark:text-white tracking-tighter uppercase mb-2 italic">
            Reset Access
          </h2>
          <p className="text-smart-gray dark:text-gray-400 text-sm font-medium mb-8 uppercase tracking-widest">
            Forgot Password
          </p>

          {message.text && (
            <div
              className={`mb-6 p-4 rounded-2xl font-bold text-sm border ${message.type === 'success' ? 'bg-smart-light/10 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-200'}`}
            >
              {message.text}
            </div>
          )}

          <p className="text-smart-gray dark:text-gray-400 mb-8 font-medium leading-relaxed">
            Enter your email and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <label className="block text-xs font-black text-smart-dark dark:text-white mb-3 uppercase tracking-widest">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-medium"
                placeholder="you@example.com"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full font-black py-4 uppercase tracking-widest text-sm rounded-2xl transition-all flex items-center justify-center space-x-2 ${isLoading ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-smart-light hover:bg-smart-dark text-white shadow-lg hover:-translate-y-1'}`}
            >
              {isLoading ? 'Processing...' : 'Send Reset Link'}
            </button>
          </form>

          <div className="mt-8">
            <Link
              to="/login"
              className="text-xs font-black text-smart-light hover:underline uppercase tracking-widest flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Login
            </Link>
          </div>
        </div>

        {/* Right Side: Insights */}
        <div className="w-full md:w-1/2 p-10 md:p-14 bg-gray-50/50 dark:bg-gray-900/20 flex flex-col justify-center items-center">
          <div className="text-center mb-10">
            <h3 className="text-xl font-black text-smart-dark dark:text-white uppercase tracking-tight mb-2 italic">
              Profile Completion Insights
            </h3>
            <div className="h-1 w-12 bg-smart-light mx-auto rounded-full"></div>
          </div>

          <div className="space-y-10 w-full max-w-[280px]">
            <StatCircle
              percent={95}
              label="Email Validity Score"
              subtitle="Verified / Accessible"
              color="text-teal-500"
            />
            
            <div className="border-t border-smart-light/10 w-full"></div>

            <StatCircle
              percent={80}
              label="Password Security Strength"
              subtitle="Multi-factor / Strong"
              color="text-blue-600"
            />
          </div>

          <p className="mt-12 text-[9px] text-center font-bold text-smart-gray dark:text-gray-500 uppercase tracking-[0.2em] leading-relaxed max-w-[240px]">
            Strengthening your account security through continuous telemetry monitoring.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;

