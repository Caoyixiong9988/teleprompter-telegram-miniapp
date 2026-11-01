/**
 * templates-client.js — P6 台词模板库客户端助手（浏览器 ES module）
 *
 * 模板库为 PUBLIC 端点（无鉴权），返回中性口播框架，绝不含量身/预测文案。
 *
 * 用法：
 *   import { createTemplates, getTemplates } from './p6-enhance/templates-client.js';
 *   const tmpl = createTemplates({ baseUrl: 'https://teleprompter-enhance.<sub>.workers.dev' });
 *   const list = await tmpl.getTemplates();
 *   // 或：const list = await getTemplates('https://teleprompter-enhance.<sub>.workers.dev');
 */

export function createTemplates({ baseUrl }) {
  if (!baseUrl) throw new Error('createTemplates: baseUrl 必填');
  return {
    /** 拉取全部台词模板（中性口播框架） */
    async getTemplates() {
      const res = await fetch(baseUrl + '/templates', { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || ('http_' + res.status));
        err.status = res.status;
        throw err;
      }
      return data.templates ?? [];
    },
  };
}

/** 便捷函数：直接传入 baseUrl 拉取模板列表 */
export async function getTemplates(baseUrl) {
  return createTemplates({ baseUrl }).getTemplates();
}
