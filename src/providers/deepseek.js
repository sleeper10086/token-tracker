const pricing = require('../pricing');

function modelPricing(model) {
  const m = pricing.deepseek.models;
  if (!model) return pricing.deepseek.defaultModel;
  const key = Object.keys(m).find(k => String(model).startsWith(k));
  return key ? m[key] : pricing.deepseek.defaultModel;
}

module.exports = {
  slug: 'deepseek',
  name: 'DeepSeek',
  color: '#4D6BFE',
  website: 'https://platform.deepseek.com',
  rechargeUrl: 'https://platform.deepseek.com/top_up',
  baseUrl: 'https://api.deepseek.com',
  keyHint: 'sk-...',

  masked: (k) => (k ? k.slice(0, 5) + '…' + k.slice(-4) : ''),

  async fetchStatus(apiKey) {
    const res = await fetch(this.baseUrl + '/user/balance', {
      headers: { Authorization: 'Bearer ' + apiKey }
    });
    if (res.status === 401) throw new Error('API Key 无效（401）');
    if (!res.ok) throw new Error('DeepSeek 返回 ' + res.status);
    const data = await res.json();
    const infos = data.balance_infos || [];
    const info = infos.find(b => b.currency === 'CNY') || infos[0] || null;
    return {
      balance: info ? parseFloat(info.total_balance) : null,
      currency: info ? info.currency : null,
      raw: data
    };
  },

  estimateCost({ model, usage }) {
    const u = usage || {};
    const hit = u.prompt_cache_hit_tokens || 0;
    const prompt = u.prompt_tokens ?? 0;
    const completion = u.completion_tokens ?? 0;
    const p = modelPricing(model);
    const miss = Math.max(0, prompt - hit);
    const cost = (miss * p.input + hit * p.cached_input + completion * p.output) / 1e6;
    return { prompt_tokens: prompt, completion_tokens: completion, cost_usd: cost };
  }
};
