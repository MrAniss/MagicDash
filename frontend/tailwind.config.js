/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-page': '#F4F6F9',
        'bg-card': '#FFFFFF',
        'bg-card2': '#F0F4FF',
        'bg-zebra': '#FAFBFD',
        'navy': { DEFAULT: '#1A2E4A', light: '#243660', muted: '#8896B0' },
        'mint': { DEFAULT: '#00E89A', dark: '#00B87A', bg: '#E8FDF5' },
        'success': '#00B87A',
        'success-bg': '#E8FDF5',
        'warning': '#F5A623',
        'warning-bg': '#FFF8ED',
        'danger': '#E8524A',
        'danger-bg': '#FEF2F2',
        'border': 'rgba(26, 46, 74, 0.08)',
        'border-strong': 'rgba(26, 46, 74, 0.15)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'card': '16px',
        'inner': '8px',
        'chart': '12px',
      },
      boxShadow: {
        'card': '0 1px 4px rgba(26, 46, 74, 0.06)',
        'header': '0 2px 8px rgba(26, 46, 74, 0.06)',
      },
      keyframes: {
        'progress-shimmer': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'progress-shimmer': 'progress-shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
