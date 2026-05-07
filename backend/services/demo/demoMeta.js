// Demo mock for backend/metaAdsClient.js. Returns paid-social rows only for
// the 5 BRAND_A markets that exist in the demo config (FR/UK/DE/ES/IT).

import { findBrand, demoCampaignId, DEMO_BRAND_LABELS } from './demoConfig.js';
import { dailyMetrics, eachDate, rand01, noise } from './demoSeed.js';

const META_BRAND_MARKETS = {
  BRAND_A: new Set(['FR', 'UK', 'DE', 'ES', 'IT']),
};

// Meta spend is roughly 25% of Google Ads spend (paid social weight).
const META_SHARE_OF_PAID = 0.25;

const META_CAMPAIGNS = [
  { name: 'Meta - Prospecting Beauty',  type: 'CONVERSIONS',     share: 0.30 },
  { name: 'Meta - Retargeting Cart',    type: 'CONVERSIONS',     share: 0.20 },
  { name: 'Meta - Catalog DPA',         type: 'CONVERSIONS',     share: 0.20 },
  { name: 'Meta - Awareness Reels',     type: 'BRAND_AWARENESS', share: 0.15 },
  { name: 'Meta - Influencer Collabs',  type: 'TRAFFIC',         share: 0.15 },
];

function brandLabel(brandKey) {
  return DEMO_BRAND_LABELS[brandKey] || brandKey;
}

function isMarketSupported(brand, market) {
  return META_BRAND_MARKETS[brand]?.has(market) || false;
}

