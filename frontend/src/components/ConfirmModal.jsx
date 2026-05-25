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
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: ${fadeIn} 0.3s ease-out;
  padding: 20px;
`;

const ModalContainer = styled.div`
  background: #111;
  border: 1px solid rgba(178, 255, 74, 0.2);
  width: 100%;
  max-width: 400px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  animation: ${slideUp} 0.4s cubic-bezier(0.16, 1, 0.3, 1);
`;

const Header = styled.div`
  padding: 20px 24px;
  background: linear-gradient(to right, rgba(178, 255, 74, 0.05), transparent);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
`;

const Title = styled.h2`
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
  font-style: italic;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const Message = styled.div`
  padding: 32px 24px;
  color: #bbb;
  font-size: 15px;
  line-height: 1.6;
  text-align: center;
  font-weight: 500;
`;

const Footer = styled.div`
  padding: 16px 24px 24px;
  display: flex;
  gap: 12px;
`;

const CancelButton = styled.button`
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 14px;
  border-radius: 14px;
  font-weight: 800;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }
`;

const ConfirmButton = styled.button`
  flex: 1;
  background: #80c241;
  color: #000;
  border: none;
  padding: 14px;
  border-radius: 14px;
  font-weight: 900;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #b2ff4a;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(178, 255, 74, 0.2);
  }
`;

const ConfirmModal = ({ isOpen, title, message, onCancel, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <Overlay onClick={onCancel}>
      <ModalContainer onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>
            <svg className="w-4 h-4 text-smart-glow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {title}
          </Title>
        </Header>
        <Message>{message}</Message>
        <Footer>
          <CancelButton onClick={onCancel}>Cancel</CancelButton>
          <ConfirmButton onClick={onConfirm}>OK</ConfirmButton>
        </Footer>
      </ModalContainer>
    </Overlay>
  );
};

export default ConfirmModal;
