import React, { createContext, useContext, useState, useCallback } from 'react';
import CustomModal from '../components/CustomModal';
import ConfirmModal from '../components/ConfirmModal';

const UIContext = createContext();

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};

export const UIProvider = ({ children }) => {
  const [modal, setModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info', // 'info', 'success', 'error', 'warning', 'prompt'
    isPrompt: false,
    placeholder: '',
    inputType: 'text',
    min: '',
    max: '',
  });

  const [confirm, setConfirm] = useState({
    isOpen: false,
    title: '',
    message: '',
  });

  const [modalResolver, setModalResolver] = useState(null);
  const [confirmResolver, setConfirmResolver] = useState(null);

  const showModal = useCallback((message, title = 'Notification', type = 'info') => {
    setModal({
      isOpen: true,
      title,
      message,
      type,
      isPrompt: false,
    });
  }, []);

  const showPrompt = useCallback(
    (message, title = 'Input Required', placeholder = 'Enter value...', inputType = 'text', min = '', max = '') => {
      setModal({
        isOpen: true,
        title,
        message,
        type: 'prompt',
        isPrompt: true,
        placeholder,
        inputType,
        min,
        max,
      });

      return new Promise((resolve) => {
        setModalResolver(() => resolve);
      });
    },
    []
  );

  const showConfirm = useCallback((message, title = 'Confirmation') => {
    setConfirm({
      isOpen: true,
      title,
      message,
    });

    return new Promise((resolve) => {
      setConfirmResolver(() => resolve);
    });
  }, []);

  const hideModal = useCallback(() => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    if (modalResolver) {
      modalResolver(null);
      setModalResolver(null);
    }
  }, [modalResolver]);

  const handleModalConfirm = useCallback((value) => {
    setModal((prev) => ({ ...prev, isOpen: false }));
    if (modalResolver) {
      modalResolver(value);
      setModalResolver(null);
    }
  }, [modalResolver]);

  const handleConfirmCancel = useCallback(() => {
    setConfirm((prev) => ({ ...prev, isOpen: false }));
    if (confirmResolver) {
      confirmResolver(false);
      setConfirmResolver(null);
    }
  }, [confirmResolver]);

  const handleConfirmOK = useCallback(() => {
    setConfirm((prev) => ({ ...prev, isOpen: false }));
    if (confirmResolver) {
      confirmResolver(true);
      setConfirmResolver(null);
    }
  }, [confirmResolver]);

  return (
    <UIContext.Provider value={{ showModal, showPrompt, showConfirm, hideModal }}>
      {children}
      <CustomModal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        isPrompt={modal.isPrompt}
        placeholder={modal.placeholder}
        inputType={modal.inputType}
        min={modal.min}
        max={modal.max}
        onClose={hideModal}
        onConfirm={handleModalConfirm}
      />
      <ConfirmModal
        isOpen={confirm.isOpen}
        title={confirm.title}
        message={confirm.message}
        onCancel={handleConfirmCancel}
        onConfirm={handleConfirmOK}
      />
    </UIContext.Provider>
  );
};
