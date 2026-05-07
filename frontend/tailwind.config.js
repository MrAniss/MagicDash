/** @type {import('tailwindcss').Config} */
//
// MagicDash design tokens.
//
// Token names (`navy`, `mint`) are legacy. They map to the new MagicDash
// brand palette: deep violet (primary) + electric cyan (accent). Renaming
// the tokens themselves is left as future cleanup — for now the values
// here are the single source of truth and will propagate everywhere via
// Tailwind classes that already reference these names.
//
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-page':  '#FAFAFD',  // very light violet-tinted background
        'bg-card':  '#FFFFFF',
        'bg-card2': '#F5F3FF',  // light violet card alt
        'bg-zebra': '#F9F8FB',

        // Primary brand colour — was "navy", now MagicDash deep violet.
        'navy': {
          DEFAULT: '#5B21B6', // violet-700
          light:   '#7C3AED', // violet-600
          muted:   '#94A3B8', // slate-400 for de-emphasised text
        },

        // Accent — was "mint", now MagicDash electric cyan.
        'mint': {
          DEFAULT: '#06B6D4', // cyan-500
          dark:    '#0891B2', // cyan-600
          bg:      '#ECFEFF', // cyan-50
        },

        'success':      '#10B981', // emerald-500 (was mint, kept distinct)
        'success-bg':   '#ECFDF5',
        'warning':      '#F59E0B', // amber-500
        'warning-bg':   '#FFFBEB',
        'danger':       '#EF4444', // red-500
        'danger-bg':    '#FEF2F2',
        'border':         'rgba(91, 33, 182, 0.10)',
        'border-strong':  'rgba(91, 33, 182, 0.18)',

        // Brand-specific extras, accessible directly when needed
        'magic': {
          violet: '#7C3AED',
          fuchsia: '#EC4899',
          indigo:  '#6366F1',
          cyan:    '#06B6D4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'card':  '16px',
        'inner': '8px',
        'chart': '12px',
      },
      boxShadow: {
        'card':   '0 1px 4px rgba(91, 33, 182, 0.06)',
        'header': '0 2px 8px rgba(91, 33, 182, 0.06)',
        'magic':  '0 12px 32px -8px rgba(124, 58, 237, 0.35)',
      },
      backgroundImage: {
        'magic-gradient':  'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
        'magic-soft':      'linear-gradient(135deg, #F5F3FF 0%, #FDF4FF 100%)',
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
