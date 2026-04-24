import 'dotenv/config';
import { getApi, getRefreshToken, getCustomer } from './googleAdsClient.js';
import { BRANDS, MCC_ID } from './config/accounts.js';

function extractComarketBrand(campaignName) {
  const parts = campaignName.split(/[|-]/).map(p => p.trim());
  const idx = parts.findIndex(p => p.toLowerCase().includes('comarket'));
  if (idx === -1) return '';
  return parts[idx + 1] || '';
}

async function run() {
  try {
    const api = getApi();
    const refreshToken = getRefreshToken();
    const frAccount = BRANDS.COCOONCENTER.accounts.find(a => a.market === 'FR');
    const customer = getCustomer(api, frAccount.id, MCC_ID, refreshToken);
    
    // Check 2025
    const from25 = '2025-01-01';
    const to25 = '2025-12-31';
    const results25 = await customer.query(`SELECT campaign.name FROM campaign WHERE segments.date BETWEEN '${from25}' AND '${to25}' AND metrics.cost_micros > 0`);
    
    // Check 2026
    const from26 = '2026-01-01';
    const to26 = '2026-12-31';
    const results26 = await customer.query(`SELECT campaign.name FROM campaign WHERE segments.date BETWEEN '${from26}' AND '${to26}' AND metrics.cost_micros > 0`);
    
    const brands25 = new Set();
    results25.forEach(r => {
        const b = extractComarketBrand(r.campaign.name);
        if (b) brands25.add(b);
    });
    
    const brands26 = new Set();
    results26.forEach(r => {
        const b = extractComarketBrand(r.campaign.name);
        if (b) brands26.add(b);
    });
    
    console.log('Brands in 2025:', Array.from(brands25).sort());
    console.log('Brands in 2026:', Array.from(brands26).sort());

  } catch (e) {
    console.error('Error:', e);
  }
}
run();
