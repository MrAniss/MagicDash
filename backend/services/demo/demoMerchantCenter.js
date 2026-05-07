// Demo mock for backend/services/merchantCenterClient.js. Generates a stable
// catalog of ~80 products per brand × market with realistic prices, sale
// data and product-status info. Returns plain objects (not Maps) — the real
// client returns plain objects too.

import { findBrand } from './demoConfig.js';
import { rand01, noise } from './demoSeed.js';

const PRODUCT_TEMPLATES = [
  { title: 'Hydra-Boost Serum 30ml',     basePrice: 28.90, category: 'Beauty & Personal Care' },
  { title: 'Vitamin C Cream 50ml',       basePrice: 32.00, category: 'Beauty & Personal Care' },
  { title: 'Daily Multivitamin x60',     basePrice: 19.50, category: 'Health' },
  { title: 'Niacinamide 10% Serum',      basePrice: 22.00, category: 'Beauty & Personal Care' },
  { title: 'SPF 50 Sunscreen 50ml',      basePrice: 24.90, category: 'Beauty & Personal Care' },
  { title: 'Hair Growth Shampoo 250ml',  basePrice: 18.00, category: 'Beauty & Personal Care' },
  { title: 'Retinol Night Cream',        basePrice: 39.00, category: 'Beauty & Personal Care' },
  { title: 'Collagen Powder x30',        basePrice: 34.90, category: 'Health' },
  { title: 'Omega-3 Capsules x90',       basePrice: 21.00, category: 'Health' },
  { title: 'Magnesium Glycinate x60',    basePrice: 17.50, category: 'Health' },
  { title: 'Probiotic Daily x30',        basePrice: 29.90, category: 'Health' },
  { title: 'Argan Oil 50ml',             basePrice: 19.90, category: 'Beauty & Personal Care' },
  { title: 'Lip Balm Duo',               basePrice:  9.90, category: 'Beauty & Personal Care' },
  { title: 'Face Mist 100ml',            basePrice: 14.50, category: 'Beauty & Personal Care' },
  { title: 'Anti-Aging Eye Cream',       basePrice: 36.00, category: 'Beauty & Personal Care' },
  { title: 'Cleansing Foam 200ml',       basePrice: 16.90, category: 'Beauty & Personal Care' },
  { title: 'Body Lotion 400ml',          basePrice: 14.00, category: 'Beauty & Personal Care' },
  { title: 'Hair Mask 250ml',            basePrice: 17.00, category: 'Beauty & Personal Care' },
  { title: 'Sleeping Mask 50g',          basePrice: 27.00, category: 'Beauty & Personal Care' },
  { title: 'Toner 200ml',                basePrice: 15.50, category: 'Beauty & Personal Care' },
];

const CURRENCY_BY_MARKET = {
  FR: 'EUR', BE: 'EUR', NL: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR',
  AT: 'EUR', PT: 'EUR', LU: 'EUR', IE: 'EUR', FI: 'EUR',
  UK: 'GBP', US: 'USD', CA: 'CAD', AU: 'AUD',
  SE: 'SEK', NO: 'NOK', PL: 'PLN', RO: 'RON',
};

function getCurrency(market) { return CURRENCY_BY_MARKET[market] || 'EUR'; }

function generateCatalog(brand, market, count = 80) {
  const items = [];
  const cur = getCurrency(market);
  for (let i = 0; i < count; i++) {
    const tpl = PRODUCT_TEMPLATES[i % PRODUCT_TEMPLATES.length];
    const variantIdx = Math.floor(i / PRODUCT_TEMPLATES.length);
    const seed = `mc|${brand}|${market}|${i}`;
    const priceJitter = 0.85 + rand01(seed + '|p') * 0.30; // 0.85 - 1.15
    const price = Math.round(tpl.basePrice * priceJitter * 100) / 100;
    const onSale = rand01(seed + '|s') > 0.78;
    const salePrice = onSale ? Math.round(price * (0.78 + rand01(seed + '|sp') * 0.10) * 100) / 100 : null;
    const offerId = `DEMO-${brand}-${market}-${1000 + i}`;
    items.push({
      offerId,
      title: variantIdx > 0 ? `${tpl.title} v${variantIdx + 1}` : tpl.title,
      brand,
      category: tpl.category,
      price,
      sale_price: salePrice,
      currency: cur,
      image_link: `https://picsum.photos/seed/${encodeURIComponent(offerId)}/400/400`,
      link: `https://www.demo.example/p/${offerId}`,
    });
  }
  return items;
}

function expandTargets(brand, market) {
  const out = [];
  const bKey = (brand || '').toUpperCase();
  const allBrandKeys = ['BRAND_A', 'BRAND_B', 'BRAND_C', 'BRAND_D'];
  const brandKeys = bKey === 'ALL' ? allBrandKeys : [bKey];
  for (const k of brandKeys) {
    const bDef = findBrand(k);
    if (!bDef) continue;
    if (market === 'ALL' || !market) {
      for (const m of bDef.markets) out.push({ brand: k, market: m.code });
    } else if (bDef.markets.find(m => m.code === market)) {
      out.push({ brand: k, market });
    }
  }
  return out;
}

// ─── Public API ────────────────────────────────────────────

export async function getPriceMap(brand, market = 'ALL') {
  const out = {};
  for (const t of expandTargets(brand, market)) {
    for (const p of generateCatalog(t.brand, t.market)) {
      out[p.offerId] = { price: p.price, currency: p.currency };
    }
  }
  return out;
}

