import 'dotenv/config';
import { getRows } from './googleAdsClient.js';

function extractComarketBrand(campaignName) {
  const parts = campaignName.split(/[|-]/).map(p => p.trim());
  const idx = parts.findIndex(p => p.toLowerCase().includes('comarket'));
  if (idx === -1) return '';
  return parts[idx + 1] || '';
}

async function run() {
  try {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    console.log(`Fetching last 30 days to find brands...`);
    const rows = await getRows({ brand: 'ALL', market: 'ALL', from, to, includeComarket: true });
    
    const comarketRows = rows.filter(r => r.campaign.toLowerCase().includes('comarket'));
    const brands = new Set();
    
    comarketRows.forEach(r => {
      const b = extractComarketBrand(r.campaign);
      if (b) brands.add(b);
    });
    
    console.log('Detected partner brands:');
    console.log(Array.from(brands).sort());
    
    if (comarketRows.length > 0) {
        console.log('\nSample campaign names:');
        console.log(comarketRows.slice(0, 5).map(r => r.campaign));
    }

  } catch (e) {
    console.error('Error:', e);
  }
}
run();
