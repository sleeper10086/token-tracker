const db = require('./db');
const providers = require('./providers');
const { decrypt } = require('./crypto');

function localDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function proxyHandler(req, res) {
  try {
    const token = req.params.token;
    const prov = db.prepare('SELECT * FROM providers WHERE endpoint_token = ?').get(token);
    if (!prov) return res.status(404).json({ error: '未知的端点 token' });

    const adapter = providers.get(prov.slug);
    if (!adapter) return res.status(500).json({ error: '该供应商适配器不可用' });

    let apiKey;
    try { apiKey = decrypt(prov.api_key_enc); }
    catch (e) { return res.status(500).json({ error: 'API Key 解密失败' }); }

    const suffix = (req.params[0] || '').replace(/^\/+/, '');
    const qs = (req.originalUrl || '').includes('?')
      ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
      : '';
    const targetUrl = adapter.baseUrl + (suffix ? '/' + suffix : '') + qs;

    const headers = {};
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    if (req.headers['accept']) headers['accept'] = req.headers['accept'];
    if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent'];
    headers['authorization'] = 'Bearer ' + apiKey;
    for (const h of Object.keys(req.headers)) {
      if (/^x-/i.test(h) && h.toLowerCase() !== 'x-api-key') headers[h] = req.headers[h];
    }

    const body = req.body && req.body.length ? req.body : undefined;

    const upstream = await fetch(targetUrl, { method: req.method, headers, body, redirect: 'follow' });
    const buf = Buffer.from(await upstream.arrayBuffer());

    let usage = null;
    let model = null;
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('application/json') && buf.length) {
      try {
        const json = JSON.parse(buf.toString('utf8'));
        usage = json.usage || null;
        model = json.model || null;
      } catch (_) { /* 非 JSON，忽略 */ }
    }

    const endpoint = suffix ? suffix.split('/')[0] : 'unknown';
    const est = adapter.estimateCost({ endpoint, model, usage });

    db.prepare(`INSERT INTO usage_logs
      (user_id, provider_id, slug, day, ts, requests, prompt_tokens, completion_tokens, cost_usd, endpoint, model)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`)
      .run(prov.user_id, prov.id, prov.slug, localDay(new Date()), Date.now(),
        est.prompt_tokens, est.completion_tokens, est.cost_usd, endpoint, model);

    res.status(upstream.status);
    res.set('content-type', contentType || 'application/octet-stream');
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: '代理请求失败: ' + e.message });
  }
}

module.exports = { proxyHandler };
