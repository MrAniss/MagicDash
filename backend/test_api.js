import 'dotenv/config';
import { queryMCC, buildCampaignQuery } from './googleAds.js';
import { BRANDS } from './config/accounts.js';

async function test() {
  try {
    // Take the first available account, e.g. Cocooncenter FR
    const account = BRANDS.COCOONCENTER.accounts[0];
    console.log(`Testing account: ${account.id} (${account.market})`);
    
    // Last 7 days
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    const gaql = buildCampaignQuery(from, to, 'ALL');
    console.log('Query:', gaql);
    
    const rows = await queryMCC(account.id, gaql);
    console.log(`Received ${rows.length} rows.`);
    
    if (rows.length > 0) {
      // Find a row with impressions > 0
      const rowWithImps = rows.find(r => r.metrics && Number(r.metrics.impressions || 0) > 0);
      if (rowWithImps) {
         console.log('Sample row metrics (with impressions):', JSON.stringify(rowWithImps.metrics, null, 2));
      } else {
         console.log('No rows with impressions > 0 found. Showing first row metrics:', JSON.stringify(rows[0].metrics, null, 2));
      }
    }
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