export async function getPriceCompetitivenessData(brand, market = 'ALL') {
  const out = {};
  for (const t of expandTargets(brand, market)) {
    for (const p of generateCatalog(t.brand, t.market)) {
      // Synthetic benchmark: ours vs market average ±15%
      const seed = `pc|${t.brand}|${t.market}|${p.offerId}`;
      const benchmark = Math.round(p.price * (0.85 + rand01(seed) * 0.30) * 100) / 100;
      const delta = benchmark > 0 ? (p.price - benchmark) / benchmark : 0;
      out[p.offerId] = {
        our_price: p.price,
        benchmark_price: benchmark,
        delta_pct: Math.round(delta * 10000) / 100,
        delta_eur: Math.round((p.price - benchmark) * 100) / 100,
        status: delta < -0.05 ? 'COMPETITIVE' : delta > 0.05 ? 'EXPENSIVE' : 'ON_PAR',
      };
    }
  }
  return out;
}

const ISSUE_CATALOG = [
  { type: 'IMAGE',        code: 'image_link_broken',          description: 'Image URL inaccessible' },
  { type: 'GTIN',         code: 'invalid_gtin',               description: 'Missing or invalid GTIN' },
  { type: 'CATEGORY',     code: 'missing_google_category',    description: 'Google product category missing' },
  { type: 'PRICE',        code: 'mismatched_price',           description: 'Price on landing page differs from feed' },
  { type: 'AVAILABILITY', code: 'mismatched_availability',    description: 'Stock status differs from landing page' },
  { type: 'SHIPPING',     code: 'incomplete_shipping',        description: 'Shipping info incomplete' },
  { type: 'DESCRIPTION',  code: 'description_too_short',      description: 'Description shorter than recommended' },
];

export async function getProductStatuses(brand, market = 'ALL') {
  const out = [];
  for (const t of expandTargets(brand, market)) {
    for (const p of generateCatalog(t.brand, t.market)) {
      const seed = `st|${t.brand}|${t.market}|${p.offerId}`;
      const r = rand01(seed);
      let status = 'active';
      let issues = [];
      if (r > 0.97) {
        status = 'disapproved';
        const issue = ISSUE_CATALOG[Math.floor(rand01(seed + '|i') * ISSUE_CATALOG.length)];
        issues = [{ ...issue, severity: 'disapproved', destination: 'Shopping ads', detail: null, documentation: null, attribute: null, resolution: 'edit_feed' }];
      } else if (r > 0.88) {
        status = 'limited';
        const issue = ISSUE_CATALOG[Math.floor(rand01(seed + '|i') * ISSUE_CATALOG.length)];
        issues = [{ ...issue, severity: 'warning', destination: 'Shopping ads', detail: null, documentation: null, attribute: null, resolution: 'edit_feed' }];
      } else if (r > 0.83) {
        status = 'pending';
      }
      out.push({
        item_id: p.offerId,
        title: p.title,
        brand: p.brand,
        status,
        issues,
      });
    }
  }
  return out;
}

export async function getSalePriceMap(brand, market = 'ALL') {
  const out = {};
  for (const t of expandTargets(brand, market)) {
    for (const p of generateCatalog(t.brand, t.market)) {
      if (!p.sale_price) continue;
      out[p.offerId] = {
        title: p.title,
        brand: p.brand,
        original_price: p.price,
        sale_price: p.sale_price,
        currency: p.currency,
        promo_start: null,
        promo_end: null,
      };
    }
  }
  return out;
}

export async function fetchAllProducts(brand, market = 'ALL') {
  const out = [];
  const seen = new Set();
  for (const t of expandTargets(brand, market)) {
    for (const p of generateCatalog(t.brand, t.market)) {
      if (seen.has(p.offerId)) continue;
      seen.add(p.offerId);
      out.push({
        id: p.offerId,
        feed_id: `online:${t.market.toLowerCase()}:${t.market}:${p.offerId}`,
        title: p.title,
        description: `${p.title} — best-selling ${p.category.toLowerCase()} formula.`,
        link: p.link,
        image_link: p.image_link,
        additional_image_link: '',
        brand: p.brand,
        product_type: p.category,
        google_product_category: p.category,
        gtin: '',
        mpn: '',
        identifier_exists: 'true',
        condition: 'new',
        availability: 'in stock',
        price: `${p.price} ${p.currency}`,
        sale_price: p.sale_price ? `${p.sale_price} ${p.currency}` : '',
        sale_price_effective_date: '',
        shipping: '',
        shipping_weight: '',
        item_group_id: '',
        color: '',
        size: '',
        gender: '',
        age_group: 'adult',
        material: '',
        pattern: '',
        tax_category: '',
        energy_efficiency_class: '',
        custom_label_0: '',
        custom_label_1: '',
        custom_label_2: '',
        custom_label_3: '',
        custom_label_4: '',
      });
    }
  }
  return out;
}

export async function getProductLinkMap(brand, market = 'ALL') {
  const out = {};
  for (const t of expandTargets(brand, market)) {
    for (const p of generateCatalog(t.brand, t.market)) {
      out[p.offerId] = p.link;
    }
  }
  return out;
}

export function clearMcCache()      { /* no-op in demo */ }
export function loadCacheFromDisk() { /* no-op in demo */ }
export function saveCacheToDisk()   { /* no-op in demo */ }
