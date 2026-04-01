import { GoogleGenerativeAI } from '@google/generative-ai';

const ASSET_CONSTRAINTS = {
  RSA_TITLE:       { maxChars: 30 },
  RSA_DESCRIPTION: { maxChars: 90 },
  PMAX_TITLE:      { maxChars: 30 },
  PMAX_TITLE_LONG: { maxChars: 90 },
  PMAX_DESC:       { maxChars: 90 },
  PROMO_TEXT:      { maxChars: 60 },
};

const MARKET_LANGUAGES = {
  FR: { lang: 'fr', label: 'Français' },
  BE: { lang: 'fr', label: 'Français (Belgique)', note: 'Même langue que FR — adapter les prix et offres locales belges' },
  NL: { lang: 'nl', label: 'Néerlandais' },
  DE: { lang: 'de', label: 'Allemand' },
  IT: { lang: 'it', label: 'Italien' },
  ES: { lang: 'es', label: 'Espagnol' },
  UK: { lang: 'en', label: 'Anglais (Royaume-Uni)' },
  AT: { lang: 'de', label: 'Allemand (Autriche)', note: 'Même langue que DE — adapter les spécificités autrichiennes (ex: Apotheke)' },
  PT: { lang: 'pt', label: 'Portugais' },
  LU: { lang: 'fr', label: 'Français (Luxembourg)' },
  SE: { lang: 'sv', label: 'Suédois' },
  NO: { lang: 'no', label: 'Norvégien' },
  FI: { lang: 'fi', label: 'Finnois' },
  PL: { lang: 'pl', label: 'Polonais' },
  IE: { lang: 'en', label: 'Anglais (Irlande)' },
  RO: { lang: 'ro', label: 'Roumain' },
  SA: { lang: 'ar', label: 'Arabe (Arabie Saoudite)', note: 'Écriture droite-à-gauche — adapter le ton au marché saoudien' },
  CA: { lang: 'fr', label: 'Français canadien', note: 'Adapter les expressions québécoises — éviter les anglicismes européens' },
  AU: { lang: 'en', label: "Anglais australien", note: "Utiliser l'orthographe australienne (ex: colour, organise)" },
  US: { lang: 'en', label: 'Anglais américain' },
};

function getModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' });
}

function extractJSONArray(text) {
  const cleaned = text.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();
  const start = cleaned.indexOf('[');
  const end   = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1) return JSON.parse(cleaned.slice(start, end + 1));
  return JSON.parse(cleaned);
}

async function generateForMarket(market, baseAssets, brand, campaignType) {
  const mInfo = MARKET_LANGUAGES[market];
  if (!mInfo) throw new Error(`Marché inconnu: ${market}`);

  const constraintLines = [...new Set(baseAssets.map(a => a.type))]
    .map(t => `- ${t} : maximum ${ASSET_CONSTRAINTS[t]?.maxChars ?? 90} caractères`)
    .join('\n');

  const noteRule = mInfo.note ? `\n6. ${mInfo.note}` : '';

  const prompt = `Tu es un expert en publicité Google Ads spécialisé dans le e-commerce santé et beauté.

Tu dois traduire et adapter des assets publicitaires du français vers le ${mInfo.label} pour le marché ${market}.

Marque : ${brand}
Type de campagne : ${campaignType}

Contraintes STRICTES (à respecter absolument) :
${constraintLines}

Règles :
1. Ne JAMAIS dépasser la limite de caractères — c'est une contrainte absolue et non négociable
2. Adapter le ton et les expressions culturelles au marché cible
3. Conserver l'intention et le message original
4. Si la traduction directe dépasse la limite, reformuler pour rester dans les limites
5. Générer exactement autant d'assets qu'il y en a en entrée${noteRule}

Assets source (français) :
${baseAssets.map(a => `{ "type": "${a.type}", "content": "${a.content}" }`).join('\n')}

Retourne UNIQUEMENT un tableau JSON valide (sans markdown, sans backticks) :
[
  { "type": "RSA_TITLE", "content": "...", "char_count": N },
  ...
]

Vérifie deux fois que chaque content respecte la limite avant de répondre.`;

  const result = await getModel().generateContent(prompt);
  let assets = extractJSONArray(result.response.text().trim());

  // Fix char_count (don't trust Gemini's count)
  assets = assets.map(a => ({ ...a, char_count: a.content.length }));

  // Retry for assets exceeding limits
  const invalid = assets.filter(a => {
    const max = ASSET_CONSTRAINTS[a.type]?.maxChars;
    return max && a.content.length > max;
  });

  if (invalid.length > 0) {
    const retryPrompt = `Les assets suivants dépassent la limite de caractères, reformule-les :
${invalid.map(a => `- Type ${a.type} (max ${ASSET_CONSTRAINTS[a.type]?.maxChars} car.) : "${a.content}" → ${a.content.length} car.`).join('\n')}

Retourne UNIQUEMENT un tableau JSON avec ces assets corrigés (même structure, même nombre).`;

    const retryResult = await getModel().generateContent(retryPrompt);
    const fixed = extractJSONArray(retryResult.response.text().trim());

    for (const fix of fixed) {
      const idx = assets.findIndex(a => a.type === fix.type && a.content.length > (ASSET_CONSTRAINTS[a.type]?.maxChars ?? 90));
      if (idx !== -1) assets[idx] = { ...fix, char_count: fix.content.length };
    }
  }

  return assets.map(a => ({
    type:       a.type,
    content:    a.content,
    char_count: a.content.length,
    valid:      a.content.length <= (ASSET_CONSTRAINTS[a.type]?.maxChars ?? 90),
  }));
}

export async function generateTranslations({ baseAssets, targetMarkets, brand, campaignType }) {
  const results = await Promise.allSettled(
    targetMarkets.map(market => generateForMarket(market, baseAssets, brand, campaignType))
  );

  const generated = [];
  const errors    = [];

  for (let i = 0; i < targetMarkets.length; i++) {
    const market = targetMarkets[i];
    const r = results[i];
    if (r.status === 'fulfilled') {
      generated.push({
        market,
        language: MARKET_LANGUAGES[market]?.lang ?? 'en',
        assets:   r.value,
      });
    } else {
      errors.push({ market, error: r.reason?.message ?? 'Unknown error' });
    }
  }

  return { generated, errors };
}

export async function regenerateSingle({ assetId, type, market, baseContent, currentContent }) {
  const mInfo = MARKET_LANGUAGES[market];
  const constraint = ASSET_CONSTRAINTS[type];
  if (!mInfo || !constraint) throw new Error('Invalid market or type');

  const prompt = `Retraduis cet asset publicitaire en ${mInfo.label} pour le marché ${market}.
Type : ${type} — limite stricte : ${constraint.maxChars} caractères

Asset source FR : "${baseContent}"
Traduction actuelle : "${currentContent}" (${currentContent.length} car.)

Retourne UNIQUEMENT la nouvelle traduction (texte brut, sans guillemets, sans explication).
Vérifie que la longueur est bien inférieure à ${constraint.maxChars} caractères.`;

  const result  = await getModel().generateContent(prompt);
  const content = result.response.text().trim().replace(/^["']|["']$/g, '');

  return {
    content,
    char_count: content.length,
    valid: content.length <= constraint.maxChars,
  };
}
