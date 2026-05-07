import adsSdk from 'facebook-nodejs-business-sdk';
import { getMetaAccount } from './config/paidSocialAccounts.js';

const { AdAccount, FacebookAdsApi } = adsSdk;

// ─── API init (lazy + memoized) ───────────────────────────
let apiInitialized = false;
function ensureApi() {
  if (apiInitialized) return;
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error('META_NOT_CONFIGURED');
  FacebookAdsApi.init(token);
  if (process.env.META_API_VERSION) {
    // SDK reads version from defaults; override only if explicitly requested.
    try { FacebookAdsApi.VERSION = process.env.META_API_VERSION; } catch { /* ignore */ }
  }
  apiInitialized = true;
}

// ─── Cache ────────────────────────────────────────────────
const cache = new Map();
const inFlight = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 min — same as Google Ads

function getFromCache(key) {
  const entry = cache.get(key);
  if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}
export function clearMetaCache() {
  cache.clear();
  inFlight.clear();
}

// ─── Row normalizer ───────────────────────────────────────

function findAction(arr, type) {
  if (!Array.isArray(arr)) return null;
  return arr.find(a => a.action_type === type) || null;
}

function normalizeMetaRow(row, brand, market) {
  const purchaseAction = findAction(row.actions, 'purchase')
    || findAction(row.actions, 'omni_purchase')
    || findAction(row.actions, 'offsite_conversion.fb_pixel_purchase');
  const purchaseValue  = findAction(row.action_values, 'purchase')
    || findAction(row.action_values, 'omni_purchase')
    || findAction(row.action_values, 'offsite_conversion.fb_pixel_purchase');

  const impressions = parseInt(row.impressions || 0, 10);
  const clicks      = parseInt(row.clicks || 0, 10);
  const cost        = parseFloat(row.spend || 0);
  const conversions = parseFloat(purchaseAction?.value || 0);
  const revenue     = parseFloat(purchaseValue?.value || 0);

  // Meta's purchase_roas is an array of {action_type, value}. Take the first
  // entry (Meta returns one per attribution window) and fall back to a derived
  // value when the pixel didn't fire — keeps the field non-null when we have
  // both spend and revenue.
  const reportedRoas = parseFloat(row.purchase_roas?.[0]?.value || 0);
  const derivedRoas  = cost > 0 ? revenue / cost : 0;
  const roas = reportedRoas > 0 ? reportedRoas : derivedRoas;

  // CTR/CVR stored as PERCENTAGE (e.g. 3.85 means 3.85%) — matches the
  // convention used by aggregateMetrics() in the Google Ads aggregator and
  // keeps the frontend formatters identical across paid-search and
  // paid-social.
  return {
    date:        row.date_start || '',
    platform:    'meta',
    campaign:    row.campaign_name || '',
    campaign_id: row.campaign_id   || '',
    adset:       row.adset_name    || '',
    adset_id:    row.adset_id      || '',
    impressions,
    clicks,
    ctr:         parseFloat(row.ctr || 0), // Meta already returns percentage
    cost,
    cpc:         parseFloat(row.cpc || 0),
    conversions,
    revenue,
    roas,
    cvr:         clicks > 0      ? (conversions / clicks) * 100 : 0,
    aov:         conversions > 0 ? revenue     / conversions    : 0,
    brand,
    market,
  };
}

// ─── Insights fetch ───────────────────────────────────────

const BASE_FIELDS = [
  'date_start',
  'campaign_name', 'campaign_id',
  'adset_name', 'adset_id',
  'impressions', 'clicks', 'ctr', 'spend', 'cpc',
  'actions', 'action_values', 'purchase_roas',
];

const ACTIVE_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED'];

/**
 * Run getInsights with `time_increment: 1` so Meta returns one row per day in
 * a SINGLE call — protects us from the 200-calls-per-hour rate limit.
 *
 * @param {Object}  opts
 * @param {string}  opts.from           YYYY-MM-DD
 * @param {string}  opts.to             YYYY-MM-DD
 * @param {string}  opts.level          'campaign' | 'adset' | 'ad' | 'account'
 * @param {Array}   [opts.breakdowns]   e.g. ['publisher_platform']
 * @param {boolean} [opts.daily]        if false → no time_increment (single bucket)
 */
