const express = require('express');
const db = require('../db');
const providers = require('../providers');
const pricing = require('../pricing');
const { decrypt } = require('../crypto');
const { requireAuth } = require('../auth');
const { recordSnapshot } = require('../snapshots');

const router = express.Router();
router.use(requireAuth);

// 状态缓存，避免频繁调用供应商官方接口触发限流
const statusCache = new Map(); // providerId -> { ts, data }
const STATUS_TTL = 5 * 60 * 1000; // 5 分钟

function localDay(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function daysAgoList(n) {
  const list = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    list.push(localDay(d));
  }
  return list;
}
function dayOf(ts) {
  return localDay(new Date(ts));
}

// 把"余额/用量差额"换算成美元，用于跨供应商统一对比
function toUsd(slug, currency, native) {
  if (slug === 'deepseek') return currency === 'USD' ? native : native / pricing.fx.cnyToUsd;
  if (slug === 'tavily') return native * pricing.tavily.usdPerCredit;
  return native;
}

// 由快照序列计算每日花费（原生单位）
function dailySpendFromSnapshots(snaps, slug) {
  const byDay = {};
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1], cur = snaps[i];
    const d = dayOf(cur.ts);
    let delta = 0;
    if (slug === 'deepseek') {
      delta = Math.max(0, (prev.balance ?? 0) - (cur.balance ?? 0)); // 余额下降 = 花费
    } else if (slug === 'tavily') {
      delta = Math.max(0, (cur.credits_used ?? 0) - (prev.credits_used ?? 0)); // credits 上升 = 用量
    }
    if (delta > 0) byDay[d] = (byDay[d] || 0) + delta;
  }
  return byDay;
}

router.get('/', async (req, res) => {
  const userId = req.user.id;
  const provs = db.prepare('SELECT * FROM providers WHERE user_id = ?').all(userId);
  const last30 = daysAgoList(30);
  const monthStart = localDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const sinceTs = Date.now() - 30 * 24 * 3600 * 1000;

  const result = [];

  for (const p of provs) {
    const adapter = providers.get(p.slug);

    // ---- 中转记录：token / 请求 ----
    const proxyTotals = db.prepare(`SELECT COALESCE(SUM(cost_usd),0) AS cost,
        COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens,
        COALESCE(SUM(requests),0) AS requests
        FROM usage_logs WHERE user_id = ? AND provider_id = ? AND day >= ?`)
      .get(userId, p.id, monthStart);
    const proxyDaily = db.prepare(`SELECT day,
        COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens,
        COALESCE(SUM(requests),0) AS requests
        FROM usage_logs WHERE user_id = ? AND provider_id = ? AND day >= ? GROUP BY day`)
      .all(userId, p.id, last30[0]);
    const proxyDailyMap = Object.fromEntries(proxyDaily.map(r => [r.day, r]));

    // ---- 余额快照：金额曲线 ----
    const snaps = db.prepare(`SELECT ts, balance, currency, credits_used FROM balance_snapshots
        WHERE user_id = ? AND provider_id = ? AND ts >= ? ORDER BY ts ASC`)
      .all(userId, p.id, sinceTs);
    const snapCount = snaps.length;
    const snapDailyNative = dailySpendFromSnapshots(snaps, p.slug);
    const currency = snaps.length ? snaps[snaps.length - 1].currency : null;

    // ---- 官方实时状态（带缓存，同时记录快照）----
    let status = null, statusError = null;
    const cached = statusCache.get(p.id);
    if (cached && Date.now() - cached.ts < STATUS_TTL) {
      status = cached.data;
    } else {
      try {
        const apiKey = decrypt(p.api_key_enc);
        status = await adapter.fetchStatus(apiKey);
        statusCache.set(p.id, { ts: Date.now(), data: status });
        recordSnapshot(p, status);
      } catch (e) { statusError = e.message; }
    }

    const daily = last30.map(day => ({
      day,
      costUsd: Math.round(toUsd(p.slug, currency, snapDailyNative[day] || 0) * 1e6) / 1e6,
      tokens: proxyDailyMap[day] ? proxyDailyMap[day].tokens : 0,
      requests: proxyDailyMap[day] ? proxyDailyMap[day].requests : 0
    }));

    const monthCost = daily
      .filter(d => d.day >= monthStart)
      .reduce((s, d) => s + d.costUsd, 0);

    result.push({
      id: p.id, slug: p.slug, label: p.label,
      name: adapter.name, color: adapter.color,
      website: adapter.website, rechargeUrl: adapter.rechargeUrl,
      endpoint_token: p.endpoint_token,
      status, statusError,
      snapshotCount: snapCount,
      totals: {
        costUsd: monthCost,
        tokens: proxyTotals.tokens,
        requests: proxyTotals.requests
      },
      daily
    });
  }

  const totalCost = result.reduce((s, p) => s + p.totals.costUsd, 0);
  const monthly = result.map(p => ({
    slug: p.slug, name: p.name, color: p.color,
    costUsd: p.totals.costUsd,
    tokens: p.totals.tokens,
    requests: p.totals.requests,
    share: totalCost > 0 ? p.totals.costUsd / totalCost : 0
  }));

  res.json({ providers: result, monthly, totalCost });
});

module.exports = router;
