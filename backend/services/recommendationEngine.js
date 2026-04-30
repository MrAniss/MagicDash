import { getSignalRows } from '../googleAdsClient.js';
import { r2 } from '../dateUtils.js';

function subDays(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Aggregate signal rows by key (market or campaignId)
function aggregateSignals(rows) {
  const map = {};
  for (const row of rows) {
    const key = row.campaignId; // always aggregate at campaign level first
    if (!map[key]) {
      map[key] = {
        market: row.market,
        campaign: row.campaign,
        campaignId: row.campaignId,
        campaignType: row.campaignType,
        brand: row.brand,
        cost: 0, conversions_value: 0,
        clickShareSum: 0, clickShareCount: 0,
        targetRoasSum: 0, targetRoasCount: 0,
      };
    }
    const e = map[key];
    e.cost += row.cost;
    e.conversions_value += row.conversions_value;
    if (row.clickShare > 0) { e.clickShareSum += row.clickShare; e.clickShareCount++; }
    if (row.targetRoas > 0) { e.targetRoasSum += row.targetRoas; e.targetRoasCount++; }
  }

  return Object.values(map).map(e => ({
    ...e,
    roas: e.cost > 0 ? r2(e.conversions_value / e.cost) : 0,
    clickShare: e.clickShareCount > 0 ? r2(e.clickShareSum / e.clickShareCount) : null,
    targetRoas: e.targetRoasCount > 0 ? r2(e.targetRoasSum / e.targetRoasCount) : null,
  }));
}

function groupByMarket(campaigns) {
  const map = {};
  for (const c of campaigns) {
    const k = c.market;
    if (!map[k]) map[k] = { market: k, brand: c.brand, cost: 0, conversions_value: 0, clickShareSum: 0, clickShareCount: 0, targetRoasSum: 0, targetRoasCount: 0 };
    const e = map[k];
    e.cost += c.cost;
    e.conversions_value += c.conversions_value;
    if (c.clickShare != null) { e.clickShareSum += c.clickShare; e.clickShareCount++; }
    if (c.targetRoas != null) { e.targetRoasSum += c.targetRoas; e.targetRoasCount++; }
  }
  return Object.values(map).map(e => ({
    market: e.market,
    brand: e.brand,
    cost: e.cost,
    conversions_value: e.conversions_value,
    roas: e.cost > 0 ? r2(e.conversions_value / e.cost) : 0,
    clickShare: e.clickShareCount > 0 ? r2(e.clickShareSum / e.clickShareCount) : null,
    targetRoas: e.targetRoasCount > 0 ? r2(e.targetRoasSum / e.targetRoasCount) : null,
  }));
}

// Core recommendation logic
function classify(signals) {
  const {
    pacing_pct, roas_recent, roas_historical, roas_target,
    click_share, daily_actual, daily_target,
    budget, projection_base,
  } = signals;

  const effectiveTarget = roas_target > 0 ? roas_target : roas_historical;
  const isROASHealthy = roas_recent >= effectiveTarget && roas_recent >= roas_historical * 0.95;
  const isROASPoor = effectiveTarget > 0 ? roas_recent < effectiveTarget * 0.85 : roas_recent < roas_historical * 0.85;
  const hasClickShareGap = click_share != null && click_share < 0.65;

  let type = 'STABLE';

  if (pacing_pct > 110 && isROASPoor) {
    type = 'REDUIRE';
  } else if (pacing_pct < 85 && isROASHealthy) {
    type = 'AUGMENTER';
  } else if (hasClickShareGap && isROASHealthy && pacing_pct < 100) {
    type = 'OPPORTUNITE';
  }

  const impactScore = budget > 0
    ? r2(Math.abs(budget - projection_base) * (effectiveTarget > 0 ? roas_recent / effectiveTarget : 1))
    : 0;

  const t = effectiveTarget;

  let label;
  let actions = [];

  if (type === 'AUGMENTER') {
    label = `ROAS récent (${roas_recent}×) au-dessus de la cible (${r2(t)}×) et budget sous-consommé. Potentiel d'augmentation budget ou tROAS à baisser.`;
    const suggestedDaily = r2(daily_target * 1.15);
    actions = [
      `Augmenter le budget journalier de ${Math.round(daily_actual)} € à ${Math.round(suggestedDaily)} €`,
    ];
    if (t > 0) {
      actions.push(`Baisser le tROAS de ${Math.round(t * 100)}% à ${Math.round(t * 100 * 0.92)}%`);
    }
  } else if (type === 'REDUIRE') {
    label = `Sur-pace à ${r2(pacing_pct)}% et ROAS récent (${roas_recent}×) sous la cible (${r2(t)}×). Réduire le budget journalier ou augmenter le tROAS.`;
    const suggestedDaily = r2(daily_target * 0.85);
    actions = [
      `Réduire le budget journalier de ${Math.round(daily_actual)} € à ${Math.round(suggestedDaily)} €`,
    ];
    if (t > 0) {
      actions.push(`Augmenter le tROAS de ${Math.round(t * 100)}% à ${Math.round(t * 100 * 1.10)}%`);
    }
  } else if (type === 'OPPORTUNITE') {
    const pctDisplay = Math.round((click_share || 0) * 100);
    const targetShare = Math.min((click_share || 0) * 1.3, 0.90);
    label = `Part de clics à ${pctDisplay}% — inventaire disponible. Le ROAS récent (${roas_recent}×) justifie d'augmenter les enchères ou le budget pour capter plus de trafic.`;
    actions = [
      `Cibler ${Math.round(targetShare * 100)}% de part de clics (actuellement ${pctDisplay}%)`,
      `Augmenter le budget journalier de ${Math.round(daily_actual)} € à ${Math.round(daily_target * 1.10)} €`,
    ];
  } else {
    label = 'Pacing et ROAS dans les objectifs. Aucune action requise.';
    actions = ['Maintenir les paramètres actuels.'];
  }

  const priority = type === 'REDUIRE' ? 'HIGH' : type === 'AUGMENTER' ? 'MEDIUM' : type === 'OPPORTUNITE' ? 'MEDIUM' : 'LOW';

  return { type, priority, label, actions, impactScore, roas_target: r2(effectiveTarget) };
}

export async function generateRecommendations({ brand, month, granularity = 'market', pacingMarkets, daysElapsed, daysTotal }) {
  const todayStr = today();
  const from14 = subDays(14);
  const from60 = subDays(60);

  // Check if there are any "guest" brands in pacing markets (e.g. Para Laf in CC view)
  const guestBrands = [...new Set(
    pacingMarkets
      .filter(m => m.adsBrand && m.adsBrand !== brand)
      .map(m => m.adsBrand)
  )];

  // Fetch signal rows for primary brand + any guest brands
  const brandFetches = [brand, ...guestBrands];
  const [recentArrays, historicalArrays] = await Promise.all([
    Promise.all(brandFetches.map(b => getSignalRows(b, from14, todayStr))),
    Promise.all(brandFetches.map(b => getSignalRows(b, from60, todayStr))),
  ]);

  // For guest market entries, remap market field to the display key (e.g. 'France Para Laf')
  const guestMarketMap = {};
  for (const pm of pacingMarkets) {
    if (pm.adsBrand && pm.adsBrand !== brand) {
      guestMarketMap[pm.adsBrand] = { displayMarket: pm.market, adsMarket: pm.adsMarket || 'FR' };
    }
  }

  function remapGuestRows(rows, guestBrand) {
    const info = guestMarketMap[guestBrand];
    if (!info) return rows;
    return rows
      .filter(r => r.market === info.adsMarket)
      .map(r => ({ ...r, market: info.displayMarket }));
  }

  const recent = [
    ...recentArrays[0],
    ...guestBrands.flatMap((b, i) => remapGuestRows(recentArrays[i + 1], b)),
  ];
  const historical = [
    ...historicalArrays[0],
    ...guestBrands.flatMap((b, i) => remapGuestRows(historicalArrays[i + 1], b)),
  ];

  const recentCampaigns = aggregateSignals(recent);
  const historicalCampaigns = aggregateSignals(historical);

  // Build historical ROAS lookup by market
  const histByMarket = {};
  for (const c of historicalCampaigns) {
    if (!histByMarket[c.market]) histByMarket[c.market] = { cost: 0, value: 0, targetRoasSum: 0, targetRoasCount: 0 };
    histByMarket[c.market].cost += c.cost;
    histByMarket[c.market].value += c.conversions_value;
    if (c.targetRoas != null) { histByMarket[c.market].targetRoasSum += c.targetRoas; histByMarket[c.market].targetRoasCount++; }
  }

  const histByCampaign = {};
  for (const c of historicalCampaigns) {
    histByCampaign[c.campaignId] = {
      roas: c.roas,
      targetRoas: c.targetRoas,
    };
  }

  const pacingByMarket = {};
  for (const m of pacingMarkets) {
    pacingByMarket[m.market] = m;
  }

  if (granularity === 'campaign') {
    // Campaign-level recommendations
    const results = [];
    for (const c of recentCampaigns) {
      if (c.cost < 1) continue; // skip inactive campaigns
      const hist = histByCampaign[c.campaignId] || {};
      const pacing = pacingByMarket[c.market] || {};

      const budget = pacing.budget || 0;
      const projectionBase = pacing.projection_base || 0;
      const dailyActual = pacing.daily_actual || 0;
      const dailyTarget = pacing.daily_target || 0;
      const pacingPct = pacing.pacing_pct || 100;

      const rec = classify({
        pacing_pct: pacingPct,
        roas_recent: c.roas,
        roas_historical: hist.roas || c.roas,
        roas_target: c.targetRoas || hist.targetRoas || 0,
        click_share: c.clickShare,
        daily_actual: dailyActual,
        daily_target: dailyTarget,
        budget,
        projection_base: projectionBase,
      });

      results.push({
        market: c.market,
        campaign: c.campaign,
        campaignId: c.campaignId,
        campaignType: c.campaignType,
        ...rec,
        pacing_pct: r2(pacingPct),
        roas_recent: c.roas,
        roas_historical: r2(hist.roas || c.roas),
        click_share: c.clickShare,
        spend_to_date: r2(pacing.spend_to_date || 0),
        budget,
        projection_base: r2(projectionBase),
        daily_actual: r2(dailyActual),
        daily_target: r2(dailyTarget),
      });
    }
    return results.sort((a, b) => b.impactScore - a.impactScore);
  }

  // Market-level recommendations
  const recentByMarket = groupByMarket(recentCampaigns);
  const results = [];

  for (const rm of recentByMarket) {
    if (rm.cost < 1) continue;
    const hist = histByMarket[rm.market] || {};
    const histRoas = hist.cost > 0 ? r2(hist.value / hist.cost) : rm.roas;
    const histTargetRoas = hist.targetRoasCount > 0 ? r2(hist.targetRoasSum / hist.targetRoasCount) : 0;

    const pacing = pacingByMarket[rm.market] || {};
    const budget = pacing.budget || 0;
    const projectionBase = pacing.projection_base || 0;
    const dailyActual = pacing.daily_actual || 0;
    const dailyTarget = pacing.daily_target || 0;
    const pacingPct = pacing.pacing_pct || 100;

    const rec = classify({
      pacing_pct: pacingPct,
      roas_recent: rm.roas,
      roas_historical: histRoas,
      roas_target: rm.targetRoas || histTargetRoas || 0,
      click_share: rm.clickShare,
      daily_actual: dailyActual,
      daily_target: dailyTarget,
      budget,
      projection_base: projectionBase,
    });

    results.push({
      market: rm.market,
      ...rec,
      pacing_pct: r2(pacingPct),
      roas_recent: rm.roas,
      roas_historical: histRoas,
      click_share: rm.clickShare,
      spend_to_date: r2(pacing.spend_to_date || 0),
      budget,
      projection_base: r2(projectionBase),
      daily_actual: r2(dailyActual),
      daily_target: r2(dailyTarget),
    });
  }

  return results.sort((a, b) => b.impactScore - a.impactScore);
}
