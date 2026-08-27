const deepseek = require('./deepseek');
const tavily = require('./tavily');

const all = [deepseek, tavily];
const map = Object.fromEntries(all.map(p => [p.slug, p]));

module.exports = {
  all,
  get: (slug) => map[slug] || null,
  types: () => all.map(p => ({
    slug: p.slug,
    name: p.name,
    color: p.color,
    website: p.website,
    rechargeUrl: p.rechargeUrl,
    keyHint: p.keyHint
  }))
};
