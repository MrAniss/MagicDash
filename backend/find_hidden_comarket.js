import 'dotenv/config';
import { getApi, getRefreshToken, getCustomer } from './googleAdsClient.js';
import { BRANDS, MCC_ID } from './config/accounts.js';

async function run() {
  try {
    const api = getApi();
    const refreshToken = getRefreshToken();
    const frAccount = BRANDS.COCOONCENTER.accounts.find(a => a.market === 'FR');
    const customer = getCustomer(api, frAccount.id, MCC_ID, refreshToken);
    
    const from = '2025-01-01';
    const to = '2025-12-31';
    
    const gaql = `
      SELECT campaign.name, metrics.cost_micros 
      FROM campaign 
      WHERE segments.date BETWEEN '${from}' AND '${to}' 
      AND metrics.cost_micros > 0
    `;
    
    const results = await customer.query(gaql);
    const names = [...new Set(results.map(r => r.campaign.name))];
    
    const brands = ['Bioderma', 'Eucerin', 'Cooper'];
    
    console.log('Campaigns containing brand name but NOT "Comarket":');
    names.forEach(n => {
        const hasBrand = brands.some(b => n.includes(b));
        const hasComarket = n.toLowerCase().includes('comarket');
        if (hasBrand && !hasComarket) {
            console.log(`- ${n}`);
        }
    });

  } catch (e) {
    console.error('Error:', e);
  }
}
run();
