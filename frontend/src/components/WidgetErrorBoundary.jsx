import React from 'react';

class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Widget crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-red-50/50 dark:bg-red-900/10 border border-red-200/50 dark:border-red-800/50 rounded-[30px] h-full min-h-[200px] text-center m-4 animate-fade-in">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              ></path>
            </svg>
          </div>
          <h3 className="text-sm font-black text-red-700 dark:text-red-400 uppercase tracking-widest mb-2">
            Widget Failed to Load
          </h3>
          <p className="text-[10px] font-bold text-red-600/80 dark:text-red-400/80 break-words max-w-[80%] mb-5">
            {this.state.errorMessage || 'An unexpected error occurred in this component.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            className="px-5 py-2.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors border border-red-200 dark:border-red-800/50"
          >
            Reload Widget
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default WidgetErrorBoundary;
