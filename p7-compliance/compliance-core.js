/**
 * compliance-core.js — P7 合规核心（纯逻辑，不依赖 Cloudflare）
 *
 * 职责：
 *   1) 免责声明三语文案（结构化，便于 /disclaimer 接口与前端分块展示）。
 *   2) 举报 / 反馈记录（submitReport，依赖 store 适配器）。
 *   3) 合规自检（complianceScan）：文案不得出现占卜 / 预测 / 算命类危险词
 *      —— 对应美国 App Store Guideline 1.4.1 红线，上线前 CI 可复用。
 *
 * 合规红线（凌驾一切）：不预测、不算命、不占卜；积分 ≠ Stars ≠ 法币；
 * 无 P2P 转账、无赌博。本模块不提供任何预测 / 算命能力。
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

/**
 * 合规自检：扫描文本是否含占卜 / 预测 / 算命类危险词（美国合规红线）。
 * @param {string} text
 * @returns {{safe:boolean, hits:string[]}}
 */
const FORBIDDEN = [
  '运势', '算命', '占卜', '预测', '占星', '塔罗', '八字', '风水', '吉凶', '黄历宜忌',
  'fortune', 'predict', 'horoscope', 'astrology', 'divination', 'tarot', 'lucky',
];
export function complianceScan(text) {
  const hits = [];
  const lower = String(text || '').toLowerCase();
  for (const w of FORBIDDEN) {
    if (lower.includes(w.toLowerCase())) hits.push(w);
  }
  return { safe: hits.length === 0, hits };
}
