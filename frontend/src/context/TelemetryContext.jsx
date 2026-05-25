import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import api from '../api';

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
    { id: 1, system: 'Ambient Lighting', error: 0, warning: 0, success: 0, info: 0, action: 0 },
    { id: 2, system: 'Automated Gate', error: 0, warning: 0, success: 0, info: 0, action: 0 },
    { id: 3, system: 'Smart Irrigation', error: 0, warning: 0, success: 0, info: 0, action: 0 },
    { id: 4, system: 'Smart Recycle Bins', error: 0, warning: 0, success: 0, info: 0, action: 0 },
  ]);

  const lastFetchRef = useRef(0);
  const cacheDuration = 3000; // 3 seconds as requested

  const fetchMatrixData = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchRef.current < cacheDuration) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await api.get('/admin/hardware-stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const stats = res.data;
      setTelemetryMatrix((prevMatrix) =>
        prevMatrix.map((row) => {
          const serverRow = stats[row.system];
          if (serverRow) {
            return {
              ...row,
              ...serverRow
            };
          }
          return row;
        })
      );
      lastFetchRef.current = now;
    } catch (err) {
      console.error('Failed to fetch hardware stats:', err);
    }
  };

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

  // Initial fetch and polling
  useEffect(() => {
    fetchMatrixData(true);

    const interval = setInterval(() => {
      fetchMatrixData();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

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

      // 1. Update Feed
      setAlerts((prev) => {
        const exists = prev.find(a => a._id === formattedAlert._id);
        if (exists) return prev;
        return [formattedAlert, ...prev].slice(0, 100);
      });
      setTotalAlertsCount((prev) => prev + 1);

      // 2. Update Matrix Locally
      updateMatrixWithAlert(formattedAlert);
    };

    const onHardwareAlertsCleared = () => {
      // Reset matrix to zero
      setTelemetryMatrix((prevMatrix) =>
        prevMatrix.map((row) => ({
          ...row,
          error: 0,
          warning: 0,
          success: 0,
          info: 0,
          action: 0,
        }))
      );
      setAlerts([]);
      setTotalAlertsCount(0);
      lastFetchRef.current = Date.now(); // Update cache ref so it doesn't immediately re-fetch old data
    };

    socket.on('hardwareAlert', onHardwareAlert);
    socket.on('hardwareAlertsCleared', onHardwareAlertsCleared);

    return () => {
      socket.off('hardwareAlert', onHardwareAlert);
      socket.off('hardwareAlertsCleared', onHardwareAlertsCleared);
    };
  }, []);

  return (
    <TelemetryContext.Provider value={{ 
      alerts, 
      setAlerts, 
      totalAlertsCount, 
      setTotalAlertsCount,
      telemetryMatrix, 
      setTelemetryMatrix,
      fetchMatrixData
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
