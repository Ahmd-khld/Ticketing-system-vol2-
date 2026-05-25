import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

const WeatherWidget = () => {
  const [weather, setWeather] = useState(() => {
    // Try to load cached weather on initialization
    try {
      const cached = localStorage.getItem('weather_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        // Only use if less than 1 hour old
        if (Date.now() - parsed.timestamp < 3600000) {
          return parsed.data;
        }
      }
    } catch (e) {
      console.error('Weather cache read error:', e);
    }
    return null;
  });
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(!weather);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=30.0444&longitude=31.2357&daily=temperature_2m_max&current_weather=true&timezone=Africa%2FCairo'
        );
        if (!response.ok) throw new Error('Weather API failed');
        const data = await response.json();

        const weatherData = {
          currentTemp: data.current_weather.temperature,
          forecast: data.daily.time.slice(0, 3).map((time, index) => ({
            date: time,
            maxTemp: data.daily.temperature_2m_max[index],
          })),
        };

        setWeather(weatherData);
        // Save to cache
        localStorage.setItem('weather_cache', JSON.stringify({
          timestamp: Date.now(),
          data: weatherData
        }));
      } catch (err) {
        console.error('Weather fetch error:', err);
        // Only show error if we have no cached data
        if (!weather) setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchWeather();
  }, [weather]);

  if (isLoading) {
    return (
      <div className="w-[280px] h-[280px] bg-slate-800/80 animate-pulse rounded-[36px] flex flex-col justify-between p-8 border border-white/5 shadow-2xl backdrop-blur-sm">
        <div className="flex justify-between items-start">
          {/* Temperature Placeholder */}
          <div className="w-20 h-16 bg-slate-700/50 rounded-2xl animate-pulse" />
          {/* Sun Icon Placeholder */}
          <div className="w-12 h-12 bg-slate-700/50 rounded-lg animate-pulse" />
        </div>
        
        {/* Status Text Placeholder */}
        <div className="w-32 h-6 bg-slate-700/50 rounded-md animate-pulse -mt-4" />
        
        {/* Forecast Rows Placeholder */}
        <div className="flex justify-between items-end gap-3 mt-4">
          <div className="flex-1 h-12 bg-slate-700/50 rounded-xl animate-pulse" />
          <div className="flex-1 h-12 bg-slate-700/50 rounded-xl animate-pulse" />
          <div className="flex-1 h-12 bg-slate-700/50 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (hasError || !weather) return null;

  const getDayName = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  };

  return (
    <StyledWrapper>
      <div className="card sunny">
        <div className="sky">
          <div className="sun-container">
            <div className="sun-glow" />
            <div className="sun-core" />
          </div>
          <svg className="landscape" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 80 L15 72 L30 78 L50 65 L75 75 L100 62 V100 H0 Z" fill="#4d6d3d" />
            <path d="M0 90 L25 84 L50 92 L80 86 L100 92 V100 H0 Z" fill="#6a994e" />
          </svg>
        </div>
        <div className="content">
          <div className="main-temp">
            <div
              style={{
                fontSize: '3.5rem',
                fontWeight: 'bold',
                textShadow: '4px 4px 0px rgba(0,0,0,0.15)',
              }}
            >
              {Math.round(weather.currentTemp)}°
            </div>
          </div>
          <div className="current-status">
            <svg className="icon-weather" viewBox="0 0 20 20">
              <path
                d="M9 2 h2 v2 h-2 z M9 16 h2 v2 h-2 z M2 9 h2 v2 h-2 z M16 9 h2 v2 h-2 z"
                fill="white"
              />
              <path d="M7 7 h6 v6 h-6 z" fill="white" />
              <path
                d="M4 4 h2 v2 h-2 z M14 4 h2 v2 h-2 z M4 14 h2 v2 h-2 z M14 14 h2 v2 h-2 z"
                fill="white"
                opacity="0.6"
              />
            </svg>
            <span>Sunny Day</span>
          </div>
          <div className="forecast">
            {weather.forecast.map((day, index) => (
              <div key={day.date} className={`day-col ${index === 0 ? 'active' : ''}`}>
                <span className="day-label">{getDayName(day.date)}</span>
                <span className="day-val">{Math.round(day.maxTemp)}°</span>
              </div>
            ))}
          </div>
        </div>
        <div className="scanlines" />
      </div>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .card.sunny {
    width: 280px;
    height: 280px;
    background: linear-gradient(180deg, #ffb347 0%, #ff8c42 100%);
    border-radius: 36px;
    position: relative;
    overflow: hidden;
    font-family: 'Courier New', Courier, monospace;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    user-select: none;
  }

  .card.sunny:hover {
    transform: translateY(-8px);
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.45);
  }

  .sky {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .sun-container {
    position: absolute;
    top: 35px;
    right: 35px;
    width: 50px;
    height: 50px;
  }

  .sun-core {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 4px;
    box-shadow:
      0 0 25px #fff,
      0 0 50px #ffea00;
    z-index: 2;
    position: relative;
  }

  .sun-glow {
    position: absolute;
    inset: -15px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.4) 0%, transparent 70%);
    animation: sunPulse 3s ease-in-out infinite;
  }

  @keyframes sunPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.3);
      opacity: 0.8;
    }
  }

  .landscape {
    position: absolute;
    bottom: 0;
    width: 100%;
    height: 45%;
    shape-rendering: crispEdges;
  }

  .content {
    position: relative;
    z-index: 10;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    color: white;
  }

  .main-temp {
    padding: 35px 25px 0;
    filter: drop-shadow(3px 3px 0px rgba(0, 0, 0, 0.1));
  }

  .pixel-svg {
    width: 110px;
    height: auto;
    shape-rendering: crispEdges;
  }

  .current-status {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 30px;
    margin-top: -20px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-size: 13px;
    text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.15);
  }

  .icon-weather {
    width: 22px;
    height: 22px;
    shape-rendering: crispEdges;
  }

  .forecast {
    display: flex;
    justify-content: space-between;
    padding: 22px 30px;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    border-top: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 -5px 15px rgba(0, 0, 0, 0.05);
    border-radius: 0 0 35px 35px;
  }

  .day-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    opacity: 0.75;
  }

  .day-col.active {
    opacity: 1;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
  }

  .day-label {
    font-size: 10px;
    font-weight: 800;
    color: #fff;
  }

  .day-val {
    font-size: 15px;
    font-weight: bold;
  }

  .scanlines {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.04) 50%);
    background-size: 100% 4px;
    pointer-events: none;
    z-index: 20;
  }
`;

export default WeatherWidget;
