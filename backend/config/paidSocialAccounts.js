// Mapping plateforme → ad account par marque/marché.
// Phase 1 : Meta sur Cocooncenter (5 marchés actifs).
// Phase 2 : ajouter Pascal Coste / Para. Lafayette + TikTok.
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

const META_BRAND_MARKETS = {
  COCOONCENTER: {
    FR: { label: 'Cocooncenter France' },
    UK: { label: 'Cocooncenter UK' },
    DE: { label: 'Cocooncenter Allemagne' },
    ES: { label: 'Cocooncenter Espagne' },
    IT: { label: 'Cocooncenter Italie' },
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
  const adAccountId = readAdAccountId(market);
  if (!adAccountId) return null;
  return { adAccountId, label: cfg.label };
}

/**
 * Markets that are both declared in this config AND have an ad account ID
 * configured in .env. The frontend uses this list to decide which markets
 * are clickable.
 */
export function getMetaSupportedMarkets(brand = 'COCOONCENTER') {
  const cfg = META_BRAND_MARKETS[brand] || {};
  return Object.keys(cfg).filter(market => readAdAccountId(market));
}

export const PAID_SOCIAL_PLATFORMS = ['meta', 'tiktok', 'all'];
