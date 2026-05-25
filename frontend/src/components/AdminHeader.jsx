import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AdminHeader = ({
  title = 'Admin Control Panel',
  subtitle = 'Smart Park Ecosystem',
  icon,
  showBackButton = false,
  unreadAlertsCount = 0,
  unreadAuditCount = 0,
  unreadBannedCount = 0,
  userName,
  onAlertsClick,
  onAuditClick,
  onBannedClick,
  onLogout,
}) => {
  const navigate = useNavigate();

  // Safety check for logout transitions
  if (!localStorage.getItem('token')) return null;

  // Automatically apply dark mode if previously selected or if system prefers dark
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const hasDarkClass = document.documentElement.classList.contains('dark');

    if (storedTheme === 'dark' || (!storedTheme && prefersDark) || hasDarkClass) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <header className="bg-smart-dark dark:bg-black text-white shadow-2xl py-3 px-4 md:py-4 md:px-8 z-10 border-b border-smart-light/20 sticky top-0">
      <div className="max-w-[1440px] mx-auto flex justify-between items-center">
        <style>{`
          @keyframes red-dot-glow-pulse {
            0%, 100% { box-shadow: 0 0 4px 0px rgba(239, 68, 68, 0.4), 0 0 0 1px rgba(239, 68, 68, 0.1); opacity: 0.8; }
            50% { box-shadow: 0 0 10px 2px rgba(239, 68, 68, 0.8), 0 0 0 3px rgba(239, 68, 68, 0.3); opacity: 1; }
          }
          .active-red-dot-pulse {
            animation: red-dot-glow-pulse 2s infinite ease-in-out;
          }
        `}</style>
        <div className="flex items-center space-x-2 md:space-x-4">
          {showBackButton ? (
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="w-8 h-8 md:w-10 md:h-10 bg-white/10 hover:bg-white/20 rounded-lg md:rounded-xl flex items-center justify-center transition-colors"
            >
              <svg
                className="w-5 h-5 md:w-6 md:h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                ></path>
              </svg>
            </button>
          ) : typeof icon === 'string' ? (
            <div className="w-10 h-10 md:w-12 md:h-12 bg-smart-light rounded-lg md:rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(128,194,65,0.4)]">
              <svg
                className="w-6 h-6 md:w-7 md:h-7 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d={icon}
                ></path>
              </svg>
            </div>
          ) : icon ? (
            icon
          ) : (
            <div className="w-10 h-10 md:w-12 md:h-12 bg-smart-light rounded-lg md:rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(128,194,65,0.4)]">
              <svg
                className="w-6 h-6 md:w-7 md:h-7 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.071 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                ></path>
              </svg>
            </div>
          )}
          <div className="overflow-hidden">
            <h1 className="text-lg md:text-2xl font-black tracking-tighter text-white italic uppercase truncate max-w-[150px] sm:max-w-none">
              {title}
            </h1>
            <p className="text-smart-light/80 text-[8px] md:text-xs font-bold uppercase tracking-widest truncate">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 md:space-x-6">
          {userName && (
            <div className="hidden lg:flex flex-col items-end mr-2 border-r border-smart-light/20 pr-6">
              <span className="text-[10px] text-smart-light/80 font-bold uppercase tracking-widest">
                Logged in as
              </span>
              <span className="text-sm font-black text-white tracking-wide">{userName}</span>
            </div>
          )}

          {onAlertsClick && (
            <button
              onClick={onAlertsClick}
              className="relative p-1.5 md:p-2 text-smart-light/80 hover:text-white transition-colors"
              title="Hardware Alerts"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                ></path>
              </svg>
              {unreadAlertsCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[8px] md:text-[10px] font-black leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-500 rounded-full active-red-dot-pulse">
                  {unreadAlertsCount}
                </span>
              )}
            </button>
          )}

          {onAuditClick && (
            <button
              onClick={onAuditClick}
              className="relative p-1.5 md:p-2 text-smart-light/80 hover:text-white transition-colors"
              title="Security Audit Logs"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                ></path>
              </svg>
              {unreadAuditCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[8px] md:text-[10px] font-black leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-500 rounded-full active-red-dot-pulse">
                  {unreadAuditCount}
                </span>
              )}
            </button>
          )}

          {onBannedClick && (
            <button
              onClick={onBannedClick}
              className="relative p-1.5 md:p-2 text-smart-light/80 hover:text-white transition-colors"
              title="Banned IP Alerts"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                ></path>
              </svg>
              {unreadBannedCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[8px] md:text-[10px] font-black leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-500 rounded-full active-red-dot-pulse">
                  {unreadBannedCount}
                </span>
              )}
            </button>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              className="bg-red-600 hover:bg-red-700 text-white p-2.5 md:px-6 md:py-2.5 rounded-lg md:rounded-xl font-black transition-all shadow-lg hover:shadow-red-900/40 flex items-center space-x-2 active:scale-95"
              title="Secure Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                ></path>
              </svg>
              <span className="hidden sm:inline uppercase tracking-widest text-[10px] md:text-xs">Secure Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>

  );
};

export default AdminHeader;
