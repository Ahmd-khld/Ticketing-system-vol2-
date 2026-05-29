import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const TwoFactorModal = ({ isOpen, email, onVerify, onClose }) => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const inputs = useRef([]);

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
      setResendMessage('A fresh code has been sent!');
    } catch (err) {
      setError('Failed to resend code. Please try again.');
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
      setError('Please enter all 6 digits');
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.post('/verify-2fa', { email, otp: otpCode, rememberMe });
      onVerify(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Please check your code.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-smart-dark/80 backdrop-blur-xl animate-in fade-in duration-500">
      <div 
        className="w-full max-w-md bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] shadow-[0_32px_64px_-15px_rgba(0,0,0,0.5)] border-2 border-smart-light/20 transform animate-in slide-in-from-bottom-12 duration-700 ease-out relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-smart-light/10 blur-[80px] rounded-full"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full"></div>

        <div className="relative z-10 text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-smart-light/10 rounded-3xl rotate-12 mb-6 group hover:rotate-0 transition-transform duration-500">
            <svg className="w-10 h-10 text-smart-light -rotate-12 group-hover:rotate-0 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-4xl font-black text-smart-dark dark:text-white italic mb-3 tracking-tighter">Security Check</h2>
          <p className="text-sm text-smart-gray dark:text-gray-400 font-semibold px-2 leading-relaxed">
            We noticed you've been away. Please enter the code sent to <span className="text-smart-light block mt-1">{email}</span>
          </p>
        </div>

        {error && (
          <div className="mb-8 p-5 bg-red-500/5 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-3xl text-[11px] font-black border-2 border-red-500/20 text-center animate-shake uppercase tracking-widest">
            {error}
          </div>
        )}

        {resendMessage && (
          <div className="mb-8 p-5 bg-smart-light/5 dark:bg-smart-light/10 text-smart-light rounded-3xl text-[11px] font-black border-2 border-smart-light/20 text-center uppercase tracking-widest">
            {resendMessage}
          </div>
        )}

        <form onSubmit={handleVerify} className="relative z-10">
          <div className="flex justify-between gap-3 mb-10">
            {otp.map((data, index) => (
              <input
                key={index}
                ref={(el) => (inputs.current[index] = el)}
                type="text"
                maxLength="1"
                className="w-full h-16 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-center text-3xl font-black bg-gray-50 dark:bg-gray-900/50 text-smart-dark dark:text-white focus:border-smart-light focus:ring-8 focus:ring-smart-light/10 outline-none transition-all duration-300"
                value={data}
                onChange={(e) => handleChange(e.target, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onFocus={(e) => e.target.select()}
                required
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3 mb-10 group cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
            <div className={`w-6 h-6 rounded-lg border-2 transition-all duration-300 flex items-center justify-center ${rememberMe ? 'bg-smart-light border-smart-light shadow-lg shadow-smart-light/40' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800'}`}>
              <svg className={`w-4 h-4 text-white transition-opacity duration-300 ${rememberMe ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-[10px] font-black text-smart-gray dark:text-gray-400 uppercase tracking-[0.15em] select-none group-hover:text-smart-dark dark:group-hover:text-white transition-colors">
              Trust this device for 10 days
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-16 bg-smart-light hover:bg-smart-dark text-white font-black rounded-3xl shadow-xl shadow-smart-light/30 hover:shadow-smart-dark/30 transform hover:-translate-y-1 active:scale-95 transition-all duration-300 uppercase tracking-[0.25em] text-xs disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Verifying...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Unlock Account
                <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </span>
            )}
          </button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-[10px] text-smart-gray dark:text-gray-500 font-bold uppercase tracking-widest mb-4 italic">Didn't get the code?</p>
          <button
            onClick={handleResend}
            disabled={isResending}
            className="text-xs font-black text-smart-light hover:text-smart-dark transition-colors uppercase tracking-[0.2em] underline decoration-2 underline-offset-8 disabled:opacity-50"
          >
            {isResending ? 'Resending Code...' : 'Send Again'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-10 w-full text-[9px] font-black text-gray-400 hover:text-red-500 transition-colors uppercase tracking-[0.3em] flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          Abort Login
        </button>
      </div>
    </div>
  );
};

export default TwoFactorModal;
