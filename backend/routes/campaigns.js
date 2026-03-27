import { Router } from 'express';
import { queryAccount, buildCampaignQuery, parseCampaignRows } from '../googleAds.js';
import { isAuthenticated } from '../auth.js';
import { getFilteredAccounts } from './kpis.js';

const router = Router();

router.get('/campaigns', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { brand = 'ALL', market = 'ALL', from, to, type = 'ALL' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to date parameters' });

    const accounts = getFilteredAccounts(brand, market);
    if (accounts.length === 0) return res.json([]);

    const allRows = [];
    await Promise.all(accounts.map(async (acc) => {
      const gaql = buildCampaignQuery(from, to, type);
      const rows = await queryAccount(acc, gaql);
      allRows.push(...rows);
    }));

    const campaigns = parseCampaignRows(allRows);

    // Filter DSA specifically if requested (DSA campaigns usually have "DSA" in name)
    let filtered = campaigns;
    if (type === 'DSA') {
      filtered = campaigns.filter(c => c.campaign_name.toLowerCase().includes('dsa'));
    }

    // Sort by spend descending
    filtered.sort((a, b) => b.spend - a.spend);

    res.json(filtered);
  } catch (err) {
    console.error('Campaigns error:', err);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

export default router;
