/**
 * Aggregate metrics from rows
 */
export function aggregateMetrics(rows) {
  let spend = 0, revenue = 0, conversions = 0, clicks = 0, impressions = 0;
  
  // Weighted averages for impression shares (weighted by impressions)
  let sumImpShare = 0;
  let sumRankLostShare = 0;
  let sumBudgetLostShare = 0;

  for (const r of rows) {
    spend += r.cost;
    revenue += r.conversion_value;
    conversions += r.conversions;
    clicks += r.clicks;
    const rowImps = r.impressions || 0;
    impressions += rowImps;
    
    sumImpShare += (r.searchImpressionShare || 0) * rowImps;
    sumRankLostShare += (r.searchRankLostImpressionShare || 0) * rowImps;
    sumBudgetLostShare += (r.searchBudgetLostImpressionShare || 0) * rowImps;
  }

  const roas = spend > 0 ? revenue / spend : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const aov = conversions > 0 ? revenue / conversions : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  
  const impressionShare = impressions > 0 ? (sumImpShare / impressions) * 100 : 0;
  const rankLostShare = impressions > 0 ? (sumRankLostShare / impressions) * 100 : 0;
  const budgetLostShare = impressions > 0 ? (sumBudgetLostShare / impressions) * 100 : 0;

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
    impressionShare: Math.round(impressionShare * 100) / 100,
    rankLostShare: Math.round(rankLostShare * 100) / 100,
    budgetLostShare: Math.round(budgetLostShare * 100) / 100,
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
