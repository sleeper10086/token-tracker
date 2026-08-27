const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const providers = require('../providers');
const { encrypt, decrypt } = require('../crypto');
const { requireAuth } = require('../auth');
const snapshots = require('../snapshots');

const router = express.Router();
router.use(requireAuth);

router.get('/types', (req, res) => res.json(providers.types()));

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, slug, label, endpoint_token, created_at FROM providers WHERE user_id = ?').all(req.user.id);
  res.json(rows.map(r => {
    const a = providers.get(r.slug);
    return { ...r, name: a ? a.name : r.slug, color: a ? a.color : '#888' };
  }));
});

router.post('/', (req, res) => {
  const slug = (req.body.slug || '').trim();
  const apiKey = (req.body.apiKey || '').trim();
  const label = (req.body.label || '').trim();
  const adapter = providers.get(slug);
  if (!adapter) return res.status(400).json({ error: '不支持的供应商' });
  if (!apiKey) return res.status(400).json({ error: '请填写 API Key' });
  const existing = db.prepare('SELECT id FROM providers WHERE user_id = ? AND slug = ?').get(req.user.id, slug);
  if (existing) return res.status(409).json({ error: '该供应商已添加，如需更换 Key 请先删除再添加' });
  const endpoint_token = 'pt_' + crypto.randomBytes(12).toString('hex');
  const info = db.prepare('INSERT INTO providers (user_id, slug, label, api_key_enc, endpoint_token) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, slug, label || adapter.name, encrypt(apiKey), endpoint_token);
  // 立即记一笔快照，作为用量曲线起点（不阻塞响应）
  const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(info.lastInsertRowid);
  snapshots.snapshotProvider(row).catch(() => {});
  res.json({ id: info.lastInsertRowid, endpoint_token });
});

router.delete('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: '不存在' });
  db.prepare('DELETE FROM providers WHERE id = ?').run(p.id);
  db.prepare('DELETE FROM usage_logs WHERE provider_id = ?').run(p.id);
  res.json({ ok: true });
});

router.post('/:id/refresh', async (req, res) => {
  const p = db.prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: '不存在' });
  const adapter = providers.get(p.slug);
  try {
    const apiKey = decrypt(p.api_key_enc);
    const status = await adapter.fetchStatus(apiKey);
    res.json({ ok: true, status });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;
