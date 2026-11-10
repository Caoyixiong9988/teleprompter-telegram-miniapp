/**
 * payments-client.js — 三款出海小程序共用的 Stars 支付客户端助手（浏览器 ES module）
 *
 * 用法：
 *   import { createPayments } from './p3-payments/payments-client.js';
 *   const pay = createPayments({ baseUrl: 'https://teleprompter-payments.<sub>.workers.dev' });
 *
 *   // 1) 取发票链接 → 用 Telegram.WebApp.openInvoice 拉起官方支付
 *   const { invoiceLink, productId, stars } = await pay.createInvoice({ productId: 'pro_month' });
 *   Telegram.WebApp.openInvoice(invoiceLink, (ok) => { if (ok) refreshBalance(); });
 *
 *   // 2) 查自己的 Stars 支付历史
 *   const { history } = await pay.getHistory();
 *
 * 自动从 Telegram.WebApp.initData 取身份随请求发送（Worker 端 HMAC 验签）。
 * 脱离 Telegram 环境时 initData 为空，相关端点会 401；助手抛错但不崩，UI 按需降级。
 */

export function createPayments({ baseUrl, getInitData }) {
  if (!baseUrl) throw new Error('createPayments: baseUrl 必填');

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
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'content-type': 'application/json' },
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
    /** 创建 Stars 发票链接。升级 Pro 必须用 pro_month|pro_year；credits_* 是积分包，买了不会解锁 Pro */
    createInvoice({ productId }) {
      return post('/payments/invoice', { productId });
    },
    /** 查询当前用户的 Stars 支付历史 */
    getHistory() {
      return authedGet('/payments/history');
    },
  };
}
