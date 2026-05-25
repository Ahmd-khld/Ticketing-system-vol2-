/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        parkGreen: '#2E8B57',
        parkBlue: '#4682B4',
        smart: {
          dark: '#0B4228', // Deep forest green
          light: '#80C241', // Vibrant leaf green
          glow: '#B2FF4A', // Bright neon accent
          bg: '#F8FAF8', // Soft off-white
          gray: '#4B5563', // Standard cool gray for text
        },
      },
    },
  },
  plugins: [],
};
