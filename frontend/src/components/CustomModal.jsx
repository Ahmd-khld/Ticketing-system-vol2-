import React from 'react';
import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: ${fadeIn} 0.3s ease-out;
  padding: 20px;
`;

const ModalContainer = styled.div`
  background: #1a1a1a;
  border: 1px solid rgba(178, 255, 74, 0.2); /* Smart Glow border */
  width: 100%;
  max-width: 450px;
  border-radius: 30px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: ${slideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1);
`;

const Header = styled.div`
  padding: 24px 32px;
  background: linear-gradient(to right, rgba(128, 194, 65, 0.1), transparent);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  color: #fff;
  font-size: 14px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
  font-style: italic;
`;

const Content = styled.div`
  padding: 32px;
  color: #ccc;
  font-size: 16px;
  line-height: 1.6;
  font-weight: 500;
`;

const Footer = styled.div`
  padding: 24px 32px;
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  justify-content: flex-end;
`;

const Button = styled.button`
  background: #80c241; /* Smart Light Green */
  color: #000;
  border: none;
  padding: 12px 32px;
  border-radius: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;

  &:hover {
    background: #b2ff4a; /* Smart Glow */
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(178, 255, 74, 0.2);
  }

  &:active {
    transform: translateY(0);
  }
`;

const IconWrapper = styled.div`
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
  
  svg {
    width: 64px;
    height: 64px;
  }
`;

const CustomModal = ({
  isOpen,
  title,
  message,
  type,
  isPrompt,
  placeholder,
  inputType = 'text',
  min,
  max,
  onClose,
  onConfirm,
}) => {
  const [inputValue, setInputValue] = React.useState('');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (isOpen && isPrompt) {
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isPrompt]);

  if (!isOpen) return null;

  const handleConfirmAction = () => {
    if (isPrompt) {
      onConfirm(inputValue);
    } else {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirmAction();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg fill="none" stroke="#b2ff4a" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
        );
      case 'error':
        return (
          <svg fill="none" stroke="#ef4444" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
        );
      case 'warning':
      case 'prompt':
        return (
          <svg fill="none" stroke="#f59e0b" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            ></path>
          </svg>
        );
      default:
        return (
          <svg fill="none" stroke="#3b82f6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
        );
    }
  };

  return (
    <Overlay onClick={onClose}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>{title}</Title>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
          >
            <svg
              style={{ width: '20px', height: '20px' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </Header>
        <Content>
          <IconWrapper>{getIcon()}</IconWrapper>
          <div style={{ textAlign: 'center', marginBottom: isPrompt ? '24px' : '0' }}>{message}</div>

          {isPrompt && (
            <input
              ref={inputRef}
              type={inputType}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              min={min}
              max={max}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                border: '2px solid rgba(128, 194, 65, 0.3)',
                background: '#000',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                marginTop: '12px',
              }}
            />
          )}
        </Content>
        <Footer>
          {isPrompt ? (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Cancel
              </button>
              <Button onClick={handleConfirmAction}>Submit</Button>
            </div>
          ) : (
            <Button onClick={onClose}>Understood</Button>
          )}
        </Footer>
      </ModalContainer>
    </Overlay>
  );
};

export default CustomModal;
