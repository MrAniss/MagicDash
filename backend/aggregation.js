/**
 * Aggregate metrics from rows
 */
export function aggregateMetrics(rows) {
  let spend = 0, revenue = 0, conversions = 0, clicks = 0, impressions = 0;

  for (const r of rows) {
    spend += r.cost;
    revenue += r.conversion_value;
    conversions += r.conversions;
    clicks += r.clicks;
    impressions += r.impressions;
  }

  const roas = spend > 0 ? revenue / spend : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const aov = conversions > 0 ? revenue / conversions : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;

  return {
    spend: Math.round(spend * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    roas: Math.round(roas * 100) / 100,
    conversions: Math.round(conversions * 100) / 100,
    cvr: Math.round(cvr * 100) / 100,
    clicks,
    impressions,
    ctr: Math.round(ctr * 100) / 100,
    aov: Math.round(aov * 100) / 100,
    cpc: Math.round(cpc * 100) / 100,
  };
}

/**
 * Group rows by a key function
 */
export function groupBy(rows, keyFn) {
  const groups = {};
  for (const r of rows) {
    const key = keyFn(r);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  return groups;
}
