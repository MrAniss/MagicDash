import express from 'express';
import { randomUUID } from 'crypto';
import db from '../database/db.js';
import { generateTranslations, regenerateSingle } from '../services/assetGenerator.js';

const router = express.Router();

// ── Groups ─────────────────────────────────────────────

router.get('/groups', (req, res) => {
  const { brand, campaign_type } = req.query;
  const conditions = [];
  const params     = [];
  if (brand)         { conditions.push('brand = ?');         params.push(brand); }
  if (campaign_type) { conditions.push('campaign_type = ?'); params.push(campaign_type); }

  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const groups = db.prepare(`SELECT * FROM asset_groups${where} ORDER BY created_at DESC`).all(...params);

  const result = groups.map(g => {
    const markets = db.prepare(`
      SELECT market, COUNT(*) as total, SUM(is_approved) as approved
      FROM assets WHERE group_id = ? GROUP BY market
    `).all(g.id);
    return { ...g, markets };
  });

  res.json(result);
});

router.get('/groups/:id', (req, res) => {
  const group = db.prepare('SELECT * FROM asset_groups WHERE id = ?').get(req.params.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const assets = db.prepare(
    'SELECT * FROM assets WHERE group_id = ? ORDER BY market, type, created_at'
  ).all(req.params.id);

  const byMarket = {};
  for (const a of assets) {
    if (!byMarket[a.market]) byMarket[a.market] = [];
    byMarket[a.market].push(a);
  }

  res.json({ ...group, assetsByMarket: byMarket });
});

router.post('/groups', (req, res) => {
  const { name, brand, campaign_type } = req.body;
  if (!name || !brand || !campaign_type)
    return res.status(400).json({ error: 'name, brand, campaign_type requis' });

  const id = randomUUID();
  db.prepare('INSERT INTO asset_groups (id, name, brand, campaign_type) VALUES (?, ?, ?, ?)').run(id, name, brand, campaign_type);
  res.status(201).json(db.prepare('SELECT * FROM asset_groups WHERE id = ?').get(id));
});

router.put('/groups/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name requis' });
  db.prepare('UPDATE asset_groups SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, req.params.id);
  res.json(db.prepare('SELECT * FROM asset_groups WHERE id = ?').get(req.params.id));
});

router.delete('/groups/:id', (req, res) => {
  db.prepare('DELETE FROM asset_groups WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Generate ───────────────────────────────────────────

router.post('/generate', async (req, res) => {
  const { group_id, base_assets, target_markets, brand, campaign_type } = req.body;
  if (!group_id || !base_assets?.length || !target_markets?.length)
    return res.status(400).json({ error: 'group_id, base_assets, target_markets requis' });

  try {
    const { generated, errors } = await generateTranslations({
      baseAssets:    base_assets,
      targetMarkets: target_markets,
      brand:         brand ?? 'Cocooncenter',
      campaignType:  campaign_type ?? 'RSA',
    });

    const deleteMarket = db.prepare('DELETE FROM assets WHERE group_id = ? AND market = ? AND is_base = 0');
    const insertAsset  = db.prepare(
      'INSERT INTO assets (id, group_id, market, language, type, content, char_count, is_base, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
    );

    const txn = db.transaction(() => {
      for (const m of generated) {
        deleteMarket.run(group_id, m.market);
        for (const a of m.assets) {
          insertAsset.run(randomUUID(), group_id, m.market, m.language, a.type, a.content, a.char_count, a.valid ? 'gemini' : 'gemini-invalid');
        }
      }
    });
    txn();

    res.json({ generated, errors });
  } catch (err) {
    console.error('Asset generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Export ─────────────────────────────────────────────

router.get('/export', (req, res) => {
  const { group_id, format, markets, types, approved_only } = req.query;
  if (!group_id) return res.status(400).json({ error: 'group_id requis' });

  let query  = 'SELECT * FROM assets WHERE group_id = ?';
  const params = [group_id];

  if (markets) {
    const list = markets.split(',');
    query += ` AND market IN (${list.map(() => '?').join(',')})`;
    params.push(...list);
  }
  if (types) {
    const list = types.split(',');
    query += ` AND type IN (${list.map(() => '?').join(',')})`;
    params.push(...list);
  }
  if (approved_only === 'true') query += ' AND is_approved = 1';
  query += ' ORDER BY market, type, created_at';

  const assets = db.prepare(query).all(...params);

  if (format === 'csv') {
    const BOM  = '\uFEFF';
    const rows = assets.map(a =>
      `${a.market};${a.language};${a.type};"${a.content.replace(/"/g, '""')}";${a.char_count};${a.is_approved ? 'Oui' : 'Non'}`
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assets-${group_id}.csv"`);
    return res.send(BOM + 'Marché;Langue;Type;Contenu;Caractères;Approuvé\n' + rows.join('\n'));
  }

  res.json(assets);
});

// ── Single asset CRUD ──────────────────────────────────

router.post('/', (req, res) => {
  const { group_id, market, language, type, content, is_base } = req.body;
  if (!group_id || !market || !type || !content)
    return res.status(400).json({ error: 'group_id, market, type, content requis' });

  const id = randomUUID();
  db.prepare(
    'INSERT INTO assets (id, group_id, market, language, type, content, char_count, is_base, generated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, group_id, market, language ?? 'fr', type, content, content.length, is_base ? 1 : 0, 'manual');

  res.status(201).json(db.prepare('SELECT * FROM assets WHERE id = ?').get(id));
});

router.put('/:id/approve', (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const newVal = asset.is_approved ? 0 : 1;
  db.prepare('UPDATE assets SET is_approved = ? WHERE id = ?').run(newVal, req.params.id);
  res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id));
});

router.post('/:id/regenerate', async (req, res) => {
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  // Get the FR base content for this type
  const baseAsset = db.prepare(
    'SELECT * FROM assets WHERE group_id = ? AND is_base = 1 AND type = ? LIMIT 1'
  ).get(asset.group_id, asset.type);

  try {
    const { content, char_count, valid } = await regenerateSingle({
      assetId:        asset.id,
      type:           asset.type,
      market:         asset.market,
      baseContent:    baseAsset?.content ?? asset.content,
      currentContent: asset.content,
    });

    db.prepare('UPDATE assets SET content = ?, char_count = ?, generated_by = ? WHERE id = ?')
      .run(content, char_count, valid ? 'gemini' : 'gemini-invalid', asset.id);

    res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(asset.id));
  } catch (err) {
    console.error('Regenerate error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content requis' });
  db.prepare('UPDATE assets SET content = ?, char_count = ? WHERE id = ?').run(content, content.length, req.params.id);
  res.json(db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
