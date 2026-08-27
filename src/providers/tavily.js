const pricing = require('../pricing');

module.exports = {
  slug: 'tavily',
  name: 'Tavily',
  color: '#F59E0B',
  website: 'https://app.tavily.com',
  rechargeUrl: 'https://app.tavily.com/billing',
  baseUrl: 'https://api.tavily.com',
  keyHint: 'tvly-...',

  masked: (k) => (k ? k.slice(0, 8) + '…' + k.slice(-4) : ''),

  async fetchStatus(apiKey) {
    const res = await fetch(this.baseUrl + '/usage', {
      headers: { Authorization: 'Bearer ' + apiKey }
    });
    if (res.status === 401) throw new Error('API Key 无效（401）');
    if (!res.ok) throw new Error('Tavily 返回 ' + res.status);
    const data = await res.json();
    const key = data.key || {};
    const account = data.account || {};
    return {
      balance: null,
      currency: 'credits',
      creditsUsed: key.usage ?? null,
      creditsLimit: key.limit ?? null,
      plan: account.current_plan || null,
      raw: data
    };
  },

  // Tavily 按调用次数（credits）计费，不返回 token
  estimateCost({ endpoint }) {
    const credits = pricing.tavily.creditsPerCall[endpoint] || 1;
    return { prompt_tokens: 0, completion_tokens: 0, cost_usd: credits * pricing.tavily.usdPerCredit };
  }
};
