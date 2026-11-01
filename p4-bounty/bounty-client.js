/**
 * bounty-client.js — 三款出海小程序共用的悬赏改稿客户端助手（浏览器 ES module）
 *
 * 用法：
 *   import { createBounty } from './p4-bounty/bounty-client.js';
 *   const bounty = createBounty({ baseUrl: 'https://teleprompter-bounty.<sub>.workers.dev' });
 *
 *   // 1) 发布悬赏（托管积分；需余额充足）
 *   const { id } = await bounty.createBounty({ title: '帮我改这段口播稿', scriptText: '...', rewardCredits: 100 });
 *
 *   // 2) 浏览开放悬赏（公开；无需 initData）
 *   const { bounties } = await bounty.listBounties({ limit: 20 });
 *
 *   // 3) 投稿改写（自动带 initData 验签）
 *   await bounty.submitRevision({ bountyId: id, revisedText: '改写后的文稿' });
 *
 *   // 4) 发布者选定中标并释放奖励（仅 owner；幂等）
 *   await bounty.award({ bountyId: id, submissionId: subId });
 *
 *   // 5) 悬赏详情 + 投稿列表（公开）
 *   const detail = await bounty.getBounty({ bountyId: id });
 *
 * 自动从 Telegram.WebApp.initData 取身份随请求发送（Worker 端 HMAC 验签）。
 * 脱离 Telegram 环境时 initData 为空，需要验签的端点会 401；助手抛错但不崩，UI 按需降级。
 */

export function createBounty({ baseUrl, getInitData }) {
  if (!baseUrl) throw new Error('createBounty: baseUrl 必填');

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

  // 列表 / 详情为公开端点（无需 initData）
  async function publicGet(path) {
    const res = await fetch(baseUrl + path, { method: 'GET', headers: { 'content-type': 'application/json' } });
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
    /** 发布悬赏（平台托管 rewardCredits；余额不足抛 code='insufficient_funds'，HTTP 402） */
    createBounty({ title, scriptText, rewardCredits, deadline }) {
      return post('/bounty/create', { title, scriptText, rewardCredits, deadline });
    },
    /** 浏览开放悬赏（公开；limit 默认 20，offset 默认 0） */
    listBounties({ limit, offset } = {}) {
      const q = [];
      if (limit != null) q.push('limit=' + encodeURIComponent(String(limit)));
      if (offset != null) q.push('offset=' + encodeURIComponent(String(offset)));
      return publicGet('/bounty/list' + (q.length ? '?' + q.join('&') : ''));
    },
    /** 投稿改写（自动带 initData；owner 投稿会被拒 code='owner_cannot_submit'） */
    submitRevision({ bountyId, revisedText }) {
      return post('/bounty/submit', { bountyId, revisedText });
    },
    /** 发布者选定中标并释放奖励（仅 owner；幂等，重复 award 抛 code='already_awarded'） */
    award({ bountyId, submissionId }) {
      return post('/bounty/award', { bountyId, submissionId });
    },
    /** 悬赏详情 + 投稿列表（公开） */
    getBounty({ bountyId }) {
      return publicGet('/bounty/detail?bountyId=' + encodeURIComponent(bountyId));
    },
  };
}
