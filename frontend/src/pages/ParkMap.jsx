import React, { useState } from 'react';
import map3D from '../assets/park-3d-map.jpg';

const ParkMap = () => {
  const [selectedZone, setSelectedZone] = useState(null);

  const zones = {
    'Central Plaza': {
      color: 'bg-teal-100',
      icon: '🏛️',
      coords: { top: '48%', left: '50%' },
      description:
        'Smart Thermal Comfort (Solar shading & water spray) & Seating Occupancy Cameras.',
    },
    'Main Entrance': {
      color: 'bg-stone-200',
      icon: '🚪',
      coords: { top: '85%', left: '50%' },
      description: 'Inclusive Smart System (Automated ramps, doors, and blind guidance).',
    },
    'Eco-Station': {
      color: 'bg-emerald-200',
      icon: '♻️',
      coords: { top: '45%', left: '75%' },
      description: 'Automated Recycling System (Fill-level sensors & compression).',
    },
    'Botanical Sector': {
      color: 'bg-green-300',
      icon: '🌿',
      coords: { top: '45%', left: '25%' },
      description: 'Automated Soil Irrigation (Moisture sensors).',
    },
    'Wildlife Zone': {
      color: 'bg-orange-200',
      icon: '🦌',
      coords: { top: '15%', left: '50%' },
      description: 'Animal Food Dispensers (RFID tags & solar bird feeders).',
    },
    'Smart Track': {
      color: 'bg-gray-100',
      icon: '🏃',
      coords: { top: '75%', left: '20%' },
      description: 'Smart Lighting (Motion-activated).',
    },
  };

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-black py-6 md:py-12 px-4 md:px-6 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-2xl md:text-4xl font-black text-smart-dark dark:text-smart-glow mb-3 md:mb-4 uppercase tracking-tighter italic">
            INTERACTIVE PARK MAP
          </h1>
          <p className="text-sm md:text-base text-smart-gray dark:text-gray-400 font-medium">
            Click on the hotspots on the 3D map to explore integrated IoT systems.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-10 items-start">
          {/* 3D MAP CONTAINER */}
          <div className="lg:col-span-3 relative bg-white dark:bg-gray-800 p-2 md:p-4 rounded-[30px] md:rounded-[40px] shadow-2xl border-4 md:border-8 border-white dark:border-gray-700 group overflow-hidden">
            <div className="relative overflow-hidden rounded-[20px] md:rounded-[30px]">
              <img
                src={map3D}
                alt="Smart Garden 3D Map"
                className="w-full h-auto object-cover transform transition-transform duration-700 md:group-hover:scale-105"
              />

              {/* Overlay Darkener */}
              <div className="absolute inset-0 bg-black/5 pointer-events-none"></div>

              {/* INTERACTIVE PINS */}
              {Object.entries(zones).map(([name, data]) => (
                <button
                  key={name}
                  onClick={() => setSelectedZone(name)}
                  style={{ top: data.coords.top, left: data.coords.left }}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2 group/pin z-20 cursor-pointer"
                  title={`View details for ${name}`}
                >
                  {/* Pulsing Dot */}
                  <div className={`relative flex items-center justify-center`}>
                    <div
                      className={`absolute w-8 h-8 md:w-12 md:h-12 rounded-full ${selectedZone === name ? 'bg-smart-light animate-ping opacity-75' : 'bg-white animate-pulse opacity-40'}`}
                    ></div>
                    <div
                      className={`relative w-7 h-7 md:w-10 md:h-10 rounded-full shadow-lg flex items-center justify-center text-sm md:text-xl transition-all duration-300 border border-white
                      ${selectedZone === name ? 'bg-smart-light scale-125 text-white' : 'bg-white/90 dark:bg-gray-700/90 md:hover:scale-110 hover:bg-white'}`}
                    >
                      {data.icon}
                    </div>

                    {/* Tooltip on hover (desktop only) */}
                    <div className="hidden md:block absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover/pin:opacity-100 transition-opacity bg-smart-dark text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-lg whitespace-nowrap tracking-widest shadow-xl pointer-events-none">
                      {name}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* SIDE PANEL */}
          <div className="bg-white dark:bg-gray-800 rounded-[30px] md:rounded-[40px] shadow-xl p-6 md:p-8 border border-smart-light/20 dark:border-gray-700 h-full lg:sticky lg:top-28 transition-all">
            {selectedZone ? (
              <div className="animate-fade-in">
                <div
                  className={`${zones[selectedZone].color} dark:bg-smart-light/20 w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-2xl md:text-3xl mb-4 md:mb-6 shadow-inner ring-4 ring-white dark:ring-gray-700`}
                >
                  {zones[selectedZone].icon}
                </div>
                <h2 className="text-2xl md:text-3xl font-black text-smart-dark dark:text-white mb-2 uppercase italic leading-tight">
                  {selectedZone}
                </h2>
                <div className="h-1.5 w-12 md:w-16 bg-smart-light mb-4 md:mb-6 rounded-full"></div>

                <p className="text-smart-gray dark:text-gray-400 font-bold uppercase text-[9px] md:text-[10px] tracking-widest mb-2 md:mb-3">
                  System Specification
                </p>
                <p className="text-lg md:text-xl text-smart-dark dark:text-gray-300 leading-relaxed font-medium">
                  {zones[selectedZone].description}
                </p>

                <div className="mt-6 md:mt-10 bg-smart-bg dark:bg-gray-900 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-smart-light/10 dark:border-gray-800 shadow-inner">
                  <p className="text-xs md:text-sm text-smart-gray dark:text-gray-400 italic font-medium">
                    "Live data from {selectedZone} is being streamed to the command center."
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-8 md:py-12">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-smart-bg dark:bg-gray-900 rounded-full flex items-center justify-center mb-4 md:mb-6 shadow-inner">
                  <svg
                    className="w-8 h-8 md:w-10 md:h-10 text-smart-light/40 dark:text-gray-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    ></path>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    ></path>
                  </svg>
                </div>
                <p className="text-smart-gray dark:text-gray-400 font-bold text-base md:text-lg leading-snug px-4 italic">
                  Select a location on the 3D map to view IoT features
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

  );
};

export default ParkMap;
