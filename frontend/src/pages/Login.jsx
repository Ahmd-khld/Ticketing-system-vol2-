import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MonkeyForm from '../components/MonkeyForm.jsx';
import api from '../api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [hasDisability, setHasDisability] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check for restriction reason in URL params (from Axios interceptor/App listener)
    const params = new URLSearchParams(location.search);
    const reason = params.get('restrictionReason') || location.state?.restrictionReason;
    if (reason) {
      setError(reason);
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (location.state?.message) {
      setError(location.state.message);
    }
  }, [location]);

  const handleAuth = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setIsLoading(true);

    const path = isLogin ? '/login' : '/register';
    const payload = isLogin
      ? { email, password }
      : { name, email, phone, age: Number(age), hasDisability, password, role: 'user' };

    try {
      const response = await api.post(path, payload);
      const data = response.data;

      if (!isLogin) {
        // Registration success - redirect to verification
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role || 'user');
      localStorage.setItem('userId', data._id); // Store userId for the Instant Kick listener
      if (data.role === 'admin' || data.role === 'sub-admin') {
        const storedEmail = (data.email || email).toLowerCase().trim();
        localStorage.setItem('adminEmail', storedEmail);
      }

      if (data.role === 'admin' || data.role === 'sub-admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/book');
      }
    } catch (err) {
      if (err.response?.status === 401 && err.response?.data?.isVerified === false) {
        navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }

      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          `Server connection failed: ${err.message}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-grow flex items-center justify-center p-6 bg-smart-bg dark:bg-black transition-colors duration-500 min-h-[calc(100vh-6rem)]">
      <MonkeyForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        name={name}
        setName={setName}
        age={age}
        setAge={setAge}
        phone={phone}
        setPhone={setPhone}
        hasDisability={hasDisability}
        setHasDisability={setHasDisability}
        onLogin={handleAuth}
        isLogin={isLogin}
        setIsLogin={setIsLogin}
        isLoading={isLoading}
        error={error}
      />
    </div>
  );
};

export default Login;
