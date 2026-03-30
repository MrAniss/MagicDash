import express from 'express';
import { parseQuestion, fixIntent, formatResponse } from '../services/geminiClient.js';
import { executeQuery } from '../services/queryBuilder.js';

const router = express.Router();
const MAX_RETRIES = 2;

router.post('/query', async (req, res) => {
  const { question, context = {} } = req.body;

  if (!question?.trim()) {
    return res.status(400).json({ error: 'Question manquante' });
  }

  const today = new Date().toISOString().split('T')[0];
  const startTime = Date.now();

  // ── Step 1: Gemini parses the question into intent ───
  let intent;
  try {
    intent = await parseQuestion(question, context, today);
    console.log('[Assistant] Intent:', JSON.stringify(intent, null, 2));
  } catch (err) {
    console.error('[Assistant] Gemini parse error:', err.message);
    const is429 = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('Too Many Requests');
    return res.json({
      answer: is429
        ? "L'API Gemini est temporairement saturée (quota dépassé). Réessaie dans quelques secondes, ou active la facturation sur ton projet Google AI Studio pour augmenter les limites."
        : "Je n'ai pas pu interpréter ta question. Essaie de préciser la marque, le marché ou la période. Exemple : \"Quel est le ROAS de la France ce mois-ci ?\"",
      data: [],
      chart: { type: 'none', x: [], series: [] },
      source_used: null,
      query_debug: null,
      explanation: null,
    });
  }

  // ── Step 2: Execute query with auto-retry on error ───
  let rawData = null;
  let lastError = null;
  let currentIntent = intent;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      rawData = await executeQuery(currentIntent);
      lastError = null;
      break;
    } catch (err) {
      lastError = err.message;
      console.error(`[Assistant] Query attempt ${attempt + 1} failed:`, err.message);

      if (attempt < MAX_RETRIES - 1) {
        console.log('[Assistant] Asking Gemini to fix the query...');
        try {
          currentIntent = await fixIntent(question, currentIntent, err.message);
          console.log('[Assistant] Fixed intent:', JSON.stringify(currentIntent, null, 2));
        } catch (fixErr) {
          console.error('[Assistant] Gemini fix error:', fixErr.message);
          break;
        }
      }
    }
  }

  // All retries exhausted
  if (lastError && !rawData) {
    return res.json({
      answer: `La requête générée a retourné une erreur après ${MAX_RETRIES} tentatives. Reformule ta question ou active le mode debug pour voir la requête.`,
      data: [],
      chart: { type: 'none', x: [], series: [] },
      source_used: intent.source,
      query_debug: currentIntent.gaql || JSON.stringify(currentIntent.ga4_query),
      explanation: intent.explanation,
      error: lastError,
      accounts_queried: [],
    });
  }

  // Empty results
  if (!rawData?.rows?.length) {
    return res.json({
      answer: 'Aucune donnée trouvée pour cette période et ce périmètre. Vérifie que des campagnes étaient actives à cette période.',
      data: [],
      chart: { type: 'none', x: [], series: [] },
      source_used: intent.source,
      query_debug: currentIntent.gaql || JSON.stringify(currentIntent.ga4_query),
      explanation: intent.explanation,
      accounts_queried: rawData?.accounts_queried || [],
    });
  }

  // ── Step 3: Gemini formats the response ─────────────
  try {
    const formatted = await formatResponse(rawData, question, currentIntent);

    return res.json({
      answer: formatted.answer || '',
      data: formatted.data || [],
      chart: formatted.chart || { type: 'none', x: [], series: [] },
      source_used: intent.source,
      query_debug: currentIntent.gaql || JSON.stringify(currentIntent.ga4_query),
      explanation: intent.explanation,
      accounts_queried: rawData.accounts_queried || rawData.properties_queried || [],
      execution_time_ms: Date.now() - startTime,
    });
  } catch (err) {
    console.error('[Assistant] Gemini format error:', err.message);
    // Fallback: return raw data without Gemini formatting
    return res.json({
      answer: `Données récupérées (${rawData.rows.length} lignes). Erreur lors du formatage Gemini.`,
      data: rawData.rows.slice(0, 50),
      chart: { type: 'none', x: [], series: [] },
      source_used: intent.source,
      query_debug: currentIntent.gaql || JSON.stringify(currentIntent.ga4_query),
      explanation: intent.explanation,
      accounts_queried: rawData.accounts_queried || rawData.properties_queried || [],
      execution_time_ms: Date.now() - startTime,
    });
  }
});

export default router;
