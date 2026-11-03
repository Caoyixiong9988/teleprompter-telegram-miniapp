/**
 * compliance-core.js — P7 合规核心（纯逻辑，不依赖 Cloudflare）
 *
 * 职责：
 *   1) 免责声明五语文案（结构化，便于 /disclaimer 接口与前端分块展示）。
 *   2) 举报 / 反馈记录（submitReport，依赖 store 适配器）。
 *
 * 口径（对齐同类提词器产品的通行写法）：
 *   - 工具定位：只显示并滚动用户输入的文字，不替用户创作、发布或评价内容。
 *   - 内容归属：讲稿归用户所有；默认只存本机，我方不读取 / 不上传 / 不备份。
 *   - 自行备份：清除浏览器数据、卸载或换设备后可能无法恢复。
 *   - 按「现状」提供：不对录制效果或使用后果作保证。
 *   - 支付边界：Stars 由 Telegram 处理；积分 ≠ Stars ≠ 法币；无 P2P 转账、无赌博。
 */

import { UI_STRINGS, getLang } from './i18n.js';

/**
 * 取某语言完整免责声明文本（结构化）。
 * @param {string} lang
 * @returns {{lang:string,title:string,body:string,paidNotice:string,submitNotice:string}}
 */
export function getDisclaimerText(lang) {
  const l = getLang(lang);
  const s = UI_STRINGS[l] || UI_STRINGS.zh;
  return {
    lang: l,
    title: s.disclaimerTitle,
    body: s.disclaimerBody,
    paidNotice: s.paidNotice,
    submitNotice: s.submitNotice,
  };
}

/**
 * 记录一条举报 / 反馈（纯逻辑，依赖 store 适配器）。
 * @param store 需实现 insertReport({type,targetId,detail,userId,createdAt}) -> Promise<number(id)>
 * @param {{type?:string,targetId?:string,detail:string,userId?:string}} params
 * @returns {Promise<{ok:boolean,id?:number,reason?:string}>}
 */
export async function submitReport(store, { type, targetId, detail, userId }) {
  type = (type || 'feedback').toString().slice(0, 32);
  detail = (detail || '').toString().slice(0, 2000);
  userId = userId ? String(userId) : null;
  targetId = targetId ? String(targetId) : null;
  if (!detail.trim()) return { ok: false, reason: 'empty_detail' };
  const id = await store.insertReport({ type, targetId, detail, userId, createdAt: Date.now() });
  return { ok: true, id };
}
