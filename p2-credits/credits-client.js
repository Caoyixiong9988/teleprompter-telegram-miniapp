/**
 * credits-client.js — 三款出海小程序共用的积分客户端助手（浏览器 ES module）
 *
 * 用法（提词器 / 决策助手 / 表情包 任一前端）：
 *   import { createCredits } from './p2-credits/credits-client.js';
 *   const credits = createCredits({ baseUrl: 'https://teleprompter-credits.<sub>.workers.dev' });
 *   const { balance } = await credits.getBalance();
 *   await credits.consume({ amount: 100, reason: 'pro_unlock', refType: 'pro' });
 *
 * 它会自动从 Telegram.WebApp.initData 取身份并随请求发送（经 Worker 端 HMAC 验签）。
 * 脱离 Telegram 环境（纯浏览器自测）时，initData 为空，Worker 会返回 401；
 * 此时本助手抛出错误但**不崩**，UI 可按需降级（如隐藏积分入口）。
 */

export function createCredits({ baseUrl, getInitData }) {
  if (!baseUrl) throw new Error('createCredits: baseUrl 必填');

  async function post(path, payload) {
    const initData = typeof getInitData === 'function'
      ? getInitData()
      : (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
    const body = Object.assign({ initData }, payload);
    const res = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    if (!res.ok) {
      const err = new Error(data.error || ('http_' + res.status));
      err.status = res.status;
      err.code = data.error;
      throw err;
    }
    return data;
  }

  return {
    /** 查询当前用户积分余额 */
    getBalance() {
      return post('/credits/balance', {});
    },
    /** 查询流水 */
    getLedger(limit = 50) {
      return post('/credits/ledger', { limit });
    },
    /** 消耗积分兑换权益；余额不足抛 code='insufficient_funds' */
    consume({ amount, reason, refType, refId }) {
      return post('/credits/consume', { amount, reason, refType, refId });
    },
    /**
     * 平台发放积分（特权，需后端 ADMIN_SECRET）。前端一般不直接调，
     * 仅用于内部运营工具 / 服务端中继；此处保留以便测试。
     */
    grant({ adminSecret, userId, amount, reason, refType, refId }) {
      return fetch(baseUrl + '/credits/grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adminSecret, userId, amount, reason, refType, refId }),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { const e = new Error(data.error || 'http_' + res.status); e.status = res.status; e.code = data.error; throw e; }
        return data;
      });
    },
  };
}
