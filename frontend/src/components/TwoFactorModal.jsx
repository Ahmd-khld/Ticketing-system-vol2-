import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const TwoFactorModal = ({ isOpen, email, role, onVerify, onClose, isEmailVerification = false }) => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const inputs = useRef([]);

  const isSubAdmin = role === 'sub-admin';

  useEffect(() => {
    if (isOpen) {
      setOtp(['', '', '', '', '', '']);
      setError('');
      setResendMessage('');
      setTimeout(() => {
        if (inputs.current[0]) inputs.current[0].focus();
      }, 100);
    }
  }, [isOpen]);

  const handleChange = (element, index) => {
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
    setResendMessage('');
    setError('');
    try {
      await api.post('/otp/send-otp', { email });
      setResendMessage('Fresh code sent!');
    } catch (err) {
      setError('Resend failed.');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Enter 6 digits');
      setIsLoading(false);
      return;
    }

    try {
      const endpoint = isEmailVerification ? '/verify-email' : '/verify-2fa';
      const payload = isEmailVerification ? { email, otp: otpCode } : { email, otp: otpCode, rememberMe: isSubAdmin ? false : rememberMe };
      const response = await api.post(endpoint, payload);
      onVerify(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Check your code.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div 
        className="max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl border border-[#80C241]/20 transform transition-all animate-in zoom-in-95 duration-300 ease-out relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#80C241]/10 rounded-full mb-4">
            <svg className="w-8 h-8 text-[#80C241]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4" />
            </svg>
          </div>
          <h2 className="text-3xl font-black text-[#0B4228] dark:text-[#f8faf8] italic mb-2">
            {isEmailVerification ? 'Verify Email' : 'Security Check'}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed">
            {isEmailVerification ? 'Code sent to' : "Please enter the code sent to"} <span className="font-bold text-[#80C241]">{email}</span>
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl text-xs font-bold border border-red-100 dark:border-red-800 text-center animate-shake">
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
                ref={(el) => (inputs.current[index] = el)}
                type="text"
                maxLength="1"
                className="w-12 h-14 border-2 border-[#80C241]/30 rounded-xl text-center text-2xl font-black bg-[#f4fbf2] dark:bg-gray-700 text-[#0B4228] dark:text-white focus:border-[#80C241] focus:ring-4 focus:ring-[#80C241]/10 outline-none transition-all"
                value={data}
                onChange={(e) => handleChange(e.target, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onFocus={(e) => e.target.select()}
                required
              />
            ))}
          </div>

          {!isEmailVerification && !isSubAdmin && (
            <div className="flex items-center justify-center gap-3 mb-8 group cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
              <div className={`w-5 h-5 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${rememberMe ? 'bg-[#80C241] border-[#80C241] shadow-lg shadow-[#80C241]/40' : 'bg-[#f4fbf2] dark:bg-gray-700 border-gray-200 dark:border-gray-600'}`}>
                <svg className={`w-3 h-3 text-white transition-opacity duration-300 ${rememberMe ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest select-none group-hover:text-[#0B4228] dark:group-hover:text-[#f8faf8] transition-colors">
                Trust for 10 days
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 bg-[#80C241] text-white font-black rounded-xl shadow-lg shadow-[#80C241]/40 hover:bg-[#0B4228] hover:shadow-[#0B4228]/40 transform hover:-translate-y-1 transition-all uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              isEmailVerification ? 'Verify Now' : 'Unlock Account'
            )}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-gray-100 dark:border-gray-700 pt-6 flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Didn't receive the code?</p>
            <div className="flex items-center justify-center gap-6 mt-1">
              <button
                onClick={handleResend}
                disabled={isResending}
                className="text-sm font-bold text-[#80C241] hover:text-[#0B4228] transition-colors disabled:opacity-50 uppercase tracking-widest"
              >
                {isResending ? 'Sending...' : 'Resend Code'}
              </button>
              
              <div className="w-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600"></div>
              
              <button
                onClick={onClose}
                className="text-sm font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TwoFactorModal;
