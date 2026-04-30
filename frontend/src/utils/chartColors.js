// Centralized chart colors — keep in sync with tailwind.config.js tokens.
// Use these constants inside Recharts (where Tailwind classes can't apply).

export const CHART = {
  navy: '#1A2E4A',
  navyMuted: '#8896B0',
  success: '#00B87A',
  warning: '#F5A623',
  danger: '#E8524A',
  grid: '#E8EDF4',
  bgCard2: '#F0F4FF',
};

// Multi-series palette (markets, channels, partners…). Order matters.
export const CHART_PALETTE = [
  CHART.navy,
  CHART.success,
  CHART.warning,
  CHART.danger,
  '#6366f1',
  '#06b6d4',
  '#7F77DD',
  '#D4537E',
  '#378ADD',
];
