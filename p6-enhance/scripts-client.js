/**
 * scripts-client.js — P6 台词云端同步客户端助手（浏览器 ES module）
 *
 * 用法：
 *   import { createScripts } from './p6-enhance/scripts-client.js';
 *   const scripts = createScripts({ baseUrl: 'https://teleprompter-enhance.<sub>.workers.dev' });
 *   const { scripts } = await scripts.list();
 *   const { script }   = await scripts.save({ title: '我的口播稿', content: '...' });
 *   const { script }   = await scripts.save({ id: 12, title: '改过的稿', content: '...' }); // upsert
 *   await scripts.remove({ id: 12 });
 *
 * 自动从 Telegram.WebApp.initData 取身份随请求发送（Worker 端 HMAC 验签）。
 * 脱离 Telegram 环境时 initData 为空，端点会 401；助手抛错但不崩，UI 按需降级（如提示登录）。
 */

export function createScripts({ baseUrl, getInitData }) {
  if (!baseUrl) throw new Error('createScripts: baseUrl 必填');

  function currentInitData() {
    if (typeof getInitData === 'function') return getInitData();
    return (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
  }

  async function authed(method, path, payload) {
    const initData = currentInitData();
    let url = baseUrl + path;
    let body;
    if (method === 'GET' || method === 'DELETE') {
      url += (url.includes('?') ? '&' : '?') + 'initData=' + encodeURIComponent(initData);
      body = undefined;
    } else {
      body = JSON.stringify(Object.assign({ initData }, payload));
    }
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body,
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
    /** 列出当前用户全部台词（按 updated_at 倒序） */
    list() {
      return authed('GET', '/scripts');
    },
    /** 保存：传 id 即 upsert（更新已有），不传 id 即新增 */
    save({ id, title, content }) {
      return authed('POST', '/scripts', { id, title, content });
    },
    /** 删除（仅本人所有） */
    remove({ id }) {
      return authed('DELETE', '/scripts', { id });
    },
  };
}