async function fetchInsights({ brand, market, from, to, level = 'campaign', breakdowns, daily = true, extraFields = [] }) {
  const account = getMetaAccount(brand, market);
  if (!account || !account.adAccountId) return [];

  ensureApi();
  const adAccount = new AdAccount(account.adAccountId);

  const fields = daily ? BASE_FIELDS.concat(extraFields) : BASE_FIELDS.filter(f => f !== 'date_start').concat(extraFields);
  const params = {
    time_range: { since: from, until: to },
    level,
    filtering: [{ field: 'campaign.effective_status', operator: 'IN', value: ACTIVE_STATUSES }],
    limit: 500,
  };
  if (daily) params.time_increment = 1;
  if (breakdowns?.length) params.breakdowns = breakdowns;

  // SDK paginates automatically; cursor.next() handles >500-row responses.
  const cursor = await adAccount.getInsights(fields, params);
  const all = cursor.map(r => r._data || r);
  let next = cursor;
  while (next.hasNext && next.hasNext()) {
    next = await next.next();
    all.push(...next.map(r => r._data || r));
  }
  return all.map(row => ({ ...row, _breakdownRow: row })); // keep raw for breakdown handlers
}

// ─── Public API ───────────────────────────────────────────

/**
 * Daily campaign-level rows for KPI / trend / campaign endpoints.
 */
