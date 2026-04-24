import 'dotenv/config';
import { getApi, getRefreshToken, getCustomer } from './googleAdsClient.js';
import { BRANDS, MCC_ID } from './config/accounts.js';

async function run() {
  try {
    const api = getApi();
    const refreshToken = getRefreshToken();
    const frAccount = BRANDS.COCOONCENTER.accounts.find(a => a.market === 'FR');
    
    const customer = getCustomer(api, frAccount.id, MCC_ID, refreshToken);
    
    // Check April 2025
    const from = '2025-04-01';
    const to = '2025-04-30';
    
    const gaql = `
      SELECT campaign.name, metrics.cost_micros 
      FROM campaign 
      WHERE segments.date BETWEEN '${from}' AND '${to}' 
      AND metrics.cost_micros > 0
    `;
    
    const results = await customer.query(gaql);
    console.log(`Found ${results.length} campaign segments with spend in April 2025.`);
    
    const names = [...new Set(results.map(r => r.campaign.name))].sort();
    console.log('Campaign Names:');
    names.forEach(n => console.log(`- ${n}`));

  } catch (e) {
    console.error('Error:', e);
  }
}
run();
