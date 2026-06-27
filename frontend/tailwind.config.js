/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cyan: { DEFAULT: '#00AEEF', dark: '#009FD9' },
        navy: { DEFAULT: '#003366', dark: '#002244', light: '#1A4A7A' },
        green: { DEFAULT: '#1E7A3C', light: '#D4EDDA' },
        orange: { DEFAULT: '#F0A500', light: '#FFF3CD' },
        red: { DEFAULT: '#A32D2D', light: '#FCE8E8' },
        surface: { 0: '#F4F3EE', 1: '#FAFAF7', 2: '#FFFFFF' },
      },
    },
  },
  plugins: [],
};
