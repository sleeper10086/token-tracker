const db = require('./db');
const providers = require('./providers');
const { decrypt } = require('./crypto');

const POLL_MS = Number(process.env.POLL_MS) || 15 * 60 * 1000; // 默认 15 分钟

function localDay(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// 把一次官方查询结果记为一条快照
function recordSnapshot(p, status) {
  if (!status) return;
  const balance = (status.balance != null) ? status.balance : null;
  const creditsUsed = (status.creditsUsed != null) ? status.creditsUsed : null;
  const creditsLimit = (status.creditsLimit != null) ? status.creditsLimit : null;
  db.prepare(`INSERT INTO balance_snapshots
    (user_id, provider_id, slug, ts, day, balance, currency, credits_used, credits_limit, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(p.user_id, p.id, p.slug, Date.now(), localDay(new Date()),
      balance, status.currency || null, creditsUsed, creditsLimit, JSON.stringify(status.raw || null));
}

// 查询单个供应商并记录快照（用于添加后立即记一笔）
async function snapshotProvider(p) {
  const adapter = providers.get(p.slug);
  if (!adapter) return;
  try {
    const apiKey = decrypt(p.api_key_enc);
    const status = await adapter.fetchStatus(apiKey);
    recordSnapshot(p, status);
    return status;
  } catch (_) { return null; }
}

// 轮询所有供应商
async function snapshotAll() {
  const provs = db.prepare('SELECT * FROM providers').all();
  for (const p of provs) {
    await snapshotProvider(p).catch(() => {});
  }
}

function start() {
  snapshotAll().catch(() => {});
  setInterval(() => snapshotAll().catch(() => {}), POLL_MS);
}

module.exports = { recordSnapshot, snapshotProvider, snapshotAll, start };
