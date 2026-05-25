import React, { createContext, useContext, useState, useEffect } from 'react';
import { socket } from '../socket';

const TelemetryContext = createContext();

const systemMapping = {
  'Ambient Lighting': ['LDR', 'LED Lamp'],
  'Automated Gate': ['Gate Ultrasonic', 'Gate Servo'],
  'Smart Irrigation': ['Soil Moisture', 'DHT11', 'Water Pump'],
  'Smart Recycle Bins': ['RGB Ultrasonic', 'RGB LED'],
};

export const TelemetryProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);
  const [totalAlertsCount, setTotalAlertsCount] = useState(0);
  const [telemetryMatrix, setTelemetryMatrix] = useState([
    { id: 1, system: 'Ambient Lighting', error: 0, warning: 0, success: 12, info: 2, action: 0 },
    { id: 2, system: 'Automated Gate', error: 1, warning: 0, success: 45, info: 4, action: 0 },
    { id: 3, system: 'Smart Irrigation', error: 0, warning: 1, success: 1, info: 0, action: 1 },
    { id: 4, system: 'Smart Recycle Bins', error: 0, warning: 1, success: 0, info: 0, action: 0 },
  ]);

  // Utility to update matrix based on a single alert
  const updateMatrixWithAlert = (alert) => {
    let targetSystem = null;
    if (alert.system) {
      targetSystem = alert.system;
    } else {
      for (const [sys, sensors] of Object.entries(systemMapping)) {
        if (sensors.includes(alert.sensor)) {
          targetSystem = sys;
          break;
        }
      }
    }

    if (!targetSystem) return;

    setTelemetryMatrix((prevMatrix) =>
      prevMatrix.map((row) => {
        if (row.system === targetSystem) {
          return {
            ...row,
            [alert.type]: (row[alert.type] || 0) + 1,
          };
        }
        return row;
      })
    );
  };

  // --- Real-time WebSocket Logic ---
  useEffect(() => {
    const onHardwareAlert = (newAlert) => {
      const formattedAlert = {
        _id: newAlert.id || newAlert._id,
        message: newAlert.message,
        type: newAlert.type,
        sensor: newAlert.sensor,
        timeString: newAlert.time || newAlert.timeString,
        createdAt: newAlert.createdAt || new Date().toISOString(),
      };

      // 1. Update Feed (Keep global state in sync)
      setAlerts((prev) => {
        const exists = prev.find(a => a._id === formattedAlert._id);
        if (exists) return prev;
        return [formattedAlert, ...prev].slice(0, 100);
      });
      setTotalAlertsCount((prev) => prev + 1);

      // 2. Update Matrix
      updateMatrixWithAlert(formattedAlert);
    };

    socket.on('hardwareAlert', onHardwareAlert);
    return () => socket.off('hardwareAlert', onHardwareAlert);
  }, []);

  // --- Live Demo Mode Simulation ---
  useEffect(() => {
    const demoEvents = [
      { system: 'Smart Irrigation', type: 'success', message: 'Automated irrigation cycle completed in Sector 2.' },
      { system: 'Automated Gate', type: 'error', message: 'Unrecognized QR code scanned at Staff Entrance.' },
      { system: 'Smart Recycle Bins', type: 'warning', message: 'Smart Bin #4 in Sector A is at 95% capacity.' },
      { system: 'Automated Gate', type: 'info', message: 'RFID Ramp deployed successfully at West Gate.' },
      { system: 'Ambient Lighting', type: 'info', message: 'Pathway lamps activated due to low ambient light.' },
      { system: 'Smart Irrigation', type: 'warning', message: 'Zone C moisture dropped below 30%. Irrigation scheduled.' },
    ];

    const demoInterval = setInterval(() => {
      const event = demoEvents[Math.floor(Math.random() * demoEvents.length)];
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const newAlert = {
        _id: `demo-${Date.now()}`,
        message: event.message,
        type: event.type,
        system: event.system,
        timeString: timestamp,
        createdAt: new Date().toISOString(),
      };

      setAlerts((prev) => [newAlert, ...prev].slice(0, 100));
      setTotalAlertsCount((prev) => prev + 1);
      updateMatrixWithAlert(newAlert);
    }, 3500);

    return () => clearInterval(demoInterval);
  }, []);

  return (
    <TelemetryContext.Provider value={{ 
      alerts, 
      setAlerts, 
      totalAlertsCount, 
      setTotalAlertsCount,
      telemetryMatrix, 
      setTelemetryMatrix 
    }}>
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => {
  const context = useContext(TelemetryContext);
  if (!context) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return context;
};
