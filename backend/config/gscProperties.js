// Search Console property mapping per brand.
// type: 'url' → full URL with trailing slash; 'domain' → sc-domain: prefix.

export const GSC_PROPERTIES = {
  'Cocooncenter': {
    property: 'https://www.cocooncenter.com/',
    type: 'url',
    market: 'FR',
    country: 'fra',
  },
  'Pascal Coste Shopping': {
    property: 'sc-domain:pascalcoste-shopping.com',
    type: 'domain',
    market: 'FR',
    country: 'fra',
  },
  'Parapharmacie Lafayette': {
    property: 'sc-domain:parapharmacielafayette.com',
    type: 'domain',
    market: 'FR',
    country: 'fra',
  },
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
  return BRAND_ALIASES[brand] || brand;
}

export function resolveAdsBrandKey(brandLabel) {
  if (brandLabel === 'Cocooncenter') return 'COCOONCENTER';
  if (brandLabel === 'Pascal Coste Shopping') return 'PASCAL_COSTE';
  if (brandLabel === 'Parapharmacie Lafayette') return 'PARAPHARMACIE_LAFAYETTE';
  return brandLabel;
}
