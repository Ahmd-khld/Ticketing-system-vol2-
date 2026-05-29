import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import MonkeyForm from '../components/MonkeyForm.jsx';
import TwoFactorModal from '../components/TwoFactorModal.jsx';
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
  const [show2FA, setShow2FA] = useState(false);
  const [twoFactorEmail, setTwoFactorEmail] = useState('');
  const [isVerificationMode, setIsVerificationModal] = useState(false);
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
        // Registration success - show verification modal
        setTwoFactorEmail(email);
        setIsVerificationModal(true);
        setShow2FA(true);
        setIsLoading(false);
        return;
      }

      if (data.twoFactorRequired) {
        setTwoFactorEmail(data.email);
        setIsVerificationModal(false);
        setShow2FA(true);
        setIsLoading(false);
        return;
      }

      completeLogin(data);
    } catch (err) {
      if (err.response?.status === 401 && err.response?.data?.isVerified === false) {
        setTwoFactorEmail(email);
        setIsVerificationModal(true);
        setShow2FA(true);
        setIsLoading(false);
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

  const completeLogin = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', data.role || 'user');
    localStorage.setItem('userId', data._id); // CRITICAL: Required for force logout socket listener
    
    // Phase 3: Login Interception for Password Reset Playbook
    if (data.requiresPasswordReset) {
      navigate('/reset-password', { 
        state: { 
          message: 'Your account has been restricted. You must update your password to restore access.',
          email: data.email || email
        } 
      });
      return;
    }

    if (data.role === 'admin' || data.role === 'sub-admin') {
      const storedEmail = (data.email || email).toLowerCase().trim();
      localStorage.setItem('adminEmail', storedEmail);
      navigate('/admin/dashboard');
    } else {
      navigate('/book');
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

      <TwoFactorModal
        isOpen={show2FA}
        email={twoFactorEmail}
        isEmailVerification={isVerificationMode}
        onVerify={completeLogin}
        onClose={() => setShow2FA(false)}
      />
    </div>
  );
};

export default Login;
