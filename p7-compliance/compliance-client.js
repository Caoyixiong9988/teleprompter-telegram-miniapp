/**
 * compliance-client.js — 前端调用 P7 合规 Worker 的轻量封装
 *
 * 用法：
 *   const c = makeComplianceClient({ baseUrl, getInitData });
 *   const d = await c.getDisclaimer('en');      // 四语声明
 *   await c.submitReport({ type:'abuse', detail:'...' });
 */

export function makeComplianceClient({ baseUrl, getInitData } = {}) {
  const base = (baseUrl || '').replace(/\/+$/, '');
  return {
    /** 取某语言免责声明 */
    getDisclaimer: async (lang = 'zh') => {
      const r = await fetch(`${base}/compliance/disclaimer?lang=${encodeURIComponent(lang)}`);
      if (!r.ok) throw new Error('disclaimer_fetch_failed');
      return r.json();
    },
    /** 提交举报 / 反馈；可带 initData 标识举报人（匿名亦可） */
    submitReport: async ({ type, targetId, detail }) => {
      const initData = getInitData ? await getInitData() : '';
      const r = await fetch(`${base}/compliance/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, targetId, detail, initData }),
      });
      return r.json();
    },
  };
}
