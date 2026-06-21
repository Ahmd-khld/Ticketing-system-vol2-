import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../api';

const ResetPassword = () => {
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const emailParam = token || location.state?.email || '';
  const initialMessage = location.state?.message ? { type: 'error', text: location.state.message } : { type: '', text: '' };

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const inputs = useRef([]);

  useEffect(() => {
    if (!emailParam) {
      navigate('/');
    }
    // Focus first input on mount
    setTimeout(() => {
      if (inputs.current[0]) inputs.current[0].focus();
    }, 100);
  }, [emailParam, navigate]);

  const handleChangeOtp = (element, index) => {
    if (isNaN(element.value)) return false;
    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);

    if (element.value !== '' && index < 5) {
      inputs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && otp[index] === '' && index > 0) {
      inputs.current[index - 1].focus();
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setMessage({ type: '', text: '' });
    try {
      await api.post('/users/forgot-password', { email: emailParam });
      setMessage({ type: 'success', text: 'A fresh verification code has been sent!' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to resend code. Please try again.',
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setMessage({ type: 'error', text: 'Please enter the 6-digit verification code.' });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    if (password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters long.' });
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.post('/users/reset-password', { 
        email: emailParam, 
        otp: otpCode, 
        password 
      });

      if (response.status === 200) {
        setMessage({
          type: 'success',
          text: 'Password reset successfully! Redirecting to login...',
        });
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to reset password. Check your code.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black flex items-center justify-center p-6 transition-colors duration-300">
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border border-smart-light/20 transform transition-all animate-in zoom-in-95 duration-300">
        <div className="bg-smart-dark p-8 border-b border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#80C241]/20 to-transparent pointer-events-none"></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 bg-[#80C241]/20 rounded-full flex items-center justify-center mb-4 border border-[#80C241]/50 shadow-[0_0_15px_rgba(128,194,65,0.4)]">
              <svg className="w-8 h-8 text-[#80C241]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4" />
              </svg>
            </div>
            <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter text-center mb-1">
              Reset Password
            </h2>
            <p className="text-white/70 text-center text-[10px] font-bold uppercase tracking-widest bg-white/10 px-4 py-1.5 rounded-full inline-block mt-2 backdrop-blur-sm border border-white/10 shadow-inner">
              {emailParam}
            </p>
          </div>
        </div>

        <div className="p-8">
          {message.text && (
            <div
              className={`mb-6 p-4 rounded-2xl font-bold text-xs border text-center animate-shake ${message.type === 'success' ? 'bg-[#f4fbf2] border-[#80C241]/30 text-[#0B4228] dark:bg-green-900/20 dark:text-[#80C241]' : 'bg-red-50 border-red-500/30 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-smart-dark dark:text-gray-400 mb-3 uppercase tracking-widest text-center">
                6-Digit Verification Code
              </label>
              <div className="flex justify-between gap-2 mb-2">
                {otp.map((data, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputs.current[index] = el)}
                    type="text"
                    maxLength="1"
                    className="w-12 h-14 border-2 border-[#80C241]/30 rounded-xl text-center text-2xl font-black bg-[#f4fbf2] dark:bg-gray-700 text-[#0B4228] dark:text-white focus:border-[#80C241] focus:ring-4 focus:ring-[#80C241]/10 outline-none transition-all shadow-sm"
                    value={data}
                    onChange={(e) => handleChangeOtp(e.target, index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    onFocus={(e) => e.target.select()}
                  />
                ))}
              </div>
              <div className="text-center mt-3">
                 <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  className="text-[10px] font-bold text-[#80C241] hover:text-[#0B4228] dark:hover:text-white transition-colors disabled:opacity-50 uppercase tracking-widest bg-transparent border-none cursor-pointer"
                >
                  {isResending ? 'Sending...' : 'Didn\'t get it? Resend Code'}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-[10px] font-black text-smart-dark dark:text-gray-400 mb-2 uppercase tracking-widest">
                New Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 rounded-xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-medium text-sm placeholder-gray-400"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-smart-dark dark:text-gray-400 mb-2 uppercase tracking-widest flex justify-between">
                Confirm New Password
                {confirmPassword && (
                  <span className={password === confirmPassword ? 'text-[#80C241]' : 'text-red-500'}>
                    {password === confirmPassword ? 'Matches' : 'Does not match'}
                  </span>
                )}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-5 py-4 rounded-xl border-2 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:ring-4 focus:outline-none transition font-medium text-sm placeholder-gray-400 ${
                  confirmPassword 
                    ? (password === confirmPassword 
                        ? 'border-[#80C241] focus:ring-[#80C241]/20' 
                        : 'border-red-500 focus:ring-red-500/20') 
                    : 'border-smart-light/10 focus:ring-smart-light/20 focus:border-smart-light'
                }`}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="flex flex-col gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                type="submit"
                disabled={isLoading || message.type === 'success'}
                className={`w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg ${isLoading || message.type === 'success' ? 'bg-gray-400 text-white cursor-not-allowed shadow-none' : 'bg-smart-light hover:bg-[#0B4228] text-white hover:shadow-[#0B4228]/40 transform hover:-translate-y-1'}`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : 'Update Password'}
              </button>

              <button
                type="button"
                onClick={() => navigate('/')}
                disabled={isLoading}
                className="w-full h-12 rounded-xl font-bold uppercase tracking-widest text-xs transition-all bg-transparent text-gray-500 dark:text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
