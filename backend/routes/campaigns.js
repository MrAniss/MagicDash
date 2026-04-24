import { Router } from 'express';
import { queryAccount, buildCampaignQuery, parseCampaignRows } from '../googleAds.js';
import { isAuthenticated } from '../auth.js';
import { getFilteredAccounts, getComparisonDates } from './kpis.js';

const router = Router();

router.get('/campaigns', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo, type = 'ALL' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to date parameters' });

    const accounts = getFilteredAccounts(brand, market);
    if (accounts.length === 0) return res.json({ campaigns: [], typeSummary: [] });

    const fetchPeriod = async (dFrom, dTo) => {
      const allRows = [];
      await Promise.all(accounts.map(async (acc) => {
        const gaql = buildCampaignQuery(dFrom, dTo, type);
        const rows = await queryAccount(acc, gaql);
        allRows.push(...rows);
      }));
      return parseCampaignRows(allRows);
    };

    const currentCampaigns = await fetchPeriod(from, to);
    let comparisonCampaigns = [];
    
    if (compareTo && compareTo !== 'none') {
      const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
      comparisonCampaigns = await fetchPeriod(compFrom, compTo);
    }

    const compMap = new Map(comparisonCampaigns.map(c => [c.campaign_name, c]));

    const result = currentCampaigns.map(curr => {
      const prev = compMap.get(curr.campaign_name);
      const row = { ...curr };
      
      if (prev) {
        Object.keys(curr).forEach(key => {
          // Calculate delta for numeric metrics
          const numericKeys = [
            'spend', 'revenue', 'conversions', 'clicks', 'impressions', 
            'cvr', 'ctr', 'aov', 'cpc', 'impressionShare', 
            'rankLostShare', 'budgetLostShare'
          ];
          
          if (numericKeys.includes(key)) {
            const v1 = curr[key];
            const v2 = prev[key];
            if (v2 > 0) {
              row[`delta_${key}`] = ((v1 - v2) / v2) * 100;
            } else if (v1 > 0) {
              row[`delta_${key}`] = 100;
            } else {
              row[`delta_${key}`] = 0;
            }
          }
        });
        // ROAS delta is absolute difference
        row.delta_roas = curr.roas - prev.roas;
      }

      return row;
    });

    // Final sorting
    result.sort((a, b) => b.spend - a.spend);

    res.json({ 
      campaigns: result, 
      typeSummary: calculateTypeSummary(result) 
    });
  } catch (err) {
    console.error('Campaigns error:', err);
    res.status(500).json({ error: err.message });
  }
});

function calculateTypeSummary(campaigns) {
  const byType = {};
  campaigns.forEach(c => {
    if (!byType[c.type]) byType[c.type] = { type: c.type, spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 };
    byType[c.type].spend += c.spend;
    byType[c.type].revenue += c.revenue;
    byType[c.type].conversions += c.conversions;
    byType[c.type].clicks += c.clicks;
    byType[c.type].impressions += c.impressions;
  });

  const totalSpend = Object.values(byType).reduce((sum, t) => sum + t.spend, 0);

  return Object.values(byType).map(t => {
    t.roas = t.spend > 0 ? t.revenue / t.spend : 0;
    t.cvr = t.clicks > 0 ? (t.conversions / t.clicks) * 100 : 0;
    t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0;
    t.aov = t.conversions > 0 ? t.revenue / t.conversions : 0;
    t.spend_pct = totalSpend > 0 ? (t.spend / totalSpend) * 100 : 0;
    return t;
  });
}

export default router;
