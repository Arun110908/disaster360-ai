/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#060d1f', 900: '#0a1428', 800: '#0f1d3a', 700: '#162a52', 600: '#1f3a6e' },
        alert: { DEFAULT: '#e11d48', dark: '#be123c' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      keyframes: {
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(225,29,72,.55)' }, '70%': { boxShadow: '0 0 0 10px rgba(225,29,72,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(225,29,72,0)' } },
        slideIn: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { pulseRing: 'pulseRing 1.8s infinite', slideIn: 'slideIn .25s ease-out' },
    },
  },
  plugins: [],
};
