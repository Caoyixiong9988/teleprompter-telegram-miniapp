/**
 * compliance-worker.js — P7 合规 Worker（Cloudflare Modules + D1）
 *
 * 复用：
 *   - p2-credits/verify.js ：initData 验签（举报可带 initData 标识举报人）
 *   - 同一 D1 库 teleprompter-credits（reports 表，见 schema.sql）
 *
 * 路由：
 *   GET  /compliance/disclaimer?lang=zh|en|ja|ko   返回四语免责声明（公开，供前端/爬虫）
 *   POST /compliance/report                        提交举报/反馈（可带 initData 匿名亦可）
 *
 * 合规：本 Worker 不提供任何预测/算命能力；免责声明与积分红线见 compliance-core.js。
 */

import { verifyInitData, getUserIdFromInitData } from '../p2-credits/verify.js';
import { getDisclaimerText, submitReport } from './compliance-core.js';

// ── D1 Store 适配器 ──
class D1ComplianceStore {
  constructor(db) {
    this.db = db;
  }
  async insertReport({ type, targetId, detail, userId, createdAt }) {
    const info = await this.db
      .prepare('INSERT INTO reports (type, target_id, detail, user_id, status, created_at) VALUES (?,?,?,?,?,?)')
      .bind(type, targetId, detail, userId, 'pending', createdAt)
      .run();
    return info.meta?.last_row_id ?? 0;
  }
}

// ── HTTP 工具 ──
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, x-telegram-bot-api-secret-token, x-admin-secret',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ── 端点 ──
async function handleDisclaimer(request, env) {
  const lang = new URL(request.url).searchParams.get('lang') || 'zh';
  return json(getDisclaimerText(lang));
}

async function handleReport(request, env) {
  if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
  const body = await readJson(request);

  // 举报人：若带合法 initData 则记录 userId，否则匿名（仍接受，降低举报门槛）
  let userId = null;
  if (body.initData && env.BOT_TOKEN) {
    const v = await verifyInitData(body.initData, env.BOT_TOKEN);
    if (v.valid) userId = getUserIdFromInitData(body.initData);
  }

  const store = new D1ComplianceStore(env.DB);
  const res = await submitReport(store, {
    type: body.type,
    targetId: body.targetId,
    detail: body.detail,
    userId,
  });
  if (!res.ok) return json({ error: res.reason }, 400);
  return json({ ok: true, id: res.id });
}

// ── 路由 ──
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, x-telegram-bot-api-secret-token, x-admin-secret',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      },
    });
  }

  if (path === '/compliance/disclaimer') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleDisclaimer(request, env);
  }

  if (path === '/compliance/report') {
    return handleReport(request, env);
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env);
  },
};
