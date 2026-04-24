import 'dotenv/config';
import { getRows } from './googleAdsClient.js';

async function run() {
  try {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    console.log(`Fetching from ${from} to ${to}...`);
    const rows = await getRows({ brand: 'ALL', market: 'ALL', from, to, campaignType: 'ALL', includeComarket: false });
    
    console.log(`Received ${rows.length} rows.`);
    
    if (rows.length > 0) {
      const pmax = rows.find(r => r.campaign_type === 'Performance Max' && r.impressions > 0);
      if (pmax) {
        console.log('Sample PMax row IS metrics:', {
           name: pmax.campaign,
           imps: pmax.impressions,
           searchIS: pmax.searchImpressionShare,
           rankLost: pmax.searchRankLostImpressionShare,
           budgetLost: pmax.searchBudgetLostImpressionShare,
           absTop: pmax.absoluteTopImpressionPercentage,
           top: pmax.topImpressionPercentage
        });
      }
      
      const search = rows.find(r => r.campaign_type === 'Search' && r.impressions > 0);
      if (search) {
        console.log('Sample Search row IS metrics:', {
           name: search.campaign,
           imps: search.impressions,
           searchIS: search.searchImpressionShare,
           rankLost: search.searchRankLostImpressionShare,
           budgetLost: search.searchBudgetLostImpressionShare,
           absTop: search.absoluteTopImpressionPercentage,
           top: search.topImpressionPercentage
        });
      }
    }
  } catch (e) {
    console.error('Error:', e);
  }
}
run();
