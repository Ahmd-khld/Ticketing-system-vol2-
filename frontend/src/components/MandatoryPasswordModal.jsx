import React, { useState, useEffect } from 'react';
import api from '../api';

const MandatoryPasswordModal = ({ isOpen, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Policy tracking state
  const [policy, setPolicy] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
    match: false,
  });

  useEffect(() => {
    setPolicy({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      match: password === confirmPassword && password.length > 0,
    });
  }, [password, confirmPassword]);

  const isPolicyMet = Object.values(policy).every(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isPolicyMet) {
      setError('Please meet all password policy requirements.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await api.post('/mandatory-password-update', { password });
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.removeItem('requiresPasswordReset');
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-[#0f172a]/95 backdrop-blur-none transition-all">
      <div 
        className="w-full max-w-sm bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-[0_32px_64px_-15px_rgba(0,0,0,0.5)] border-2 border-red-500/20 transform transition-all relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-red-500/10 rounded-full mb-3">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-red-600 dark:text-red-400 italic mb-2 tracking-tight">
            Security Action Required
          </h2>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold leading-relaxed px-2">
            Your account has been restricted due to a security incident. Update your password to restore access.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-[10px] font-black border border-red-200 dark:border-red-800 text-center uppercase tracking-widest animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-base font-black bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 outline-none transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="block text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-11 px-4 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-base font-black bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-white focus:border-red-500 focus:ring-4 focus:ring-red-500/10 outline-none transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
            <p className="text-[8px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Password Policy</p>
            <ul className="space-y-1.5 text-[10px] font-bold text-gray-600 dark:text-gray-400">
              <li className={`flex items-center gap-2 ${policy.length ? 'text-green-500' : ''}`}>
                {policy.length ? '✓' : '○'} At least 8 characters
              </li>
              <li className={`flex items-center gap-2 ${policy.uppercase ? 'text-green-500' : ''}`}>
                {policy.uppercase ? '✓' : '○'} One uppercase letter
              </li>
              <li className={`flex items-center gap-2 ${policy.lowercase ? 'text-green-500' : ''}`}>
                {policy.lowercase ? '✓' : '○'} One lowercase letter
              </li>
              <li className={`flex items-center gap-2 ${policy.number ? 'text-green-500' : ''}`}>
                {policy.number ? '✓' : '○'} One number
              </li>
              <li className={`flex items-center gap-2 ${policy.special ? 'text-green-500' : ''}`}>
                {policy.special ? '✓' : '○'} One special character
              </li>
              <li className={`flex items-center gap-2 ${policy.match ? 'text-green-500' : ''}`}>
                {policy.match ? '✓' : '○'} Passwords match
              </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={isLoading || !isPolicyMet}
            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl shadow-lg shadow-red-600/30 transform transition-all uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 hover:-translate-y-1 mt-2"
          >
            {isLoading ? 'Updating...' : 'Update & Restore Access'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MandatoryPasswordModal;