export async function getMetaRows({ brand, market, from, to }) {
  const account = getMetaAccount(brand, market);
  if (!account?.adAccountId) return [];

  const cacheKey = `meta_rows|${brand}|${market}|${from}|${to}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const promise = (async () => {
    try {
      const raw = await fetchInsights({ brand, market, from, to, level: 'campaign', daily: true });
      const rows = raw.map(r => normalizeMetaRow(r, brand, market));
      setCache(cacheKey, rows);
      console.log(`Meta API: ${rows.length} rows fetched (brand=${brand}, market=${market}, ${from} to ${to})`);
      return rows;
    } catch (err) {
      console.error(`Meta API error (${brand}/${market}):`, err.message || err);
      return [];
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

/**
 * Breakdown rows by Meta dimension. Returns one row per (campaign, segment).
 *
 * @param {string} dimension — 'publisher_platform' | 'device_platform' | 'age' | 'gender'
 */
export async function getMetaBreakdown({ brand, market, from, to, dimension }) {
  const account = getMetaAccount(brand, market);
  if (!account?.adAccountId) return [];

  const cacheKey = `meta_breakdown|${brand}|${market}|${from}|${to}|${dimension}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const promise = (async () => {
    try {
      const raw = await fetchInsights({
        brand, market, from, to,
        level: 'campaign',
        daily: false,
        breakdowns: [dimension],
      });
      // Each row carries the breakdown value in row[dimension]
      const rows = raw.map(r => ({
        ...normalizeMetaRow(r, brand, market),
        segment: r[dimension] || 'unknown',
      }));
      setCache(cacheKey, rows);
      return rows;
    } catch (err) {
      console.error(`Meta breakdown error (${dimension}):`, err.message || err);
      return [];
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}

export function isMetaConfigured() {
  if (!process.env.META_ACCESS_TOKEN) return false;
  // Accept either the legacy single-account env var or any per-market variant.
  if (process.env.META_AD_ACCOUNT_ID) return true;
  return Object.keys(process.env).some(k => k.startsWith('META_AD_ACCOUNT_ID_') && process.env[k]);
}


// ─── Ad-level insights + creative previews ────────────────
//
// Two-step fetch:
//   1. getInsights at level=ad, filtered by campaign.id → metrics per ad.
//   2. Batch GET on /?ids=adId1,adId2,...&fields=...creative{...} → preview
//      info for the same set of ads in a single Graph call.
// Merging creative metadata onto the metrics gives the frontend everything
// it needs to render a creative-first gallery.

function pickCreativeFormat(creative) {
  if (!creative) return 'unknown';
  if (creative.video_id) return 'video';
  if (creative.object_story_spec?.link_data?.child_attachments?.length) return 'carousel';
  if (creative.asset_feed_spec?.images?.length > 1) return 'dynamic';
  if (creative.image_url || creative.thumbnail_url) return 'image';
  return 'unknown';
}

function flattenCreative(raw) {
  if (!raw) return null;
  const c = raw.creative || raw;
  const story = c.object_story_spec || {};
  const link = story.link_data || {};
  const video = story.video_data || {};

  // Carousel children — surface first 3 thumbnails so the UI can render a
  // strip without re-fetching anything.
  const children = (link.child_attachments || []).slice(0, 6).map(ch => ({
    image_url: ch.picture || ch.image_url || null,
    title:     ch.name || null,
    body:      ch.description || null,
    link:      ch.link || null,
  }));

  return {
    creative_id:    c.id || null,
    format:         pickCreativeFormat(c),
    thumbnail_url:  c.thumbnail_url || link.picture || video.image_url || null,
    image_url:      c.image_url || link.picture || null,
    video_id:       c.video_id || video.video_id || null,
    title:          c.title || link.name || video.title || null,
    body:           c.body  || link.message || link.description || video.message || null,
    link_url:       c.object_url || link.link || null,
    cta_type:       link.call_to_action?.type || video.call_to_action?.type || null,
    children,
  };
}

const AD_FIELDS = [
  'id',
  'name',
  'effective_status',
  'created_time',
  'creative{id,thumbnail_url,image_url,video_id,title,body,object_url,object_story_spec,asset_feed_spec}',
].join(',');

/**
 * List ads under a campaign with their creative metadata. Single source of
 * truth for "what ads exist" — independent of whether they have insights.
 */
async function fetchCampaignAds(campaignId, status) {
  ensureApi();
  const v = process.env.META_API_VERSION || 'v21.0';
  const token = process.env.META_ACCESS_TOKEN;

  // Meta accepts effective_status as a JSON array of states.
  const statusFilter =
    status === 'active' ? `&effective_status=${encodeURIComponent('["ACTIVE"]')}`
  : status === 'paused' ? `&effective_status=${encodeURIComponent('["PAUSED"]')}`
  : ''; // 'all' → no filter, returns every status

  const out = [];
  let url = `https://graph.facebook.com/${v}/${campaignId}/ads`
          + `?fields=${encodeURIComponent(AD_FIELDS)}`
          + `${statusFilter}&limit=200&access_token=${encodeURIComponent(token)}`;

  while (url) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (json.error) {
        console.error('Meta /campaign/ads error:', json.error.message);
        break;
      }
      if (Array.isArray(json.data)) out.push(...json.data);
      url = json.paging?.next || null;
    } catch (err) {
      console.error('Meta /campaign/ads fetch failed:', err.message);
      break;
    }
  }
  return out;
}

function normalizeAdRow(row, creativeMap) {
  const purchaseAction = findAction(row.actions, 'purchase')
    || findAction(row.actions, 'omni_purchase')
    || findAction(row.actions, 'offsite_conversion.fb_pixel_purchase');
  const purchaseValue  = findAction(row.action_values, 'purchase')
    || findAction(row.action_values, 'omni_purchase')
    || findAction(row.action_values, 'offsite_conversion.fb_pixel_purchase');

  const impressions = parseInt(row.impressions || 0, 10);
  const clicks      = parseInt(row.clicks || 0, 10);
  const cost        = parseFloat(row.spend || 0);
  const conversions = parseFloat(purchaseAction?.value || 0);
  const revenue     = parseFloat(purchaseValue?.value  || 0);
  const reportedRoas = parseFloat(row.purchase_roas?.[0]?.value || 0);
  const roas = reportedRoas > 0 ? reportedRoas : (cost > 0 ? revenue / cost : 0);

  const meta = creativeMap[row.ad_id] || {};
  const creative = flattenCreative(meta);

  return {
    ad_id:           row.ad_id,
    ad_name:         meta.name || row.ad_name || row.ad_id,
    effective_status: meta.effective_status || null,
    created_time:    meta.created_time || null,
    campaign_id:     row.campaign_id || null,
    campaign_name:   row.campaign_name || null,
    adset_id:        row.adset_id || null,
    adset_name:      row.adset_name || null,
    impressions,
    clicks,
    ctr:             parseFloat(row.ctr || 0),
    cost,
    cpc:             parseFloat(row.cpc || 0),
    conversions,
    revenue,
    roas,
    cvr:             clicks      > 0 ? (conversions / clicks) * 100 : 0,
    aov:             conversions > 0 ?  revenue     / conversions   : 0,
    creative,
  };
}

function emptyMetricsRow(adMeta, campaignId) {
  return {
    ad_id:           adMeta.id,
    ad_name:         adMeta.name || adMeta.id,
    effective_status: adMeta.effective_status || null,
    created_time:    adMeta.created_time || null,
    campaign_id:     campaignId,
    campaign_name:   null,
    adset_id:        null,
    adset_name:      null,
    impressions: 0, clicks: 0, ctr: 0,
    cost: 0, cpc: 0,
    conversions: 0, revenue: 0, roas: 0,
    cvr: 0, aov: 0,
    creative: flattenCreative(adMeta),
  };
}

/**
 * @param {Object} opts
 * @param {string} opts.brand
 * @param {string} opts.market
 * @param {string} opts.from
 * @param {string} opts.to
 * @param {string} opts.campaignId  Meta campaign ID to drill into
 * @param {'active'|'paused'|'all'} [opts.status='active']
 */
export async function getMetaAds({ brand, market, from, to, campaignId, status = 'active' }) {
  if (!campaignId) return [];
  const account = getMetaAccount(brand, market);
  if (!account?.adAccountId) return [];

  const cacheKey = `meta_ads|${brand}|${market}|${campaignId}|${from}|${to}|${status}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const promise = (async () => {
    try {
      ensureApi();
      const adAccount = new AdAccount(account.adAccountId);

      // Run "list ads" and "get insights" in parallel — they're independent.
      const insightsPromise = (async () => {
        const cursor = await adAccount.getInsights(
          [
            'ad_id', 'ad_name',
            'campaign_id', 'campaign_name',
            'adset_id', 'adset_name',
            'impressions', 'clicks', 'ctr', 'spend', 'cpc',
            'actions', 'action_values', 'purchase_roas',
          ],
          {
            time_range: { since: from, until: to },
            level: 'ad',
            filtering: [{ field: 'campaign.id', operator: 'EQUAL', value: campaignId }],
            limit: 500,
          },
        );
        const out = cursor.map(r => r._data || r);
        let next = cursor;
        while (next.hasNext && next.hasNext()) {
          next = await next.next();
          out.push(...next.map(r => r._data || r));
        }
        return out;
      })();

      const [adsList, insightsRows] = await Promise.all([
        fetchCampaignAds(campaignId, status),
        insightsPromise,
      ]);

      // Index ad metadata + insights by ad_id for the merge.
      const adMetaById = {};
      for (const a of adsList) adMetaById[a.id] = a;
      const insightsById = {};
      for (const r of insightsRows) {
        if (r.ad_id) insightsById[r.ad_id] = r;
      }

      // Source of truth = the ad list (filtered by status). Each entry gets
      // its insights merged in, or zero metrics if it didn't run.
      const rows = adsList.map(adMeta => {
        const insightRow = insightsById[adMeta.id];
        if (insightRow) {
          // Pass `{ [adId]: adMeta }` to normalizeAdRow so it picks up the
          // creative + status from the canonical ad list rather than from
          // the insights row.
          return normalizeAdRow(insightRow, { [adMeta.id]: adMeta });
        }
        return emptyMetricsRow(adMeta, campaignId);
      });

      setCache(cacheKey, rows);
      console.log(`Meta API: ${rows.length} ads (status=${status}) fetched for campaign=${campaignId} (${from}→${to})`);
      return rows;
    } catch (err) {
      console.error(`Meta ads error (campaign=${campaignId}):`, err.message || err);
      return [];
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}
