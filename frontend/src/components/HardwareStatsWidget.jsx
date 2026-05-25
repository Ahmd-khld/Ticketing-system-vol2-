import React, { useState } from 'react';
import api from '../api';
import { useTelemetry } from '../context/TelemetryContext';

const HardwareStatsWidget = ({ socket }) => {
  const { telemetryMatrix, setTelemetryMatrix, alerts: globalAlerts } = useTelemetry();
  const [selectedSensor, setSelectedSensor] = useState(null);
  const [sensorLogs, setSensorLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const systemMapping = {
    'Ambient Lighting': ['LDR', 'LED Lamp'],
    'Automated Gate': ['Gate Ultrasonic', 'Gate Servo'],
    'Smart Irrigation': ['Soil Moisture', 'DHT11', 'Water Pump'],
    'Smart Recycle Bins': ['RGB Ultrasonic', 'RGB LED'],
  };

  const handleRowClick = async (systemName) => {
    setSelectedSensor(systemName);
    setLoadingLogs(true);
    setSensorLogs([]);
    try {
      // 1. Fetch real logs from DB
      const token = localStorage.getItem('token');
      const res = await api.get(`/admin/hardware-alerts/${encodeURIComponent(systemName)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dbLogs = res.data;

      // 2. Filter global alerts for the selected system
      // Some global alerts have a 'system' property (simulated ones), 
      // others might have a 'sensor' property (real-time ones from socket).
      const relevantSimulated = globalAlerts.filter(alert => {
        if (alert.system === systemName) return true;
        if (systemMapping[systemName]?.includes(alert.sensor)) return true;
        return false;
      });

      // 3. Merge and Sort by Date (newest first)
      const mergedLogs = [...relevantSimulated, ...dbLogs].sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      );

      setSensorLogs(mergedLogs);
    } catch (err) {
      console.error('Failed to fetch system logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  return (
    <div className="bg-[#15171E] p-6 w-full font-sans text-gray-300 rounded-sm border border-[#2B2F3A] mb-8 overflow-hidden">
      <h2 className="text-lg font-medium text-gray-100 mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        IoT Telemetry & Security Matrix
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#1D212A] border-y border-[#2B2F3A] text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">System</th>
              <th className="px-4 py-3">Errors (Crit)</th>
              <th className="px-4 py-3">Warnings (High)</th>
              <th className="px-4 py-3">Success (Norm)</th>
              <th className="px-4 py-3">Info (Low)</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {telemetryMatrix.map((item) => {
              return (
                <tr
                  key={item.id}
                  onClick={() => handleRowClick(item.system)}
                  className="border-b border-[#2B2F3A] hover:bg-[#2B2F3A] transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-gray-200 font-medium">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                      </span>
                      <span>{item.system}</span>
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 ${item.error > 0 ? 'text-[#D32D5F] font-bold' : 'text-gray-600'}`}
                  >
                    {item.error}
                  </td>
                  <td
                    className={`px-4 py-3 ${item.warning > 0 ? 'text-[#F57C00] font-bold' : 'text-gray-600'}`}
                  >
                    {item.warning}
                  </td>
                  <td
                    className={`px-4 py-3 ${item.success > 0 ? 'text-[#009688] font-bold' : 'text-gray-600'}`}
                  >
                    {item.success}
                  </td>
                  <td
                    className={`px-4 py-3 ${item.info > 0 ? 'text-[#00B3E6] font-bold' : 'text-gray-600'}`}
                  >
                    {item.info}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${item.action > 0 ? 'text-[#9C27B0] font-bold' : 'text-gray-600'}`}
                  >
                    {item.action}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedSensor && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#15171E] border border-[#2B2F3A] rounded-sm w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-zoom-in">
            <div className="bg-[#1D212A] border-b border-[#2B2F3A] p-4 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-100 flex items-center gap-3 italic">
                <span className="w-2 h-2 bg-smart-glow rounded-full animate-pulse"></span>
                Raw Logs: <span className="text-smart-glow uppercase tracking-widest font-black ml-1">{selectedSensor}</span>
              </h3>
              <button
                onClick={() => setSelectedSensor(null)}
                className="text-gray-400 hover:text-white hover:bg-[#2B2F3A] rounded-md p-1.5 transition-colors font-sans text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto p-0 custom-scrollbar">
              {loadingLogs ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-smart-glow"></div>
                  <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Analyzing Data Packets...</span>
                </div>
              ) : sensorLogs.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#1D212A] z-10 shadow-md border-y border-[#2B2F3A] text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2B2F3A] font-mono text-[11px]">
                    {sensorLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-[#1D212A]/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-sm border font-bold uppercase tracking-tighter ${
                            log.type === 'error' ? 'bg-[#D32D5F]/10 text-[#D32D5F] border-[#D32D5F]/30' :
                            log.type === 'warning' ? 'bg-[#F57C00]/10 text-[#F57C00] border-[#F57C00]/30' :
                            log.type === 'success' ? 'bg-[#009688]/10 text-[#009688] border-[#009688]/30' :
                            log.type === 'info' ? 'bg-[#00B3E6]/10 text-[#00B3E6] border-[#00B3E6]/30' :
                            'bg-[#9C27B0]/10 text-[#9C27B0] border-[#9C27B0]/30'
                          }`}>
                            {log.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 w-full break-words text-gray-300">
                          {log.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500 font-bold uppercase tracking-widest text-[10px]">
                  No raw logs available for this system.
                </div>
              )}
            </div>

            <div className="bg-[#1D212A] border-t border-[#2B2F3A] p-3 text-right">
              <button
                onClick={() => setSelectedSensor(null)}
                className="px-6 py-2 bg-[#2B2F3A] hover:bg-[#3B3F4A] text-gray-100 font-black text-[10px] uppercase tracking-widest rounded-sm transition-all border border-[#3B3F4A]"
              >
                Close Matrix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HardwareStatsWidget;
