import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api';

const VerifyEmail = () => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Robust email extraction
  const [email, setEmail] = useState('');

  useEffect(() => {
    const queryEmail = new URLSearchParams(location.search).get('email');
    const stateEmail = location.state?.email;
    const finalEmail = queryEmail || stateEmail;

    if (finalEmail) {
      setEmail(finalEmail);
    } else {
      // If no email is found, show error instead of immediate redirect to help debugging
      setError('Email address missing. Please try logging in again.');
    }
  }, [location]);

  const handleChange = (element, index) => {
    if (isNaN(element.value)) return false;

    const newOtp = [...otp];
    newOtp[index] = element.value;
    setOtp(newOtp);

    // Focus next input
    if (element.nextSibling && element.value !== '') {
      element.nextSibling.focus();
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits');
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.post('/verify-email', { email, otp: otpCode });
      const data = response.data;

      if (data.isVerified) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role || 'user');
        localStorage.setItem('userId', data._id);

        if (data.role === 'admin' || data.role === 'sub-admin') {
          const storedEmail = (data.email || email).toLowerCase().trim();
          localStorage.setItem('adminEmail', storedEmail);
          navigate('/admin/dashboard', { replace: true });
        } else {
          navigate('/book', { replace: true });
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Please check your code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Cannot resend: Email missing.');
      return;
    }
    setIsResending(true);
    setResendMessage('');
    try {
      await api.post('/otp/send-otp', { email });
      setResendMessage('A fresh code has been sent to ' + email);
    } catch (err) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center p-6 bg-smart-bg dark:bg-black transition-colors duration-500 min-h-[80vh]">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl border border-[#80C241]/20 transform transition-all">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#80C241]/10 rounded-full mb-4">
            <svg className="w-8 h-8 text-[#80C241]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-3xl font-black text-[#0B4228] dark:text-[#f8faf8] italic mb-2">Verify Email</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
            Code sent to <span className="font-bold text-[#80C241]">{email || 'your inbox'}</span>
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold border border-red-100 dark:border-red-800 text-center animate-pulse">
            {error}
          </div>
        )}

        {resendMessage && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-2xl text-xs font-bold border border-green-100 dark:border-green-800 text-center">
            {resendMessage}
          </div>
        )}

        <form onSubmit={handleVerify}>
          <div className="flex justify-between gap-2 mb-8">
            {otp.map((data, index) => (
              <input
                key={index}
                type="text"
                maxLength="1"
                className="w-12 h-14 border-2 border-[#80C241]/30 rounded-xl text-center text-2xl font-black bg-[#f4fbf2] dark:bg-gray-700 text-[#0B4228] dark:text-white focus:border-[#80C241] focus:ring-4 focus:ring-[#80C241]/10 outline-none transition-all"
                value={data}
                onChange={(e) => handleChange(e.target, index)}
                onFocus={(e) => e.target.select()}
                required
              />
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading || !email}
            className="w-full h-12 bg-[#80C241] text-white font-black rounded-xl shadow-lg shadow-[#80C241]/40 hover:bg-[#0B4228] hover:shadow-[#0B4228]/40 transform hover:-translate-y-1 transition-all uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Verifying...' : 'Verify Now'}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-gray-100 dark:border-gray-700 pt-6">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">Didn't receive the code?</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={handleResend}
              disabled={isResending || !email}
              className="text-sm font-bold text-[#80C241] hover:text-[#0B4228] transition-colors disabled:opacity-50"
            >
              {isResending ? 'Sending...' : 'Resend Code'}
            </button>
            <button
              onClick={() => navigate('/login')}
              className="text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
