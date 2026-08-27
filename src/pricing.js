// 价格表（美元 / 每 100 万 token，或每 credit）
// 仅供参考，实际以各供应商官网为准，可自行修改。
module.exports = {
  fx: { cnyToUsd: 7.2 },
  deepseek: {
    // input: 输入价格, output: 输出价格, cached_input: 缓存命中输入价格
    models: {
      'deepseek-chat': { input: 0.27, output: 1.10, cached_input: 0.07 },
      'deepseek-reasoner': { input: 0.55, output: 2.19, cached_input: 0.14 },
      'deepseek-coder': { input: 0.14, output: 0.28, cached_input: 0.07 }
    },
    defaultModel: { input: 0.27, output: 1.10, cached_input: 0.07 }
  },
  tavily: {
    usdPerCredit: 0.008,
    creditsPerCall: { search: 1, extract: 2, crawl: 1, map: 1, research: 3 }
  }
};
