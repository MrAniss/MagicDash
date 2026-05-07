// GA4 property IDs are read from .env so the source tree stays free of
// brand-specific identifiers. Markets without a configured property fall
// back to their brand's rollup property at resolve time.

import './loadEnv.js';
import { isDemoMode } from '../services/demo/demoMode.js';

function readProp(envKey) {
  return process.env[envKey] || null;
}

function demoPropFor(envKey) {
  // Stable fake property IDs in demo mode so resolvePropertyId always returns
  // a non-null value. The actual ID is never sent to a real API in demo mode.
  return `demo-prop-${envKey.toLowerCase()}`;
}

export const GA4_PROPERTIES = isDemoMode() ? {
  BRAND_A: demoPropFor('GA4_PROPERTY_BRAND_A'),
  BRAND_B: demoPropFor('GA4_PROPERTY_BRAND_B'),
  BRAND_C: demoPropFor('GA4_PROPERTY_BRAND_C'),
  BRAND_D: demoPropFor('GA4_PROPERTY_BRAND_D'),
} : {
  BRAND_A: readProp('GA4_PROPERTY_BRAND_A'),
  BRAND_B: readProp('GA4_PROPERTY_BRAND_B'),
  BRAND_C: readProp('GA4_PROPERTY_BRAND_C'),
  BRAND_D: readProp('GA4_PROPERTY_BRAND_D'),
};

// Market → env var. Several markets are intentionally routed through the
// .co.uk property (single GA4 install serving multiple country domains).
const BRAND_A_MARKET_ENV = {
  FR: 'GA4_PROPERTY_BRAND_A_FR',
  UK: 'GA4_PROPERTY_BRAND_A_UK',
  BE: 'GA4_PROPERTY_BRAND_A_BE',
  DE: 'GA4_PROPERTY_BRAND_A_DE',
  ES: 'GA4_PROPERTY_BRAND_A_ES',
  IT: 'GA4_PROPERTY_BRAND_A_IT',
  PL: 'GA4_PROPERTY_BRAND_A_PL',
  NL: 'GA4_PROPERTY_BRAND_A_NL',
  AT: 'GA4_PROPERTY_BRAND_A_AT',
  PT: 'GA4_PROPERTY_BRAND_A_PT',
  LU: 'GA4_PROPERTY_BRAND_A_LU',
  RO: 'GA4_PROPERTY_BRAND_A_RO',
  FI: 'GA4_PROPERTY_BRAND_A_FI',
  SE: 'GA4_PROPERTY_BRAND_A_SE',
  IE: 'GA4_PROPERTY_BRAND_A_IE',
  // Markets routed through the shared .co.uk property
  NO: 'GA4_PROPERTY_BRAND_A_UK',
  SA: 'GA4_PROPERTY_BRAND_A_UK',
  CA: 'GA4_PROPERTY_BRAND_A_UK',
  AU: 'GA4_PROPERTY_BRAND_A_UK',
  US: 'GA4_PROPERTY_BRAND_A_UK',
};

export const BRAND_A_MARKET_PROPERTIES = isDemoMode()
  ? Object.fromEntries(
      Object.entries(BRAND_A_MARKET_ENV).map(([market, envKey]) => [market, demoPropFor(envKey)]),
    )
  : Object.fromEntries(
      Object.entries(BRAND_A_MARKET_ENV).map(([market, envKey]) => [market, readProp(envKey)]),
    );

export const BRAND_KEY_TO_PROPERTY = GA4_PROPERTIES;

/**
 * Resolves the correct property ID based on brand and market.
 * Falls back to the brand-level rollup if the market-specific property is
 * not configured.
 */
export function resolvePropertyId(brand, market = 'ALL') {
  const bKey = (brand || '').toUpperCase();
  if (bKey === 'BRAND_A' && market !== 'ALL') {
    return BRAND_A_MARKET_PROPERTIES[market] || GA4_PROPERTIES.BRAND_A;
  }
  return GA4_PROPERTIES[bKey] || GA4_PROPERTIES.BRAND_A;
}
