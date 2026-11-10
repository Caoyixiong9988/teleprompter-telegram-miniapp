/**
 * worker.js — 提词器 Telegram Mini App 单体后端（Monolith）
 *
 * 合并范围：P0 验签 + P2 统一积分 + P3 Stars 支付
 *           + P5 病毒增长 + P6 增强（台词云同步/远程控制/模板）
 *           + P7 合规（免责声明/举报）
 *
 * 2026-11-10：P4 悬赏改稿已下线（依据《产品宪法 · 所有 APP 共同底线》）。
 *   原因：双边市场 + UGC + 积分托管 + 需要人工裁决，与「单人可运维」冲突。
 *   运行时不再挂载 /bounty；p4-bounty/ 目录与单测仅作存档，不参与部署。
 *
 * 形态：Cloudflare Workers Modules 格式 + 单一 D1（teleprompter-credits）。
 *
 * 为什么合并为单体（直接回应"后续改动会 clash"的担忧）：
 *   - 原本 P0–P7 是 6+1 个独立 Worker，各带独立 wrangler.toml / schema.sql / URL；
 *     Telegram Mini App 只有一个后端 URL，未来任何鉴权/路由改动都要同步改 6 份，极易漂移冲突。
 *   - 现在：一个 Worker、一个 D1、一个 wrangler.toml、一个 schema.sql、一条后端 URL。
 *     路由按前缀分发给各模块 handler（每个模块逻辑完全保留，零重写），共享验签/账本集中在 shared/。
 *
 * 路由总览（全部挂在同一个 Worker 下）：
 *   /verify                 POST  initData 验签（P0，直接用 shared/verify.js，消除旧 worker.js 的重复实现）
 *   /credits/*              P2 统一积分账本
 *   /payments/*             P3 Telegram Stars 支付账本（+ /admin 运营对账）
 *   /growth/*               P5 病毒增长 / 推荐 / 排行榜 / 礼物
 *   /scripts/* /remote/* /templates  P6 增强（云同步 / 远程控制 / 模板库）
 *   /compliance/*           P7 免责声明 / 举报
 *
 * 部署：见根目录 wrangler.toml；secret：BOT_TOKEN、ADMIN_SECRET、WEBHOOK_SECRET；
 *       vars：BOT_USERNAME、APP_URL。单一 D1 = teleprompter-credits（建表见根 schema.sql）。
 */

import { verifyInitData } from './shared/verify.js';

import creditsHandler from './p2-credits/credits-worker.js';
import paymentsHandler from './p3-payments/payments-worker.js';
import growthHandler from './p5-growth/growth-worker.js';
import enhanceHandler from './p6-enhance/enhance-worker.js';
import complianceHandler from './p7-compliance/compliance-worker.js';

// 前缀 → 模块 handler（顺序无关，首个命中前缀即分发）
const ROUTES = [
  ['/credits', creditsHandler],
  ['/payments', paymentsHandler],
  ['/growth', growthHandler],
  ['/scripts', enhanceHandler],
  ['/remote', enhanceHandler],
  ['/templates', enhanceHandler],
  ['/compliance', complianceHandler],
];

// 全局 CORS 预检（各模块 handler 内部不再各自处理 OPTIONS，统一在此拦截）
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-telegram-bot-api-secret-token, x-admin-secret',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
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

// ── P0：/verify（集中复用 shared/verify.js，取代旧 worker.js 的重复验签实现）──
async function handleVerify(request, env) {
  if (request.method !== 'POST') {
    return json({ valid: false, reason: 'method_not_post' }, 405);
  }
  let initData;
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.indexOf('application/json') !== -1) {
      const body = await request.json();
      initData = body && body.initData;
    } else {
      const form = await request.formData();
      initData = form.get('initData');
    }
  } catch {
    return json({ valid: false, reason: 'bad_body' }, 400);
  }
  const result = await verifyInitData(initData, env.BOT_TOKEN);
  return json(result, 200);
}

// ── 单体 fetch 入口 ──
async function fetch(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1) 全局 CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 2) P0 验签端点（旧 P0 worker 的能力，现内建，避免多 Worker）
  if (path === '/verify') {
    return handleVerify(request, env);
  }

  // 3) 按前缀分发给各模块 handler（模块内部保留完整路由与 404 兜底）
  for (const [prefix, handler] of ROUTES) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      return handler.fetch(request, env, ctx);
    }
  }

  // 4) 健康检查 / 落地页
  if (path === '/' || path === '/health') {
    return json({
      service: 'teleprompter-monolith',
      status: 'ok',
      version: '0.1.0',
      modules: ['credits', 'payments', 'growth', 'enhance', 'compliance', 'verify'],
    });
  }

  return json({ error: 'not_found', path }, 404);
}

export default { fetch };
