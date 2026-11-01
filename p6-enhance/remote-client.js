/**
 * remote-client.js — P6 双设备远程控制客户端助手（浏览器 ES module）
 *
 * Telegram Mini App WebView 内不可用蓝牙 HID，故用"Telegram 中转 token"实现双设备遥控：
 *   手机 A（播放端）创建会话拿到 sessionToken → 经 Telegram 聊天把 token 发给手机 B（控制端）
 *   → B 用 token 发 play/pause/speed 指令 → A 轮询 getState 取最新指令驱动滚动。
 *
 * 用法：
 *   import { createRemote } from './p6-enhance/remote-client.js';
 *   const remote = createRemote({ baseUrl: 'https://teleprompter-enhance.<sub>.workers.dev' });
 *   const { sessionToken } = await remote.createSession();      // A 创建（需 initData 验签）
 *   await remote.sendCommand(token, 'pause');                   // B 控制
 *   await remote.sendCommand(token, 'speed', 1.5);
 *   const { command } = await remote.getState(token);           // A 轮询
 */

export function createRemote({ baseUrl }) {
  if (!baseUrl) throw new Error('createRemote: baseUrl 必填');

  function defaultInitData() {
    return (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
  }

  async function req(method, path, payload) {
    const url = baseUrl + path;
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
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
    /** 播放端创建会话（需 initData 验签）；initData 可显式传入，否则读 Telegram.WebApp */
    createSession(initData) {
      const body = {
        initData: initData || defaultInitData(),
      };
      return req('POST', '/remote/create', body);
    },
    /** 控制端发指令：cmd ∈ play|pause|speed；speed 时 value 为倍率数值 */
    sendCommand(token, cmd, value) {
      return req('POST', '/remote/command?token=' + encodeURIComponent(token), { cmd, value });
    },
    /** 播放端轮询最新指令 */
    getState(token) {
      return req('GET', '/remote/state?token=' + encodeURIComponent(token));
    },
  };
}
