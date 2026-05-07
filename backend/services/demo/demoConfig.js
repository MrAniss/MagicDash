// Demo brand definitions used by the synthetic data generator.
// All shapes/fields are kept compatible with the real client outputs so the
// frontend cannot tell whether it is reading synthetic or real data.

export const DEMO_BRANDS = [
  {
    key: 'BRAND_A',
    label: 'Acme Beauty',
    mode: 'mcc', // multi-market
    markets: [
      { code: 'FR', label: 'France',         scale: 1.00 },
      { code: 'UK', label: 'United Kingdom', scale: 0.65 },
      { code: 'DE', label: 'Germany',        scale: 0.50 },
      { code: 'IT', label: 'Italy',          scale: 0.30 },
      { code: 'ES', label: 'Spain',          scale: 0.30 },
    ],
    baselineDailySpend: 1800,
    cpc: 0.55,
    ctr: 0.045,
    cvr: 0.022,
    aov: 65,
    campaignTemplates: [
      { name: 'Search - Brand',                type: 'Search',          share: 0.20 },
      { name: 'Search - Generic Skincare',     type: 'Search',          share: 0.10 },
      { name: 'Search - Generic Makeup',       type: 'Search',          share: 0.08 },
      { name: 'Search - Hair Care',            type: 'Search',          share: 0.05 },
      { name: 'PMax - Top Sellers',            type: 'Performance Max', share: 0.18 },
      { name: 'PMax - New Arrivals',           type: 'Performance Max', share: 0.08 },
      { name: 'Shopping - Standard',           type: 'Shopping',        share: 0.10 },
      { name: 'Shopping - Brand',              type: 'Shopping',        share: 0.05 },
      { name: 'DSA - Whole Site',              type: 'Search',          share: 0.05 },
      { name: 'Display - Remarketing',         type: 'Display',         share: 0.04 },
      { name: 'YouTube - Awareness',           type: 'Video',           share: 0.04 },
      { name: 'Demand Gen - Discovery',        type: 'Demand Gen',      share: 0.03 },
    ],
  },
  {
    key: 'BRAND_B',
    label: 'Acme Health',
    mode: 'standalone',
    markets: [{ code: 'FR', label: 'France', scale: 1.0 }],
    baselineDailySpend: 600,
    cpc: 0.45, ctr: 0.038, cvr: 0.025, aov: 48,
    campaignTemplates: [
      { name: 'Search - Brand',           type: 'Search',          share: 0.30 },
      { name: 'Search - Vitamins',        type: 'Search',          share: 0.15 },
      { name: 'Search - Supplements',     type: 'Search',          share: 0.12 },
      { name: 'PMax - Top Sellers',       type: 'Performance Max', share: 0.20 },
      { name: 'Shopping - Standard',      type: 'Shopping',        share: 0.15 },
      { name: 'Display - Remarketing',    type: 'Display',         share: 0.08 },
    ],
  },
  {
    key: 'BRAND_C',
    label: 'Acme Pharma',
    mode: 'standalone',
    markets: [{ code: 'FR', label: 'France', scale: 1.0 }],
    baselineDailySpend: 450,
    cpc: 0.50, ctr: 0.042, cvr: 0.020, aov: 55,
    campaignTemplates: [
      { name: 'Search - Brand',          type: 'Search',          share: 0.35 },
      { name: 'Search - Pharmacy',       type: 'Search',          share: 0.20 },
      { name: 'PMax - Catalog',          type: 'Performance Max', share: 0.25 },
      { name: 'Shopping - Standard',     type: 'Shopping',        share: 0.20 },
    ],
  },
  {
    key: 'BRAND_D',
    label: 'Acme Wellness',
    mode: 'standalone',
    markets: [{ code: 'FR', label: 'France', scale: 1.0 }],
    baselineDailySpend: 350,
    cpc: 0.40, ctr: 0.040, cvr: 0.018, aov: 70,
    campaignTemplates: [
      { name: 'Search - Brand',           type: 'Search',          share: 0.40 },
      { name: 'Search - Wellness',        type: 'Search',          share: 0.25 },
      { name: 'PMax - Top Sellers',       type: 'Performance Max', share: 0.20 },
      { name: 'Shopping - Standard',      type: 'Shopping',        share: 0.15 },
    ],
  },
];

// Brand-key → label map (matches real BRANDS[brand].name)
export const DEMO_BRAND_LABELS = {
  BRAND_A: 'Brand Alpha',
  BRAND_B: 'Brand Beta',
  BRAND_C: 'Brand Gamma',
  BRAND_D: 'Brand Delta',
};

export function findBrand(key) {
  return DEMO_BRANDS.find(b => b.key === key) || null;
}

export function getBrandMarkets(key) {
  const b = findBrand(key);
  return b ? b.markets : [];
}

export function getCampaignTemplates(key) {
  const b = findBrand(key);
  return b ? b.campaignTemplates : [];
}

// Iterate every (brand, market) combo defined in DEMO_BRANDS.
export function eachBrandMarket() {
  const out = [];
  for (const b of DEMO_BRANDS) {
    for (const m of b.markets) out.push({ brand: b, market: m });
  }
  return out;
}

// Stable demo account ID for a (brand, market) — kept identical across runs.
export function demoAccountId(brandKey, market) {
  return `demo-${brandKey.toLowerCase()}-${market.toLowerCase()}`;
}

// Stable campaign id for a (brand, market, campaign-name).
export function demoCampaignId(brandKey, market, campaignName) {
  let h = 0;
  const s = `${brandKey}|${market}|${campaignName}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(Math.abs(h) % 9_000_000_000 + 1_000_000_000);
}
