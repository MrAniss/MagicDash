export const GA4_PROPERTIES = {
  'COCOONCENTER':            '298280318', // Roll-up global
  'PASCAL_COSTE':            '346986639',
  'PARAPHARMACIE_LAFAYETTE': '280350749',
};

// Market-specific properties for Cocooncenter
export const COCOONCENTER_MARKET_PROPERTIES = {
  'FR': '297164026',
  'UK': '297197708',
  'BE': '297236143',
  'DE': '297208735',
  'ES': '297199070',
  'IT': '310081214',
  'PL': '426749996',
  'NL': '529713804',
  'AT': '525602588',
  'PT': '527176005',
  'LU': '525651364',
  'RO': '529780158',
  'FI': '529784173',
  'SE': '529792779',
  'IE': '5747584038',
  // Markets under .co.uk property
  'NO': '297197708',
  'SA': '297197708',
  'CA': '297197708',
  'AU': '297197708',
  'US': '297197708',
};

export const BRAND_KEY_TO_PROPERTY = {
  'COCOONCENTER':            '298280318',
  'PASCAL_COSTE':            '346986639',
  'PARAPHARMACIE_LAFAYETTE': '280350749',
};

/**
 * Resolves the correct property ID based on brand and market
 */
export function resolvePropertyId(brand, market = 'ALL') {
  const bKey = (brand || '').toUpperCase();
  
  if (bKey === 'COCOONCENTER' && market !== 'ALL') {
    return COCOONCENTER_MARKET_PROPERTIES[market] || GA4_PROPERTIES.COCOONCENTER;
  }
  
  return GA4_PROPERTIES[bKey] || GA4_PROPERTIES.COCOONCENTER;
}
