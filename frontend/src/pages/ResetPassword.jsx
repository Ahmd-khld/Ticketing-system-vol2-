import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../api';

const ResetPassword = () => {
  const { token } = useParams(); // URL path can be /reset-password/:email
  const location = useLocation();
  const navigate = useNavigate();
  
  const emailParam = token || location.state?.email || '';
  const initialMessage = location.state?.message ? { type: 'error', text: location.state.message } : { type: '', text: '' };

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // If no email is found, kick them back to login or forgot-password
    if (!emailParam) {
      navigate('/login');
    }
  }, [emailParam, navigate]);

  const handleChangeOtp = (element, index) => {
    if (isNaN(element.value)) return false;
    setOtp([...otp.map((d, idx) => (idx === index ? element.value : d))]);
    if (element.nextSibling && element.value !== '') {
      element.nextSibling.focus();
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

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
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
          navigate('/login');
        }, 3000);
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
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border border-smart-light/20 transform transition-all animate-fade-in">
        <div className="bg-smart-dark p-8 border-b border-white/10">
          <h2 className="text-3xl font-black text-smart-glow italic uppercase tracking-tighter text-white text-center">
            Reset Password
          </h2>
          <p className="text-white/60 text-center text-xs font-bold uppercase tracking-widest mt-2">
            Verification for {emailParam}
          </p>
        </div>

        <div className="p-10">
          {message.text && (
            <div
              className={`mb-6 p-4 rounded-2xl font-bold text-sm border ${message.type === 'success' ? 'bg-smart-light/10 border-smart-light text-smart-dark dark:text-smart-glow' : 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:text-red-200'}`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-black text-smart-dark dark:text-white mb-3 uppercase tracking-widest text-center">
                6-Digit Verification Code
              </label>
              <div className="flex justify-between gap-2 mb-6">
                {otp.map((data, index) => (
                  <input
                    key={index}
                    type="text"
                    maxLength="1"
                    className="w-11 h-12 border-2 border-[#80C241]/30 rounded-xl text-center text-xl font-black bg-[#f4fbf2] dark:bg-gray-700 text-[#0B4228] dark:text-white focus:border-[#80C241] outline-none transition-all"
                    value={data}
                    onChange={(e) => handleChangeOtp(e.target, index)}
                    onFocus={(e) => e.target.select()}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-smart-dark dark:text-white mb-3 uppercase tracking-widest">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-medium"
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-black text-smart-dark dark:text-white mb-3 uppercase tracking-widest">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-6 py-4 rounded-2xl border-2 border-smart-light/10 bg-smart-bg dark:bg-gray-700 text-smart-dark dark:text-white focus:ring-4 focus:ring-smart-light/20 focus:border-smart-light outline-none transition font-medium"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || message.type === 'success'}
              className={`w-full py-5 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl hover:-translate-y-1 ${isLoading || message.type === 'success' ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-smart-light hover:bg-smart-dark text-white'}`}
            >
              {isLoading ? 'Processing...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
