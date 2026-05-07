// Mapping plateforme → ad account par marque/marché.
// Phase 1 : Meta sur Brand Alpha (5 marchés actifs).
// Phase 2 : ajouter Brand Beta / Brand Gamma + TikTok.
//
// Account IDs are loaded from .env to keep them out of source control:
//   META_AD_ACCOUNT_ID_FR=act_xxxxxxxxxxxxxxxx
//   META_AD_ACCOUNT_ID_UK=act_xxxxxxxxxxxxxxxx
//   META_AD_ACCOUNT_ID_DE=act_xxxxxxxxxxxxxxxx
//   …
//
// Markets without an env value are simply not exposed by
// getMetaSupportedMarkets() — the frontend then falls back to a configured
// market and shows a banner.

import { isDemoMode } from '../services/demo/demoMode.js';

const META_BRAND_MARKETS = {
  BRAND_A: {
    FR: { label: 'Brand Alpha France' },
    UK: { label: 'Brand Alpha UK' },
    DE: { label: 'Brand Alpha Allemagne' },
    ES: { label: 'Brand Alpha Espagne' },
    IT: { label: 'Brand Alpha Italie' },
  },
};

function readAdAccountId(market) {
  // Per-market env wins. Legacy `META_AD_ACCOUNT_ID` (no suffix) maps to FR
  // so the original .env that pre-dates the multi-market refactor still works.
  return process.env[`META_AD_ACCOUNT_ID_${market}`]
      || (market === 'FR' ? process.env.META_AD_ACCOUNT_ID : null)
      || null;
}

export function getMetaAccount(brand, market) {
  const cfg = META_BRAND_MARKETS[brand]?.[market];
  if (!cfg) return null;
  if (isDemoMode()) {
    return { adAccountId: `act_demo-${brand}-${market}`, label: cfg.label };
  }
  const adAccountId = readAdAccountId(market);
  if (!adAccountId) return null;
  return { adAccountId, label: cfg.label };
}

/**
 * Markets that are both declared in this config AND have an ad account ID
 * configured in .env. The frontend uses this list to decide which markets
 * are clickable.
 */
export function getMetaSupportedMarkets(brand = 'BRAND_A') {
  const cfg = META_BRAND_MARKETS[brand] || {};
  if (isDemoMode()) return Object.keys(cfg);
  return Object.keys(cfg).filter(market => readAdAccountId(market));
}

export const PAID_SOCIAL_PLATFORMS = ['meta', 'tiktok', 'all'];
