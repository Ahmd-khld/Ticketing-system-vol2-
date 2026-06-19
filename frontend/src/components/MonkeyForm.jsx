import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const calculateStrength = (pwd) => {
  if (!pwd) return '';
  const hasLetters = /[a-zA-Z]/.test(pwd);
  const hasNumbers = /[0-9]/.test(pwd);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pwd);
  const length = pwd.length;

  if (length >= 8 && hasLetters && hasNumbers) {
    if (length >= 10 && hasSpecial) return 'Strong';
    return 'Medium';
  }
  return 'Weak';
};

const MonkeyForm = ({
  email,
  setEmail,
  password,
  setPassword,
  onLogin,
  name,
  setName,
  age,
  setAge,
  phone,
  setPhone,
  hasDisability,
  setHasDisability,
  isLogin,
  setIsLogin,
  isLoading,
  error,
  setShowForgotModal,
}) => {
  const strength = calculateStrength(password);
  const isSubmitDisabled = isLoading || (!isLogin && password && strength === 'Weak');

  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (error && error.includes('pending email verification')) {
      setCountdown(15);
    } else {
      setCountdown(0);
    }
  }, [error]);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  return (
    <StyledWrapper>
      <div className="card shadow-2xl">
        <input className="blind-check" type="checkbox" id="blind-input" name="blindcheck" hidden />
        <form className="form" onSubmit={onLogin}>
          <div className="title">{isLogin ? 'Visitor Login' : 'Create Account'}</div>

          {error && (
            <div className="w-full mb-4 overflow-hidden bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded-xl flex flex-col relative">
              <div className="p-4 text-red-600 dark:text-red-400 text-xs font-bold text-center leading-relaxed">
                {error}
              </div>
              
              {countdown > 0 && (
                <div className="px-4 pb-4 flex flex-col gap-2.5 items-center">
                  <div className="text-[10px] uppercase tracking-widest font-black text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-3 py-1 rounded-full shadow-inner">
                    Retry available in {countdown}s
                  </div>
                  <div className="w-full h-1.5 bg-red-100 dark:bg-red-900/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500 dark:bg-red-400 transition-all duration-1000 ease-linear rounded-full"
                      style={{ width: `${(countdown / 15) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {countdown === 0 && error.includes('pending email verification') && (
                <div className="px-4 pb-4 flex justify-center animate-fade-in">
                  <div className="text-[10px] uppercase tracking-widest font-black text-[#80C241] bg-[#80C241]/10 border border-[#80C241]/20 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
                    Ready to Retry
                  </div>
                </div>
              )}

              {(error.includes('Access Denied') || error.includes('suspended')) && (
                <div className="px-4 pb-4 flex justify-center">
                  <a
                    href="mailto:support@smartpark.com"
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-[10px] uppercase tracking-widest font-bold hover:bg-red-700 transition-colors shadow-sm"
                  >
                    Contact Support
                  </a>
                </div>
              )}
            </div>
          )}

          {!isLogin && (
            <div className="w-full space-y-3 mb-2 text-left">
              <div>
                <label className="label_input" htmlFor="name-input">
                  Full Name
                </label>
                <input
                  className="input"
                  type="text"
                  id="name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required={!isLogin}
                />
              </div>
              <div className="flex space-x-3 text-left">
                <div className="flex-1">
                  <label className="label_input" htmlFor="age-input">
                    Age
                  </label>
                  <input
                    className="input"
                    type="number"
                    id="age-input"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="25"
                    min="1"
                    required={!isLogin}
                  />
                </div>
                <div className="flex-1">
                  <label className="label_input" htmlFor="phone-input">
                    Phone
                  </label>
                  <input
                    className="input"
                    type="tel"
                    id="phone-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="555-0192"
                    required={!isLogin}
                  />
                </div>
              </div>
              <div className="flex items-center p-2 bg-[#F4FBF2] dark:bg-[#334155] rounded-xl border border-[#80C241]/20">
                <input
                  type="checkbox"
                  id="hasDisability-monkey"
                  checked={hasDisability}
                  onChange={(e) => setHasDisability(e.target.checked)}
                  className="w-4 h-4 text-[#80C241] border-[#80C241] rounded focus:ring-[#80C241] cursor-pointer"
                />
                <label
                  htmlFor="hasDisability-monkey"
                  className="ml-2 block text-[10px] font-bold text-[#0B4228] dark:text-[#e2e8f0] cursor-pointer select-none"
                >
                  I require accessibility features
                </label>
              </div>
            </div>
          )}

          <label className="label_input" htmlFor="email-input">
            Email
          </label>
          <input
            spellCheck="false"
            className="input"
            type="email"
            name="email"
            id="email-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div className="frg_pss w-full flex justify-between mt-2">
            <label className="label_input m-0" htmlFor="password-input">
              Password
            </label>
            {isLogin && setShowForgotModal && (
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-[10px] font-black text-smart-light uppercase tracking-widest hover:underline ml-auto bg-transparent border-none cursor-pointer"
              >
                Forgot?
              </button>
            )}
          </div>
          
          <div className="relative w-full">
            <input
              spellCheck="false"
              className="input pr-12"
              type="text"
              name="password"
              id="password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <label htmlFor="blind-input" className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-[#80c241] hover:scale-110 transition-transform">
              <span className="hide">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              </span>
              <span className="show">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </span>
            </label>
          </div>

          {/* Fixed height container for strength bar */}
          {!isLogin && (
            <div className="w-full h-4 mt-1 flex flex-col justify-center overflow-hidden">
              {password && (
                <div className="w-full flex items-center gap-2">
                  <div className="flex-1 flex h-1.5 gap-1 rounded-full overflow-hidden">
                    <div className={`flex-1 h-full transition-colors ${['Weak', 'Medium', 'Strong'].includes(strength) ? (strength === 'Weak' ? 'bg-red-500' : strength === 'Medium' ? 'bg-yellow-400' : 'bg-green-500') : 'bg-gray-200 dark:bg-gray-700'}`} />
                    <div className={`flex-1 h-full transition-colors ${['Medium', 'Strong'].includes(strength) ? (strength === 'Medium' ? 'bg-yellow-400' : 'bg-green-500') : 'bg-gray-200 dark:bg-gray-700'}`} />
                    <div className={`flex-1 h-full transition-colors ${strength === 'Strong' ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${strength === 'Weak' ? 'text-red-500' : strength === 'Medium' ? 'text-yellow-500' : 'text-green-500'}`}>
                    {strength}
                  </span>
                </div>
              )}
            </div>
          )}

          <button className="submit" type="submit" disabled={isSubmitDisabled}>
            {isLoading ? 'Processing...' : isLogin ? 'Login' : 'Register'}
          </button>

          {isLogin !== undefined && (
            <div className="mt-4 text-center">
              <p className="text-[11px] text-gray-500 font-medium">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="ml-2 text-smart-light font-bold hover:underline bg-transparent border-none cursor-pointer"
                >
                  {isLogin ? 'Register here' : 'Sign in here'}
                </button>
              </p>
            </div>
          )}
        </form>

        <label htmlFor="blind-input" className="avatar">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={35}
            height={35}
            viewBox="0 0 64 64"
            id="monkey"
          >
            <ellipse cx="53.7" cy={33} rx="8.3" ry="8.2" fill="#89664c" />
            <ellipse cx="53.7" cy={33} rx="5.4" ry="5.4" fill="#ffc5d3" />
            <ellipse cx="10.2" cy={33} rx="8.2" ry="8.2" fill="#89664c" />
            <ellipse cx="10.2" cy={33} rx="5.4" ry="5.4" fill="#ffc5d3" />
            <g fill="#89664c">
              <path d="m43.4 10.8c1.1-.6 1.9-.9 1.9-.9-3.2-1.1-6-1.8-8.5-2.1 1.3-1 2.1-1.3 2.1-1.3-20.4-2.9-30.1 9-30.1 19.5h46.4c-.7-7.4-4.8-12.4-11.8-15.2" />
              <path d="m55.3 27.6c0-9.7-10.4-17.6-23.3-17.6s-23.3 7.9-23.3 17.6c0 2.3.6 4.4 1.6 6.4-1 2-1.6 4.2-1.6 6.4 0 9.7 10.4 17.6 23.3 17.6s23.3-7.9 23.3-17.6c0-2.3-.6-4.4-1.6-6.4 1-2 1.6-4.2 1.6-6.4" />
            </g>
            <path
              d="m52 28.2c0-16.9-20-6.1-20-6.1s-20-10.8-20 6.1c0 4.7 2.9 9 7.5 11.7-1.3 1.7-2.1 3.6-2.1 5.7 0 6.1 6.6 11 14.7 11s14.7-4.9 14.7-11c0-2.1-.8-4-2.1-5.7 4.4-2.7 7.3-7 7.3-11.7"
              fill="#e0ac7e"
            />
            <g fill="#3b302a" className="monkey-eye-nose">
              <path d="m35.1 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.6.1 1 1 1 2.1" />
              <path d="m30.9 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.5.1 1 1 1 2.1" />
              <ellipse cx="40.7" cy="31.7" rx="3.5" ry="4.5" className="monkey-eye-r" />
              <ellipse cx="23.3" cy="31.7" rx="3.5" ry="4.5" className="monkey-eye-l" />
            </g>
          </svg>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={35}
            height={35}
            viewBox="0 0 64 64"
            id="monkey-hands"
          >
            <path fill="#89664C" d="M9.4,32.5L2.1,61.9H14c-1.6-7.7,4-21,4-21L9.4,32.5z" />
            <path
              fill="#FFD6BB"
              d="M15.8,24.8c0,0,4.9-4.5,9.5-3.9c2.3,0.3-7.1,7.6-7.1,7.6s9.7-8.2,11.7-5.6c1.8,2.3-8.9,9.8-8.9,9.8
      	s10-8.1,9.6-4.6c-0.3,3.8-7.9,12.8-12.5,13.8C11.5,43.2,6.3,39,9.8,24.4C11.6,17,13.3,25.2,15.8,24.8"
            />
            <path fill="#89664C" d="M54.8,32.5l7.3,29.4H50.2c1.6-7.7-4-21-4-21L54.8,32.5z" />
            <path
              fill="#FFD6BB"
              d="M48.4,24.8c0,0-4.9-4.5-9.5-3.9c-2.3,0.3,7.1,7.6,7.1,7.6s-9.7-8.2-11.7-5.6c-1.8,2.3,8.9,9.8,8.9,9.8
      	s-10-8.1-9.7-4.6c0.4,3.8,8,12.8,12.6,13.8c6.6,1.3,11.8-2.9,8.3-17.5C52.6,17,50.9,25.2,48.4,24.8"
            />
          </svg>
        </label>
      </div>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .card {
    --p: 32px;
    --h-form: auto;
    --w-form: 400px;
    --input-px: 0.75rem;
    --input-py: 0.65rem;
    --submit-h: 42px;
    --blind-w: 64px;
    --space-y: 0.5rem;
    width: var(--w-form);
    height: var(--h-form);
    max-width: 100%;
    border-radius: 24px;
    background: white;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
    flex-direction: column;
    overflow: visible;
    padding: var(--p);
    font-family:
      'Trebuchet MS', 'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', Arial, sans-serif;

    @media (max-width: 480px) {
      --p: 24px;
      --w-form: 100%;
      border-radius: 16px;
    }
  }

  .avatar {
    --sz-avatar: 166px;
    order: 0;
    width: var(--sz-avatar);
    min-width: var(--sz-avatar);
    max-width: var(--sz-avatar);
    height: var(--sz-avatar);
    min-height: var(--sz-avatar);
    max-height: var(--sz-avatar);
    border: 1px solid #707070;
    border-radius: 9999px;
    overflow: hidden;
    cursor: pointer;
    z-index: 2;
    perspective: 80px;
    position: relative;
    margin-bottom: 1.5rem;
    display: flex;
    justify-content: center;
    align-items: center;
    --sz-svg: calc(var(--sz-avatar) - 10px);

    @media (max-width: 480px) {
      --sz-avatar: 130px;
      margin-bottom: 1rem;
    }
  }
  .avatar svg {
    position: absolute;
    transition:
      transform 0.2s ease-in,
      opacity 0.1s;
    transform-origin: 50% 100%;
    height: var(--sz-svg);
    width: var(--sz-svg);
    pointer-events: none;
  }
  .avatar svg#monkey {
    z-index: 1;
  }
  .avatar svg#monkey-hands {
    z-index: 2;
    transform-style: preserve-3d;
    transform: translateY(calc(var(--sz-avatar) / 1.25)) rotateX(-21deg);
  }

  .avatar::before {
    content: '';
    border-radius: 45%;
    width: calc(var(--sz-svg) / 3.889);
    height: calc(var(--sz-svg) / 5.833);
    border: 0;
    border-bottom: calc(var(--sz-svg) * (4 / 100)) solid #3c302a;
    bottom: 20%;

    position: absolute;
    transition: all 0.2s ease;
    z-index: 3;
  }
  .blind-check:checked ~ .avatar::before {
    width: calc(var(--sz-svg) * (9 / 100));
    height: 0;
    border-radius: 50%;
    border-bottom: calc(var(--sz-svg) * (10 / 100)) solid #3c302a;
  }
  .avatar svg#monkey .monkey-eye-r,
  .avatar svg#monkey .monkey-eye-l {
    animation: blink 10s 1s infinite;
    transition: all 0.2s ease;
  }
  @keyframes blink {
    0%,
    2%,
    4%,
    26%,
    28%,
    71%,
    73%,
    100% {
      ry: 4.5;
      cy: 31.7;
    }
    1%,
    3%,
    27%,
    72% {
      ry: 0.5;
      cy: 30;
    }
  }
  .blind-check:checked ~ .avatar svg#monkey .monkey-eye-r,
  .blind-check:checked ~ .avatar svg#monkey .monkey-eye-l {
    ry: 0.5;
    cy: 30;
  }
  .blind-check:checked ~ .avatar svg#monkey-hands {
    transform: translate3d(0, 0, 0) rotateX(0deg);
  }
  .avatar svg#monkey,
  .avatar::before,
  .avatar svg#monkey .monkey-eye-nose,
  .avatar svg#monkey .monkey-eye-r,
  .avatar svg#monkey .monkey-eye-l {
    transition: all 0.2s ease;
  }
  .blind-check:checked ~ .form:focus-within ~ .avatar svg#monkey,
  .blind-check:checked ~ .form:focus-within ~ .avatar::before,
  .blind-check:checked ~ .form:focus-within ~ .avatar svg#monkey .monkey-eye-nose,
  .blind-check:checked ~ .form:focus-within ~ .avatar svg#monkey .monkey-eye-r,
  .blind-check:checked ~ .form:focus-within ~ .avatar svg#monkey .monkey-eye-l {
    animation: none;
  }
  .form:focus-within ~ .avatar svg#monkey {
    animation: slick 3s ease infinite 1s;
    --center: rotateY(0deg);
    --left: rotateY(-4deg);
    --right: rotateY(4deg);
  }
  .form:focus-within ~ .avatar::before,
  .form:focus-within ~ .avatar svg#monkey .monkey-eye-nose,
  .blind-check:not(:checked) ~ .form:focus-within ~ .avatar svg#monkey .monkey-eye-r,
  .blind-check:not(:checked) ~ .form:focus-within ~ .avatar svg#monkey .monkey-eye-l {
    ry: 3;
    cy: 35;
    animation: slick 3s ease infinite 1s;
    --center: translateX(0);
    --left: translateX(-0.5px);
    --right: translateX(0.5px);
  }
  @keyframes slick {
    0%,
    100% {
      transform: var(--center);
    }
    25% {
      transform: var(--left);
    }
    75% {
      transform: var(--right);
    }
  }

  .blind-check:not(:checked) ~ .form span.hide,
  .blind-check:checked ~ .form span.show {
    display: none;
  }
  .blind-check:not(:checked) ~ .form span.show,
  .blind-check:checked ~ .form span.hide {
    display: block;
  }

  .form {
    order: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-evenly;
    flex-direction: column;
    width: 100%;
  }

  .form .title {
    width: 100%;
    font-size: 1.5rem;
    font-weight: 800;
    margin-top: 0;
    margin-bottom: 1.5rem;
    padding-top: 0;
    padding-bottom: 1rem;
    color: #0b4228;
    border-bottom: 2px solid #80c241;
    font-style: italic;
  }

  .form .label_input {
    white-space: nowrap;
    font-size: 0.85rem;
    margin-top: calc(var(--space-y) / 2);
    color: #0b4228;
    font-weight: 800;
    display: inline;
    text-align: left;
    margin-right: auto;
    position: relative;
    z-index: 99;
    -webkit-user-select: none;
    user-select: none;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .form .input {
    resize: vertical;
    background: #f4fbf2;
    border: 1px solid #80c241;
    border-radius: 12px;
    outline: none;
    padding: var(--input-py) var(--input-px);
    font-size: 16px;
    width: 100%;
    color: #0b4228;
    margin: var(--space-y) 0;
    transition: all 0.25s ease;
  }
  
  .form .input:focus {
    border: 2px solid #80c241;
    outline: 0;
    box-shadow: 0 0 0 4px rgba(128, 194, 65, 0.2);
  }
  .form .frg_pss {
    width: 100%;
    display: inline-flex;
    align-items: center;
  }

  .form .submit {
    height: var(--submit-h);
    width: 100%;
    outline: none;
    cursor: pointer;
    background-color: #80c241;
    border: none;
    font-weight: 800;
    letter-spacing: 1px;
    color: white;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.85rem;
    text-align: center;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 14px;
    -webkit-appearance: button;
    appearance: button;
    margin: 1rem 0 0;
    transition: all 0.3s ease;
    text-transform: uppercase;
    box-shadow: 0 4px 14px rgba(128, 194, 65, 0.4);
  }
  .form .submit:hover:not(:disabled) {
    background-color: #0b4228;
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(11, 66, 40, 0.3);
  }

  .form .submit:active:not(:disabled) {
    transform: translateY(0);
  }

  .form .submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .blind-check:not(:checked) ~ .form .input#password-input {
    -webkit-text-security: disc;
  }

  /* --- DARK MODE OVERRIDES --- */
  .dark & .card,
  html.dark & .card,
  body.dark & .card {
    background-color: #1e293b; /* Matches your dark info cards */
  }

  .dark & .form .title,
  html.dark & .form .title {
    color: #f8faf8;
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  }

  .dark & .form .label_input,
  html.dark & .form .label_input {
    color: #e2e8f0;
  }

  .dark & .form .input,
  html.dark & .form .input {
    background-color: #334155;
    color: #f8faf8;
    border: 1px solid #475569;
  }

  .dark & .form .frg_pss a,
  html.dark & .form .frg_pss a {
    color: #80c241; /* Smart Light Green */
  }

  .dark & .form .frg_pss a:hover,
  html.dark & .form .frg_pss a:hover {
    color: #b2ff4a; /* Smart Glow */
  }
`;

export default MonkeyForm;
