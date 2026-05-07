// GA4 property IDs are read from .env so the source tree stays free of
// brand-specific identifiers. Markets without a configured property fall
// back to their brand's rollup property at resolve time.

import './loadEnv.js';

function readProp(envKey) {
  return process.env[envKey] || null;
}

export const GA4_PROPERTIES = {
  COCOONCENTER:            readProp('GA4_PROPERTY_COCOONCENTER'),
  PASCAL_COSTE:            readProp('GA4_PROPERTY_PASCAL_COSTE'),
  PARAPHARMACIE_LAFAYETTE: readProp('GA4_PROPERTY_PARAPHARMACIE_LAFAYETTE'),
  LASANTE:                 readProp('GA4_PROPERTY_LASANTE'),
};

// Market → env var. Several markets are intentionally routed through the
// .co.uk property (single GA4 install serving multiple country domains).
const COCOONCENTER_MARKET_ENV = {
  FR: 'GA4_PROPERTY_COCOONCENTER_FR',
  UK: 'GA4_PROPERTY_COCOONCENTER_UK',
  BE: 'GA4_PROPERTY_COCOONCENTER_BE',
  DE: 'GA4_PROPERTY_COCOONCENTER_DE',
  ES: 'GA4_PROPERTY_COCOONCENTER_ES',
  IT: 'GA4_PROPERTY_COCOONCENTER_IT',
  PL: 'GA4_PROPERTY_COCOONCENTER_PL',
  NL: 'GA4_PROPERTY_COCOONCENTER_NL',
  AT: 'GA4_PROPERTY_COCOONCENTER_AT',
  PT: 'GA4_PROPERTY_COCOONCENTER_PT',
  LU: 'GA4_PROPERTY_COCOONCENTER_LU',
  RO: 'GA4_PROPERTY_COCOONCENTER_RO',
  FI: 'GA4_PROPERTY_COCOONCENTER_FI',
  SE: 'GA4_PROPERTY_COCOONCENTER_SE',
  IE: 'GA4_PROPERTY_COCOONCENTER_IE',
  // Markets routed through the shared .co.uk property
  NO: 'GA4_PROPERTY_COCOONCENTER_UK',
  SA: 'GA4_PROPERTY_COCOONCENTER_UK',
  CA: 'GA4_PROPERTY_COCOONCENTER_UK',
  AU: 'GA4_PROPERTY_COCOONCENTER_UK',
  US: 'GA4_PROPERTY_COCOONCENTER_UK',
};

export const COCOONCENTER_MARKET_PROPERTIES = Object.fromEntries(
  Object.entries(COCOONCENTER_MARKET_ENV).map(([market, envKey]) => [market, readProp(envKey)]),
);

export const BRAND_KEY_TO_PROPERTY = GA4_PROPERTIES;

/**
 * Resolves the correct property ID based on brand and market.
 * Falls back to the brand-level rollup if the market-specific property is
 * not configured.
 */
export function resolvePropertyId(brand, market = 'ALL') {
  const bKey = (brand || '').toUpperCase();
  if (bKey === 'COCOONCENTER' && market !== 'ALL') {
    return COCOONCENTER_MARKET_PROPERTIES[market] || GA4_PROPERTIES.COCOONCENTER;
  }
  return GA4_PROPERTIES[bKey] || GA4_PROPERTIES.COCOONCENTER;
}
