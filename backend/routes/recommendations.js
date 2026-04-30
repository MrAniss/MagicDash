import { Router } from 'express';
import { isAuthenticated } from '../auth.js';
import { getCampaignAuditData } from '../googleAdsClient.js';
import { r2 } from '../dateUtils.js';

const router = Router();

// ─── Recommendation engine ──────────────────────────────

function scoreRecommendation(campaign) {
  const {
    campaign_id, campaign_name, campaign_type, market, brand, brandLabel,
    bid_strategy, target_roas, budget_daily,
    roas_7d, roas_30d, roas_90d,
    cost_7d, cost_30d, conv_value_7d, conv_value_30d,
    clicks_7d, clicks_30d_daily,
    click_share_7d,
  } = campaign;

  const recs = [];
  const target = target_roas || 0;
  const cs7 = click_share_7d || 0;

  // ── 1. BAISSER tROAS ──
  if (
    target > 0 &&
    roas_7d > target * 1.25 &&
    roas_30d > target * 1.15 &&
    cs7 < 0.75
  ) {
    const newTarget = r2(roas_30d * 0.90);
    const impact = r2((cost_7d / 7) * 30 * (1 - cs7) * roas_7d);
    const priority = (roas_7d - target) / target > 0.30 ? 'HIGH' : 'MEDIUM';
    recs.push({
      type: 'BAISSER_TROAS',
      priority,
      impact_eur: Math.round(impact),
      current_value: r2(target),
      suggested_value: newTarget,
      label: `ROAS 7j (${roas_7d}×) largement au-dessus de la cible (${target}×) confirmé sur 30j. Baisser le tROAS de ${Math.round(target * 100)}% à ${Math.round(newTarget * 100)}% pour capter plus de volume.`,
      action: `Baisser tROAS de ${Math.round(target * 100)}% → ${Math.round(newTarget * 100)}%`,
      rationale: { roas_7d, roas_30d, target, click_share: cs7 },
    });
  }

  // ── 2. MONTER tROAS ──
  if (
    target > 0 &&
    roas_7d < target * 0.80 &&
    roas_30d < target * 0.90
  ) {
    const newTarget = r2(target * 1.10);
    const impact = r2(cost_30d * (1 - roas_30d / target));
    const priority = roas_7d < target * 0.70 ? 'HIGH' : 'MEDIUM';
    recs.push({
      type: 'MONTER_TROAS',
      priority,
      impact_eur: Math.round(impact),
      current_value: r2(target),
      suggested_value: newTarget,
      label: `ROAS 7j (${roas_7d}×) en dessous de la cible (${target}×) sur 30j. Monter le tROAS de ${Math.round(target * 100)}% à ${Math.round(newTarget * 100)}% pour améliorer la rentabilité.`,
      action: `Monter tROAS de ${Math.round(target * 100)}% → ${Math.round(newTarget * 100)}%`,
      rationale: { roas_7d, roas_30d, target, click_share: cs7 },
    });
  }

  // ── 3. AUGMENTER budget ──
  const dailySpend7 = cost_7d / 7;
  if (
    budget_daily > 0 &&
    target > 0 &&
    roas_7d >= target &&
    dailySpend7 >= budget_daily * 0.95
  ) {
    const newBudget = Math.round(budget_daily * 1.20);
    const impact = r2((budget_daily * 0.20) * 30 * roas_7d);
    const priority = cs7 < 0.50 ? 'HIGH' : 'MEDIUM';
    recs.push({
      type: 'AUGMENTER_BUDGET',
      priority,
      impact_eur: Math.round(impact),
      current_value: r2(budget_daily),
      suggested_value: newBudget,
      label: `Campagne limitée par le budget (dépense ${Math.round(dailySpend7)} €/j ≥ 95% du budget ${Math.round(budget_daily)} €/j) avec un ROAS sain (${roas_7d}×). Augmenter le budget journalier de ${Math.round(budget_daily)} € à ${newBudget} €.`,
      action: `Augmenter budget journalier ${Math.round(budget_daily)} € → ${newBudget} €`,
      rationale: { roas_7d, budget_daily, daily_spend: r2(dailySpend7), click_share: cs7 },
    });
  }

  // ── 4. RÉDUIRE budget ──
  if (
    budget_daily > 0 &&
    target > 0 &&
    roas_7d < target * 0.80 &&
    roas_30d < target * 0.85
  ) {
    const newBudget = Math.round(budget_daily * 0.80);
    recs.push({
      type: 'REDUIRE_BUDGET',
      priority: 'MEDIUM',
      impact_eur: Math.round(cost_30d * (1 - roas_30d / target)),
      current_value: r2(budget_daily),
      suggested_value: newBudget,
      label: `ROAS dégradé (7j : ${roas_7d}×, 30j : ${roas_30d}×) sous la cible (${target}×). Réduire le budget journalier de ${Math.round(budget_daily)} € à ${newBudget} € pour limiter les pertes.`,
      action: `Réduire budget journalier ${Math.round(budget_daily)} € → ${newBudget} €`,
      rationale: { roas_7d, roas_30d, target, budget_daily },
    });
  }

  // ── 5. DÉCROCHAGE ROAS ──
  if (
    roas_30d > 0 &&
    roas_7d < roas_30d * 0.75 &&
    cost_7d > 500
  ) {
    const impact = r2((roas_30d - roas_7d) * cost_7d);
    recs.push({
      type: 'DÉCROCHAGE',
      priority: 'HIGH',
      impact_eur: Math.round(impact),
      current_value: r2(roas_7d),
      suggested_value: null,
      label: `Décrochage détecté — ROAS 7j (${roas_7d}×) vs 30j (${roas_30d}×), chute de ${Math.round((1 - roas_7d / roas_30d) * 100)}%.`,
      action: 'Vérifier : changement algo ? Problème de tracking ? Nouveau concurrent ? Comparer search impression share avant/après le décrochage.',
      rationale: { roas_7d, roas_30d, cost_7d, drop_pct: r2((1 - roas_7d / roas_30d) * 100) },
    });
  }

  // ── 6. CHUTE DE TRAFIC ──
  const daily7 = clicks_7d / 7;
  if (
    clicks_30d_daily > 0 &&
    daily7 < clicks_30d_daily * 0.70 &&
    cost_7d > 200
  ) {
    const dropPct = Math.round((1 - daily7 / clicks_30d_daily) * 100);
    recs.push({
      type: 'DÉCROCHAGE',
      priority: 'HIGH',
      impact_eur: Math.round((clicks_30d_daily - daily7) * 7 * (roas_7d || roas_30d) * (cost_7d / (clicks_7d || 1))),
      current_value: r2(daily7),
      suggested_value: null,
      label: `Chute de trafic détectée — clics 7j en baisse de ${dropPct}% vs 30j (${Math.round(daily7)}/j vs ${Math.round(clicks_30d_daily)}/j).`,
      action: 'Vérifier : Quality Score, CPC moyen, enchères, nouvelles exclusions ou problème de budget partagé.',
      rationale: { clicks_7d_daily: r2(daily7), clicks_30d_daily: r2(clicks_30d_daily), drop_pct: dropPct },
    });
  }

  return recs.map((rec, i) => ({
    id: `rec_${campaign_id}_${i}`,
    ...rec,
    campaign_id, campaign_name, campaign_type,
    market, brand, brandLabel,
  }));
}

// ─── GET /api/recommendations ───────────────────────────
router.get('/', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const {
      brand = 'ALL',
      market = 'ALL',
      type = 'ALL',
      priority = 'ALL',
    } = req.query;

    const campaigns = await getCampaignAuditData(brand === 'ALL' ? 'ALL' : brand.toUpperCase().replace(/ /g, '_'));

    let allRecs = campaigns.flatMap(c => scoreRecommendation(c));

    // Filters
    if (market !== 'ALL') allRecs = allRecs.filter(r => r.market === market);
    if (type !== 'ALL')   allRecs = allRecs.filter(r => r.type === type);
    if (priority !== 'ALL') allRecs = allRecs.filter(r => r.priority === priority);

    // Sort: HIGH first, then by impact desc
    allRecs.sort((a, b) => {
      if (a.priority === 'HIGH' && b.priority !== 'HIGH') return -1;
      if (b.priority === 'HIGH' && a.priority !== 'HIGH') return 1;
      return (b.impact_eur || 0) - (a.impact_eur || 0);
    });

    res.json(allRecs);
  } catch (err) {
    console.error('Recommendations error:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

export default router;
