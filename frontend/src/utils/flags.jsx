import React from 'react';

const MARKET_TO_ISO = {
  'FR': 'fr', 'BE': 'be', 'NL': 'nl', 'DE': 'de', 'IT': 'it', 'ES': 'es',
  'UK': 'gb', 'AT': 'at', 'PT': 'pt', 'LU': 'lu', 'SE': 'se', 'NO': 'no',
  'FI': 'fi', 'PL': 'pl', 'IE': 'ie', 'RO': 'ro', 'SA': 'sa', 'CA': 'ca',
  'AU': 'au', 'US': 'us',
};

const MARKET_NAMES = {
  'FR': 'France', 'BE': 'Belgique', 'NL': 'Pays-Bas', 'DE': 'Allemagne',
  'IT': 'Italie', 'ES': 'Espagne', 'UK': 'Royaume-Uni', 'AT': 'Autriche',
  'PT': 'Portugal', 'LU': 'Luxembourg', 'SE': 'Suede', 'NO': 'Norvege',
  'FI': 'Finlande', 'PL': 'Pologne', 'IE': 'Irlande', 'RO': 'Roumanie',
  'SA': 'Arabie Saoudite', 'CA': 'Canada', 'AU': 'Australie', 'US': 'Etats-Unis',
  'Autres pays': 'Autres pays',
};

/**
 * Returns a small flag <img> element using flagcdn.com SVGs.
 * For "Autres pays" returns a globe SVG.
 */
export function FlagIcon({ market, size = 16 }) {
  if (market === 'Autres pays') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }
  const iso = MARKET_TO_ISO[market];
  if (!iso) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={market}
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: 2 }}
    />
  );
}

/**
 * Returns the full market name.
 */
export function marketName(market) {
  return MARKET_NAMES[market] || market;
}

/**
 * JSX: flag + market code, for use in table cells and labels.
 */
export function MarketLabel({ market, showFullName = false }) {
  const label = showFullName ? marketName(market) : market;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <FlagIcon market={market} />
      {label}
    </span>
  );
}
