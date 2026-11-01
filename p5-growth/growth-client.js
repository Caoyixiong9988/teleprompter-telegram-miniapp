/**
 * growth-client.js — 三款出海小程序共用的病毒增长客户端助手（浏览器 ES module）
 *
 * 用法：
 *   import { createGrowth } from './p5-growth/growth-client.js';
 *   const growth = createGrowth({ baseUrl: 'https://teleprompter-growth.<sub>.workers.dev' });
 *
 *   // 1) 打开带 ?start=CODE 的链接时归因（首次调用会铸造本用户专属码）
 *   const { referralCode, referrerUserId, attributed } = await growth.attributeReferral({ referralCode });
 *
 *   // 2) 排行榜（公开端点；可传 group 限定群内）
 *   const { leaderboard } = await growth.getLeaderboard({ group: 'G123', limit: 10 });
 *
 *   // 3) 平台中介的积分礼物（consume+grant，非钱包互转；余额不足抛 code='insufficient_funds'）
 *   await growth.sendGift({ toUserId: '987654', amount: 20, reason: 'nice_work' });
 *
 *   // 4) 分享载荷（深链 + 卡片数据；实际 Canvas 渲染在 index.html 完成）
 *   const payload = await growth.getSharePayload();
 *
 * 自动从 Telegram.WebApp.initData 取身份随请求发送（Worker 端 HMAC 验签）。
 * 脱离 Telegram 环境时 initData 为空，相关端点会 401；助手抛错但不崩，UI 按需降级。
 */

export function createGrowth({ baseUrl, getInitData }) {
  if (!baseUrl) throw new Error('createGrowth: baseUrl 必填');

  function currentInitData() {
    if (typeof getInitData === 'function') return getInitData();
    return (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
  }

  async function post(path, payload) {
    const initData = currentInitData();
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

  async function authedGet(path) {
    const initData = currentInitData();
    const sep = path.includes('?') ? '&' : '?';
    const url = baseUrl + path + sep + 'initData=' + encodeURIComponent(initData);
    const res = await fetch(url, { method: 'GET', headers: { 'content-type': 'application/json' } });
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
    /** 归因推荐关系 + 铸造本用户专属码（首次调用）；referralCode 可空 */
    attributeReferral({ referralCode } = {}) {
      return post('/growth/referral', { referralCode });
    },
    /** 排行榜（公开端点）；group 可选限定群内；limit 默认 20 */
    getLeaderboard({ group = null, limit = 20 } = {}) {
      const params = new URLSearchParams();
      if (group) params.set('group', group);
      params.set('limit', String(limit));
      return fetch(baseUrl + '/growth/leaderboard?' + params.toString(), {
        method: 'GET',
        headers: { 'content-type': 'application/json' },
      }).then(async (r) => {
        let d = {};
        try { d = await r.json(); } catch { /* ignore */ }
        return d;
      });
    },
    /** 平台中介的积分礼物（consume+grant，非钱包互转；余额不足抛 code='insufficient_funds'） */
    sendGift({ toUserId, amount, reason = 'gift' }) {
      return post('/growth/gift', { toUserId, amount, reason });
    },
    /** 分享载荷（深链 + 卡片数据；Canvas 渲染在 index.html） */
    getSharePayload() {
      return authedGet('/growth/share');
    },
  };
}
