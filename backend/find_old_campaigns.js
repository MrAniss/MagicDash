import 'dotenv/config';
import { queryMCC } from './googleAds.js';
import { BRANDS, MCC_ID } from './config/accounts.js';

async function run() {
  try {
    const frAccount = BRANDS.COCOONCENTER.accounts.find(a => a.market === 'FR');
    console.log(`Checking account: ${frAccount.id} (FR)`);
    
    // Check April 2025
    const from = '2025-04-01';
    const to = '2025-04-30';
    
    // We want ALL campaigns including paused ones with spend
    const gaql = `
      SELECT campaign.name, metrics.cost_micros, metrics.impressions 
      FROM campaign 
      WHERE segments.date BETWEEN '${from}' AND '${to}' 
      AND metrics.cost_micros > 0
    `;
    
    const rows = await queryMCC(frAccount.id, gaql);
    console.log(`Found ${rows.length} campaigns with spend in April 2025.`);
    
    console.log('Campaign Names:');
    const names = [...new Set(rows.map(r => r.campaign.name))].sort();
    names.forEach(n => console.log(`- ${n}`));

  } catch (e) {
    console.error('Error:', e);
  }
}
run();
