import React from 'react';
import { useRouteError, useNavigate } from 'react-router-dom';

const GlobalErrorBoundary = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  // Log the error to the console for developers
  console.error('Caught by Error Boundary:', error);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-smart-bg dark:bg-black p-6 font-sans text-center transition-colors duration-300">
      <div className="bg-white dark:bg-gray-800 p-10 rounded-[40px] shadow-2xl border border-red-500/20 max-w-lg w-full">
        <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            ></path>
          </svg>
        </div>

        <h1 className="text-2xl font-black text-smart-dark dark:text-white uppercase tracking-tighter italic mb-4">
          Oops! Something went wrong.
        </h1>

        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl mb-8">
          <p className="text-sm font-bold text-red-600 dark:text-red-400 font-mono break-words">
            {error?.statusText || error?.message || 'An unexpected rendering error occurred.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-smart-light/10 hover:bg-smart-light/20 text-smart-dark dark:text-white font-black text-xs uppercase tracking-widest rounded-xl transition-colors border border-smart-light/20"
          >
            Go Back
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-smart-light hover:bg-smart-dark text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-smart-light/40"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalErrorBoundary;
