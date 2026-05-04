// Search Console property mapping per brand. Properties live in .env so
// the source tree doesn't enumerate which domains each brand owns.
//
// type: 'url' → full URL with trailing slash; 'domain' → sc-domain: prefix.
// We infer the type from the env value's prefix so the operator only fills
// in one variable per brand instead of (property, type) pairs.

import './loadEnv.js';

function inferType(value) {
  return value.startsWith('sc-domain:') ? 'domain' : 'url';
}

function buildEntry(envKey, market = 'FR', country = 'fra') {
  const property = process.env[envKey] || '';
  return { property, type: inferType(property), market, country };
}

export const GSC_PROPERTIES = {
  'Cocooncenter':            buildEntry('GSC_PROPERTY_COCOONCENTER'),
  'Pascal Coste Shopping':   buildEntry('GSC_PROPERTY_PASCAL_COSTE'),
  'Parapharmacie Lafayette': buildEntry('GSC_PROPERTY_PARAPHARMACIE_LAFAYETTE'),
};

// Aliases accepted by API param (matches existing brand keys elsewhere).
export const BRAND_ALIASES = {
  'COCOONCENTER': 'Cocooncenter',
  'Cocooncenter': 'Cocooncenter',
  'PASCAL_COSTE': 'Pascal Coste Shopping',
  'Pascal Coste Shopping': 'Pascal Coste Shopping',
  'PARAPHARMACIE_LAFAYETTE': 'Parapharmacie Lafayette',
  'Parapharmacie Lafayette': 'Parapharmacie Lafayette',
};

export function resolveBrandLabel(brand) {
  const b = (brand || '').toUpperCase();
  return BRAND_ALIASES[b] || brand;
}

export function resolveAdsBrandKey(brandLabel) {
  if (brandLabel === 'Cocooncenter') return 'COCOONCENTER';
  if (brandLabel === 'Pascal Coste Shopping') return 'PASCAL_COSTE';
  if (brandLabel === 'Parapharmacie Lafayette') return 'PARAPHARMACIE_LAFAYETTE';
  return brandLabel;
}
