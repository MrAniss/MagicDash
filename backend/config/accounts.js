// Google Ads account configuration. IDs are read from .env so the source
// tree doesn't expose the customer graph publicly. The market codes and
// human-readable labels stay here — they're not secret and let us keep a
// single source of truth for "which markets exist".

import './loadEnv.js';
import { isDemoMode } from '../services/demo/demoMode.js';
import { DEMO_BRANDS } from '../services/demo/demoConfig.js';

function readId(envKey) {
  const v = process.env[envKey];
  if (!v) {
    // Soft-fail: missing env var → that account is excluded. Logged once at
    // startup so the operator knows what's loaded.
    console.warn(`[accounts] ${envKey} not set — excluding that account.`);
  }
  return v || null;
}

export const MCC_ID = process.env.GOOGLE_ADS_MCC_ID || '';

const BRAND_A_MARKETS = [
  { market: 'FR', label: 'France'          },
  { market: 'BE', label: 'Belgique'        },
  { market: 'NL', label: 'Pays-Bas'        },
  { market: 'DE', label: 'Allemagne'       },
  { market: 'IT', label: 'Italie'          },
  { market: 'ES', label: 'Espagne'         },
  { market: 'UK', label: 'Royaume-Uni'     },
  { market: 'AT', label: 'Autriche'        },
  { market: 'PT', label: 'Portugal'        },
  { market: 'LU', label: 'Luxembourg'      },
  { market: 'SE', label: 'Suède'           },
  { market: 'NO', label: 'Norvège'         },
  { market: 'FI', label: 'Finlande'        },
  { market: 'PL', label: 'Pologne'         },
  { market: 'IE', label: 'Irlande'         },
  { market: 'RO', label: 'Roumanie'        },
  { market: 'SA', label: 'Arabie Saoudite' },
  { market: 'CA', label: 'Canada'          },
  { market: 'AU', label: 'Australie'       },
  { market: 'US', label: 'États-Unis'      },
];

function buildBrandAAccounts() {
  return BRAND_A_MARKETS
    .map(({ market, label }) => ({
      id: readId(`GOOGLE_ADS_ID_BRAND_A_${market}`),
      market,
      label,
    }))
    .filter(a => a.id);
}

function buildStandaloneAccount(brandKey, market, label) {
  const id = readId(`GOOGLE_ADS_ID_${brandKey}_${market}`);
  return id ? [{ id, market, label }] : [];
}

export const BRANDS = {
  BRAND_A: {
    name: 'Brand Alpha',
    mode: 'mcc',
    accounts: buildBrandAAccounts(),
  },
  BRAND_B: {
    name: 'Brand Beta',
    mode: 'standalone',
    accounts: buildStandaloneAccount('BRAND_B', 'FR', 'France'),
  },
  BRAND_C: {
    name: 'Brand Gamma',
    mode: 'standalone',
    accounts: buildStandaloneAccount('BRAND_C', 'FR', 'France'),
  },
  BRAND_D: {
    name: 'Brand Delta',
    mode: 'standalone',
    accounts: buildStandaloneAccount('BRAND_D', 'FR', 'France'),
  },
};

if (isDemoMode()) {
  let n = 0;
  for (const b of DEMO_BRANDS) {
    BRANDS[b.key] = {
      name: BRANDS[b.key]?.name || b.label,
      mode: b.mode,
      accounts: b.markets.map((m) => ({
        id: `demo-${b.key.toLowerCase()}-${m.code.toLowerCase()}-${++n}`,
        market: m.code,
        label: m.label,
      })),
    };
  }
}

/**
 * Conversion action ID used for margin / POAS queries on a given
 * (brand, market). Returns null if not configured — callers should fall
 * back to revenue-based ROAS instead of margin.
 */
export function getMarginConversionActionId(brand, market) {
  return process.env[`GOOGLE_ADS_MARGIN_CONVERSION_${brand}_${market}`] || null;
}
