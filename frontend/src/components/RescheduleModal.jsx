import React, { useState } from 'react';
import api from '../api';
import { useUI } from '../context/UIContext';

const RescheduleModal = ({ ticketId, onClose, onSuccess }) => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const { showModal } = useUI();

  const getAvailableDates = () => {
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      
      const label = d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      // Format as YYYY-MM-DD for API
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const fullDate = `${yyyy}-${mm}-${dd}`;

      dates.push({ fullDate, display: label });
    }
    return dates;
  };

  const dates = getAvailableDates();

  const handleReschedule = async () => {
    if (!selectedDate) return;
    setLoading(true);
    try {
      const response = await api.put(`/tickets/${ticketId}/reschedule`, {
        newDate: selectedDate
      });
      onSuccess(response.data.ticket);
    } catch (error) {
      showModal(error.response?.data?.message || 'Error rescheduling ticket', 'Error', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0f172a]/95 z-[9999] flex items-center justify-center p-4 transition-all">
      <div 
        className="bg-slate-900 border border-smart-light/20 w-full max-w-md rounded-[2.5rem] shadow-[0_32px_64px_-15px_rgba(0,0,0,0.5)] animate-fade-in-up flex flex-col max-h-[80vh] md:max-h-[600px] overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 border-b border-white/5 bg-gradient-to-r from-[#8cc63f]/10 to-transparent flex justify-between items-start shrink-0">
          <div>
            <h2 className="text-2xl font-black text-white italic uppercase tracking-wider">Reschedule Ticket</h2>
            <p className="text-gray-400 text-xs font-bold mt-1 uppercase tracking-widest opacity-60">Pick your new visit date</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-500"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 pr-2 md:pr-6 custom-scrollbar">
          <div className="space-y-3">
            {dates.map((date) => (
              <button
                key={date.fullDate}
                onClick={() => setSelectedDate(date.fullDate)}
                className={`w-full py-3 px-8 rounded-3xl border-2 transition-all flex items-center justify-between ${
                  selectedDate === date.fullDate
                    ? 'border-[#8cc63f] bg-[#8cc63f]/10 text-white shadow-[0_0_20px_rgba(140,198,63,0.15)]'
                    : 'border-white/5 bg-white/5 text-gray-400 hover:border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="text-left">
                  <p className="font-black text-lg italic tracking-tight">{date.display.split(',')[0]}</p>
                  {date.display.includes(',') && (
                    <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 font-black mt-0.5">
                      {date.display.split(',')[1]}
                    </p>
                  )}
                </div>
                {selectedDate === date.fullDate && (
                  <div className="w-8 h-8 bg-[#8cc63f] rounded-full flex items-center justify-center shadow-lg shadow-[#8cc63f]/40 animate-scale-in">
                    <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-8 bg-black/40 flex gap-4 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:text-white transition-colors"
          >
            Go Back
          </button>
          <button
            disabled={!selectedDate || loading}
            onClick={handleReschedule}
            className={`flex-1 py-4 rounded-2xl font-black text-black transition-all transform active:scale-95 ${
              !selectedDate || loading
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-[#8cc63f] hover:bg-[#a3db55] shadow-xl shadow-[#8cc63f]/20'
            }`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                <span>Syncing...</span>
              </div>
            ) : 'Update Ticket'}
          </button>
        </div>
      </div>
    </div>

  );
};

export default RescheduleModal;