function buildDailyMetaRows(brand, market, date) {
  if (!isMarketSupported(brand, market)) return [];
  const totals = dailyMetrics(brand, market, date);
  if (!totals.spend) return [];
  const dayMetaSpend = totals.spend * META_SHARE_OF_PAID;
  const dayClicks    = totals.clicks * META_SHARE_OF_PAID * 0.85; // lower CTR than search
  const dayImpr      = totals.impressions * META_SHARE_OF_PAID * 1.40;
  const dayConv      = totals.conversions * META_SHARE_OF_PAID * 0.70;
  const dayRev       = dayConv * totals.aov;

  return META_CAMPAIGNS.map(tpl => {
    const wobble = noise(`metac|${brand}|${market}|${tpl.name}|${date}`, 0.18);
    const sShare = tpl.share * wobble;
    const cost = dayMetaSpend * sShare;
    const clicks = dayClicks * sShare;
    const impressions = dayImpr * sShare;
    const conversions = dayConv * sShare * noise(`metcv|${brand}|${market}|${tpl.name}|${date}`, 0.20);
    const revenue = conversions * totals.aov * noise(`metrv|${brand}|${market}|${tpl.name}|${date}`, 0.05);
    const cpc = clicks > 0 ? cost / clicks : 0;
    return {
      date,
      platform: 'meta',
      campaign: tpl.name,
      campaign_id: demoCampaignId(brand, market, tpl.name),
      adset: `${tpl.name} - Default`,
      adset_id: demoCampaignId(brand, market, tpl.name + '|adset'),
      impressions: Math.round(impressions),
      clicks: Math.round(clicks),
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cost: Math.round(cost * 100) / 100,
      cpc: Math.round(cpc * 100) / 100,
      conversions: Math.round(conversions * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      roas: cost > 0 ? revenue / cost : 0,
      cvr: clicks > 0 ? (conversions / clicks) * 100 : 0,
      aov: conversions > 0 ? revenue / conversions : 0,
      brand,
      market,
    };
  });
}

// ─── Public API ────────────────────────────────────────────

export function isMetaConfigured() {
  return true;
}

export async function getMetaRows({ brand, market, from, to } = {}) {
  if (!brand || !market || !from || !to) return [];
  if (!isMarketSupported(brand, market)) return [];
  const rows = [];
  for (const date of eachDate(from, to)) {
    rows.push(...buildDailyMetaRows(brand, market, date));
  }
  console.log(`Meta API: ${rows.length} rows fetched (brand=${brand}, market=${market}, ${from} to ${to})`);
  return rows;
}

const BREAKDOWN_VALUES = {
  publisher_platform: ['facebook', 'instagram', 'audience_network'],
  device_platform:    ['mobile', 'desktop'],
  age:                ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
  gender:             ['male', 'female', 'unknown'],
};

const BREAKDOWN_WEIGHTS = {
  publisher_platform: { facebook: 0.50, instagram: 0.42, audience_network: 0.08 },
  device_platform:    { mobile: 0.78, desktop: 0.22 },
  age:                { '18-24': 0.12, '25-34': 0.30, '35-44': 0.28, '45-54': 0.18, '55-64': 0.08, '65+': 0.04 },
  gender:             { male: 0.32, female: 0.65, unknown: 0.03 },
};

export async function getMetaBreakdown({ brand, market, from, to, dimension } = {}) {
  if (!isMarketSupported(brand, market)) return [];
  const segments = BREAKDOWN_VALUES[dimension] || [];
  if (!segments.length) return [];
  const weights = BREAKDOWN_WEIGHTS[dimension] || {};

  // Aggregate the period totals per campaign first
  const totalsByCampaign = {};
  for (const date of eachDate(from, to)) {
    for (const r of buildDailyMetaRows(brand, market, date)) {
      const k = r.campaign;
      if (!totalsByCampaign[k]) {
        totalsByCampaign[k] = { ...r };
        totalsByCampaign[k].impressions = 0;
        totalsByCampaign[k].clicks = 0;
        totalsByCampaign[k].cost = 0;
        totalsByCampaign[k].conversions = 0;
        totalsByCampaign[k].revenue = 0;
      }
      const t = totalsByCampaign[k];
      t.impressions += r.impressions;
      t.clicks      += r.clicks;
      t.cost        += r.cost;
      t.conversions += r.conversions;
      t.revenue     += r.revenue;
    }
  }

  const out = [];
  for (const t of Object.values(totalsByCampaign)) {
    for (const seg of segments) {
      const w = weights[seg] || 1 / segments.length;
      const wobble = noise(`brk|${brand}|${market}|${dimension}|${seg}|${t.campaign}`, 0.10);
      const cost = t.cost * w * wobble;
      const clicks = t.clicks * w * wobble;
      const impressions = t.impressions * w * wobble;
      const conversions = t.conversions * w * wobble;
      const revenue = t.revenue * w * wobble;
      out.push({
        ...t,
        date: from,
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cost: Math.round(cost * 100) / 100,
        cpc: clicks > 0 ? cost / clicks : 0,
        conversions: Math.round(conversions * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        roas: cost > 0 ? revenue / cost : 0,
        cvr: clicks > 0 ? (conversions / clicks) * 100 : 0,
        aov: conversions > 0 ? revenue / conversions : 0,
        segment: seg,
      });
    }
  }
  return out;
}

const AD_CREATIVE_BODIES = [
  'Discover the new bestseller',
  'Shop now — limited time offer',
  'Customers rated us 4.8★',
  'Free shipping on orders over €50',
  'Try our award-winning serum',
];

const AD_FORMATS = ['image', 'video', 'carousel', 'dynamic'];

function buildDemoAd(brand, market, campaignId, campaignName, idx) {
  const adId = `${campaignId}-ad-${idx}`;
  const seed = `ad|${brand}|${market}|${campaignName}|${idx}`;
  const format = AD_FORMATS[idx % AD_FORMATS.length];
  const picsum = `https://picsum.photos/seed/${encodeURIComponent(adId)}/600/600`;
  const created = new Date();
  created.setDate(created.getDate() - (10 + idx * 7));

  return {
    id: adId,
    name: `${campaignName} - Ad ${idx + 1}`,
    effective_status: rand01(seed) > 0.85 ? 'PAUSED' : 'ACTIVE',
    created_time: created.toISOString(),
    creative: {
      id: `cre-${adId}`,
      thumbnail_url: picsum,
      image_url: picsum,
      video_id: format === 'video' ? `vid-${adId}` : null,
      title: `${campaignName} ${idx + 1}`,
      body: AD_CREATIVE_BODIES[idx % AD_CREATIVE_BODIES.length],
      object_url: 'https://www.example.com/promo',
      object_story_spec: {
        link_data: {
          picture: picsum,
          name: `${campaignName} ${idx + 1}`,
          message: AD_CREATIVE_BODIES[idx % AD_CREATIVE_BODIES.length],
          call_to_action: { type: 'SHOP_NOW' },
        },
      },
    },
  };
}

function pickCreativeFormat(creative) {
  if (!creative) return 'unknown';
  if (creative.video_id) return 'video';
  if (creative.object_story_spec?.link_data?.child_attachments?.length) return 'carousel';
  if (creative.image_url || creative.thumbnail_url) return 'image';
  return 'unknown';
}

function flattenCreative(raw) {
  if (!raw) return null;
  const c = raw.creative || raw;
  const story = c.object_story_spec || {};
  const link = story.link_data || {};
  return {
    creative_id:   c.id || null,
    format:        pickCreativeFormat(c),
    thumbnail_url: c.thumbnail_url || link.picture || null,
    image_url:     c.image_url || link.picture || null,
    video_id:      c.video_id || null,
    title:         c.title || link.name || null,
    body:          c.body || link.message || null,
    link_url:      c.object_url || link.link || null,
    cta_type:      link.call_to_action?.type || null,
    children:      [],
  };
}

export async function getMetaAds({ brand, market, from, to, campaignId, status = 'active' } = {}) {
  if (!campaignId) return [];
  if (!isMarketSupported(brand, market)) return [];

  // Find which template this campaignId corresponds to
  const tpl = META_CAMPAIGNS.find(t => demoCampaignId(brand, market, t.name) === campaignId);
  if (!tpl) return [];

  // Aggregate the campaign totals over the date window
  let totalCost = 0, totalClicks = 0, totalImpr = 0, totalConv = 0, totalRev = 0;
  for (const date of eachDate(from, to)) {
    const row = buildDailyMetaRows(brand, market, date).find(r => r.campaign === tpl.name);
    if (!row) continue;
    totalCost   += row.cost;
    totalClicks += row.clicks;
    totalImpr   += row.impressions;
    totalConv   += row.conversions;
    totalRev    += row.revenue;
  }

  const adCount = 6;
  const ads = Array.from({ length: adCount }, (_, i) => buildDemoAd(brand, market, campaignId, tpl.name, i));
  const filtered = ads.filter(a => {
    if (status === 'all') return true;
    if (status === 'active') return a.effective_status === 'ACTIVE';
    if (status === 'paused') return a.effective_status === 'PAUSED';
    return true;
  });
  if (!filtered.length) return [];

  // Spread metrics across ads with a power-law weight
  const weights = filtered.map((_, i) => 1 / Math.pow(i + 1, 0.55));
  const wSum = weights.reduce((a, b) => a + b, 0);

  const rows = filtered.map((adMeta, i) => {
    const w = weights[i] / wSum;
    const wobble = noise(`adw|${campaignId}|${i}`, 0.15);
    const cost = totalCost * w * wobble;
    const clicks = totalClicks * w * wobble;
    const impressions = totalImpr * w * wobble;
    const conversions = totalConv * w * wobble;
    const revenue = totalRev * w * wobble;
    return {
      ad_id:           adMeta.id,
      ad_name:         adMeta.name,
      effective_status: adMeta.effective_status,
      created_time:    adMeta.created_time,
      campaign_id:     campaignId,
      campaign_name:   tpl.name,
      adset_id:        demoCampaignId(brand, market, tpl.name + '|adset'),
      adset_name:      `${tpl.name} - Default`,
      impressions:     Math.round(impressions),
      clicks:          Math.round(clicks),
      ctr:             impressions > 0 ? (clicks / impressions) * 100 : 0,
      cost:            Math.round(cost * 100) / 100,
      cpc:             clicks > 0 ? cost / clicks : 0,
      conversions:     Math.round(conversions * 100) / 100,
      revenue:         Math.round(revenue * 100) / 100,
      roas:            cost > 0 ? revenue / cost : 0,
      cvr:             clicks      > 0 ? (conversions / clicks) * 100 : 0,
      aov:             conversions > 0 ?  revenue     / conversions   : 0,
      creative:        flattenCreative(adMeta),
    };
  });

  console.log(`Meta API: ${rows.length} ads (status=${status}) fetched for campaign=${campaignId} (${from}→${to})`);
  return rows;
}

export function clearMetaCache() { /* no-op in demo */ }
