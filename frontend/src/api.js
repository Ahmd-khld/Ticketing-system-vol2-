import axios from 'axios';

// Create a global Axios instance
const api = axios.create({
  // Use environment variable with a fallback for local development
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',

  // MANDATORY: Automatically sends your HTTP-Only session cookie with every request
  withCredentials: true,
});

// Automatically attach the Authorization header if a token exists in localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && token !== 'null' && token !== 'undefined') {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Global response interceptor to handle account restriction or unauthorized access
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      
      // Handle Account Restriction (403)
      if (status === 403 && (data?.message?.includes('restricted') || data?.isRestricted)) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('adminEmail');
        localStorage.removeItem('userId');
        const message = data?.message || 'Your account has been restricted.';
        window.location.href = `/login?restrictionReason=${encodeURIComponent(message)}`;
      }
      
      // Handle Unauthorized/Expired/Malformed Token (401)
      if (status === 401) {
        // Check if we are already on login or landing to avoid redirect loops
        const path = window.location.pathname;
        if (path !== '/login' && path !== '/' && path !== '/verify-email') {
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('adminEmail');
          localStorage.removeItem('userId');
          window.location.href = '/login?message=' + encodeURIComponent('Session expired. Please login again.');
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
