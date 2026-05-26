import React from 'react';
import styled from 'styled-components';

const CloudBackground = () => {
  // Balanced parameters for high visibility
  const clouds = [
    { top: '15%', scale: 1.5, duration: '80s', delay: '0s', opacity: 0.15 },
    { top: '35%', scale: 1.0, duration: '65s', delay: '-20s', opacity: 0.12 },
    { top: '55%', scale: 2.0, duration: '110s', delay: '-50s', opacity: 0.1 },
    { top: '75%', scale: 1.2, duration: '90s', delay: '-10s', opacity: 0.14 },
    { top: '10%', scale: 1.8, duration: '130s', delay: '-70s', opacity: 0.11 },
    { top: '45%', scale: 2.5, duration: '160s', delay: '-40s', opacity: 0.08 },
  ];

  return (
    <StyledWrapper className="fixed inset-0 z-0 pointer-events-none overflow-hidden hidden dark:block">
      {clouds.map((cloud, index) => (
        <div
          key={index}
          className="cloud-container animate-drift"
          style={{
            top: cloud.top,
            animationDuration: cloud.duration,
            animationDelay: cloud.delay,
            transform: `scale(${cloud.scale})`,
          }}
        >
          <div
            className="cloud"
            style={{
              opacity: cloud.opacity,
            }}
          >
            <div className="cloud-body" />
          </div>
        </div>
      ))}
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .cloud-container {
    position: absolute;
    left: 0;
    width: 200px;
    height: 100px;
    will-change: transform;
    backface-visibility: hidden;
  }

  .cloud {
    position: relative;
    width: 200px;
    height: 100px;
    filter: blur(8px) drop-shadow(0 10px 30px rgba(255, 255, 255, 0.02));
  }

  /* Cartoon Cloud Shape using CSS */
  .cloud-body {
    position: absolute;
    width: 80px;
    height: 80px;
    background: #cbd5e1; /* Slate-300 (Much brighter) */
    border-radius: 50%;
    box-shadow: 
      50px 15px 0 5px #cbd5e1, 
      90px 5px 0 -5px #cbd5e1, 
      40px -25px 0 10px #cbd5e1, 
      -10px 0px 0 0px #cbd5e1;
    
    /* Highlight effect for cartoon look */
    &::after {
      content: '';
      position: absolute;
      top: -15px;
      left: 15px;
      width: 40px;
      height: 20px;
      background: rgba(255, 255, 255, 0.4);
      border-radius: 50%;
      filter: blur(6px);
    }
  }
`;

export default CloudBackground;
