// Brand detection patterns for GSC queries and Google Ads campaigns.
// Used by /api/brand/* endpoints.

export const BRAND_PATTERNS = {
  'Cocooncenter': {
    exact_match: ['cocooncenter'],
    variants: [
      'cocoon center',
      'cocoon-center',
      'coocooncenter',
      'cocoonceter',
      'cocoon centre',
      'cocooncenetr',
      'cocoon senter',
    ],
    brand_plus_kw_regex: /\b(cocooncenter|cocoon[\s-]?center|coocooncenter)\b/i,
  },
  'Pascal Coste Shopping': {
    exact_match: ['pascal coste'],
    variants: [
      'pascalcoste',
      'pascal coste shopping',
      'pascal-coste',
      'pascal coste coiffure',
    ],
    brand_plus_kw_regex: /\b(pascal[\s-]?coste)\b/i,
  },
  'Parapharmacie Lafayette': {
    exact_match: ['parapharmacie lafayette'],
    variants: [
      'para lafayette',
      'parapharmacielafayette',
      'lafayette parapharmacie',
      'paralaf',
    ],
    brand_plus_kw_regex: /\b(parapharmacie[\s-]?lafayette|para[\s-]?laf)\b/i,
  },
};

// Detect brand campaigns in Google Ads by campaign name.
// Matches: "Brand", "Marque", or an isolated "M" token between | or - separators.
export const BRAND_CAMPAIGN_PATTERNS = {
  regex: /(\bbrand\b|\bmarque\b|\|\s*M\s*[|\-]|[|\-]\s*M\s*\||[|\-]\s+M\s+[|\-])/i,
};

export function classifyQuery(query, patterns) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return 'NON_BRAND';
  if (patterns.exact_match.includes(q)) return 'BRAND_EXACT';
  if (patterns.variants.includes(q)) return 'BRAND_VARIANT';
  if (patterns.brand_plus_kw_regex.test(q)) return 'BRAND_PLUS_KW';
  return 'NON_BRAND';
}

export function isBrandCampaign(campaignName) {
  return BRAND_CAMPAIGN_PATTERNS.regex.test(campaignName || '');
}
