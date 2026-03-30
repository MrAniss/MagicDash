import { GoogleGenerativeAI } from '@google/generative-ai';

function getModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });
}

// ─── JSON extraction helper ────────────────────────────
function extractJSON(text) {
  const cleaned = text.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  return JSON.parse(cleaned);
}

// ─── System prompt for intent parsing ─────────────────
const PARSE_SYSTEM = `Tu es un assistant data expert Google Ads et GA4.
Tu travailles pour Dhygietal, une agence e-commerce santé/beauté.

Marques disponibles :
- Cocooncenter (20 marchés : FR, BE, NL, DE, IT, ES, UK, AT, PT, LU, SE, NO, FI, PL, IE, RO, SA, CA, AU, US)
- Pascal Coste Shopping (FR uniquement)
- Parapharmacie Lafayette (FR uniquement)

Comptes Google Ads Cocooncenter : FR=432-928-8276, BE=622-722-1825, NL=426-916-4266, DE=791-513-9319, IT=143-906-5278, ES=835-420-9149, UK=684-585-8456, AT=892-036-9741, PT=185-734-9056, LU=339-119-3668, SE=995-360-5444, NO=682-321-1943, FI=418-859-4423, PL=629-192-9054, IE=903-581-1386, RO=677-043-2168, SA=880-717-7535, CA=998-980-4415, AU=973-987-0903, US=674-997-1705
Pascal Coste Shopping : FR=412-763-0025
Parapharmacie Lafayette : FR=422-013-5964

Sources disponibles :
- google_ads : dépenses (cost), conversions, ROAS, impressions, clics, CTR, revenue (conversions_value)
- ga4 : sessions, utilisateurs (totalUsers), transactions, revenue (totalRevenue), CVR, panier moyen

À partir de la question de l'utilisateur, retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) :
{
  "source": "google_ads" | "ga4" | "both",
  "brand": "Cocooncenter" | "Pascal Coste Shopping" | "Parapharmacie Lafayette" | "ALL",
  "brand_key": "COCOONCENTER" | "PASCAL_COSTE" | "PARAPHARMACIE_LAFAYETTE" | "ALL",
  "market": "FR" | "DE" | "UK" | ... | "ALL",
  "date_from": "YYYY-MM-DD",
  "date_to": "YYYY-MM-DD",
  "metrics": ["cost", "conversions_value", "roas"],
  "granularity": "total" | "day" | "week" | "month",
  "gaql": "SELECT ... FROM campaign WHERE segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'",
  "ga4_query": { "dimensions": ["date"], "metrics": ["sessions", "totalRevenue"], "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD" },
  "explanation": "Ce que tu vas chercher en une phrase"
}

Règles GAQL obligatoires :
- Toujours filtrer : WHERE segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'
- Les dépenses : metrics.cost_micros (à diviser par 1 000 000 côté backend)
- Pour le ROAS : inclure metrics.cost_micros ET metrics.conversions_value
- Pour segmenter par date : inclure segments.date dans SELECT
- Table principale pour métriques campagnes : campaign
- Ne jamais utiliser UPDATE, DELETE, MUTATE, INSERT — lecture seule
- Si granularity = "total" : pas besoin de segments.date dans SELECT

Règles GA4 obligatoires :
- Dimensions standard : date, sessionDefaultChannelGroup, country
- Métriques standard : sessions, totalUsers, transactions, totalRevenue
- dateFrom et dateTo au format YYYY-MM-DD`;

// ─── Parse question → intent ───────────────────────────
export async function parseQuestion(question, context = {}, today) {
  const contextStr = context.brand
    ? `\nContexte fourni : marque = ${context.brand}${context.market ? `, marché = ${context.market}` : ''}`
    : '';

  const prompt = `${PARSE_SYSTEM}

Question : ${question}${contextStr}
Date du jour : ${today}

Réponds UNIQUEMENT avec le JSON, sans explication ni formatage markdown.`;

  const result = await getModel().generateContent(prompt);
  const text = result.response.text().trim();
  return extractJSON(text);
}

// ─── Fix a broken intent after API error ──────────────
export async function fixIntent(question, intent, errorMessage) {
  const prompt = `Tu es un assistant data expert Google Ads et GA4.

La requête suivante a produit une erreur. Génère une version corrigée.

Question initiale : ${question}
Intent actuel : ${JSON.stringify(intent, null, 2)}
Erreur reçue : ${errorMessage}

Retourne UNIQUEMENT le JSON corrigé complet (même structure que l'intent, sans markdown).
Assure-toi que la syntaxe GAQL est valide : noms de champs corrects, WHERE obligatoire, pas de JOIN.`;

  const result = await getModel().generateContent(prompt);
  const text = result.response.text().trim();
  return extractJSON(text);
}

// ─── Format raw data → natural language response ──────
export async function formatResponse(rawData, question, intent) {
  const dataStr = JSON.stringify(rawData).slice(0, 8000);

  const prompt = `Tu es un assistant data expert SEA pour Dhygietal.
Voici les données brutes récupérées (JSON) : ${dataStr}
La question initiale était : "${question}"
Source utilisée : ${intent.source}, Période : ${intent.date_from} → ${intent.date_to}

Réponds en français, de façon concise et directe.
Mets en valeur les chiffres clés (€ pour les montants, × pour le ROAS, % pour CVR/CTR).
Si tu vois des anomalies ou insights intéressants, mentionne-les.

Retourne UNIQUEMENT un JSON valide (sans markdown, sans backticks) :
{
  "answer": "Réponse en langage naturel concise...",
  "data": [{ "colonne": "valeur" }],
  "chart": {
    "type": "bar" | "line" | "none",
    "x": ["label1", "label2"],
    "series": [{ "name": "Nom série", "data": [val1, val2] }]
  }
}

Règles pour le chart :
- "line" si granularity day/week/month (évolution temporelle)
- "bar" si comparaison entre marchés/campagnes/marques
- "none" si une seule valeur ou données insuffisantes
- Les valeurs dans series.data doivent être des nombres, pas des chaînes
- Pas plus de 20 points sur l'axe X

Si les données sont vides, answer explique pourquoi et chart.type = "none".`;

  const result = await getModel().generateContent(prompt);
  const text = result.response.text().trim();
  return extractJSON(text);
}
