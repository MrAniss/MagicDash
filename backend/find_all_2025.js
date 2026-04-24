import 'dotenv/config';
import { getApi, getRefreshToken, getCustomer } from './googleAdsClient.js';
import { BRANDS, MCC_ID } from './config/accounts.js';

async function run() {
  try {
    const api = getApi();
    const refreshToken = getRefreshToken();
    const frAccount = BRANDS.COCOONCENTER.accounts.find(a => a.market === 'FR');
    const customer = getCustomer(api, frAccount.id, MCC_ID, refreshToken);
    
    // Check whole 2025
    const from = '2025-01-01';
    const to = '2025-12-31';
    
    const gaql = `
      SELECT campaign.name, campaign.status, metrics.cost_micros 
      FROM campaign 
      WHERE segments.date BETWEEN '${from}' AND '${to}' 
      AND metrics.cost_micros > 0
    `;
    
    const results = await customer.query(gaql);
    const names = [...new Set(results.map(r => r.campaign.name))].sort();
    console.log(`Found ${names.length} campaigns in 2025:`);
    names.forEach(n => console.log(`- ${n}`));

  } catch (e) {
    console.error('Error:', e);
  }
}
run();
