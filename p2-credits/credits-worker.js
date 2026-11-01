/**
 * credits-worker.js — P2 统一积分账本（Cloudflare Worker, Modules 格式 + D1）
 *
 * 三款出海小程序（提词器 / 决策助手 / 表情包）共用的"真·全共用"后端。
 * 靠 Telegram user_id（跨 bot 恒定）打通跨 App 积分。
 *
 * 暴露端点（均 POST，JSON）：
 *   /credits/balance   { initData }                                   → { balance }
 *   /credits/ledger    { initData, limit? }                           → { ledger:[...] }
 *   /credits/consume   { initData, amount, reason?, refType?, refId? } → { balance }（余额不足 402）
 *   /credits/grant     { adminSecret, userId, amount, reason?, ... }   → { balance }（需 ADMIN_SECRET）
 *
 * 合规：内部积分 ≠ Stars/法币、不可提现、不可 P2P 转账、不可赌博。
 *       本 Worker 刻意不提供 transfer 端点。
 *
 * 部署见 wrangler.toml；secret：BOT_TOKEN、ADMIN_SECRET。
 */

import { verifyInitData, getUserIdFromInitData } from './verify.js';
import { grant, consume, getBalance, getLedger } from './ledger-core.js';

// ── D1 Store 适配器（实现 ledger-core 的 Store 接口）──────────
class D1Store {
  constructor(db) {
    this.db = db;
  }
  async ensureUser(userId) {
    const now = Date.now();
    await this.db
      .prepare('INSERT OR IGNORE INTO users_credits (user_id, balance, created_at, updated_at) VALUES (?,0,?,?)')
      .bind(userId, now, now)
      .run();
  }
  async getBalance(userId) {
    const row = await this.db
      .prepare('SELECT balance FROM users_credits WHERE user_id = ?')
      .bind(userId)
      .first();
    return row ? row.balance : 0;
  }
  // 原子调整：余额 + delta；若结果 < 0 整笔拒绝。用 SQL 条件保证并发安全。
  async atomicAdjust(userId, delta) {
    const now = Date.now();
    const info = await this.db
      .prepare(
        'UPDATE users_credits SET balance = balance + ?, updated_at = ? WHERE user_id = ? AND balance + ? >= 0'
      )
      .bind(delta, now, userId, delta)
      .run();
    return (info.meta?.changes ?? 0) > 0;
  }
  async recordLedger({ userId, delta, reason, refType, refId }) {
    const now = Date.now();
    await this.db
      .prepare(
        'INSERT INTO credits_ledger (user_id, delta, reason, ref_type, ref_id, created_at) VALUES (?,?,?,?,?,?)'
      )
      .bind(userId, delta, reason, refType ?? null, refId ?? null, now)
      .run();
  }
  async getLedger(userId, limit = 50) {
    const rows = await this.db
      .prepare(
        'SELECT id, user_id, delta, reason, ref_type, ref_id, created_at FROM credits_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?'
      )
      .bind(userId, limit)
      .all();
    return rows.results ?? [];
  }
}

// ── 工具 ────────────────────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
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

// 验签并取出 user_id；失败返回 { error, status, userId:null }
async function authUser(initData, env) {
  const v = await verifyInitData(initData, env.BOT_TOKEN);
  if (!v.valid) return { ok: false, status: 401, error: v.reason };
  const userId = getUserIdFromInitData(initData);
  if (!userId) return { ok: false, status: 401, error: 'no_user_id' };
  return { ok: true, userId };
}

// ── 路由 ────────────────────────────────────────────────────
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
      },
    });
  }
  if (path !== '/credits/balance' && path !== '/credits/ledger' &&
      path !== '/credits/consume' && path !== '/credits/grant') {
    return json({ error: 'not_found' }, 404);
  }
  if (request.method !== 'POST') {
    return json({ error: 'method_not_post' }, 405);
  }

  const body = await readJson(request);
  const store = new D1Store(env.DB);

  try {
    if (path === '/credits/balance') {
      const a = await authUser(body.initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const balance = await getBalance(store, { userId: a.userId });
      return json({ balance });

    } else if (path === '/credits/ledger') {
      const a = await authUser(body.initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const ledger = await getLedger(store, { userId: a.userId, limit: body.limit || 50 });
      return json({ ledger });

    } else if (path === '/credits/consume') {
      const a = await authUser(body.initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const amount = parseInt(body.amount, 10);
      const balance = await consume(store, {
        userId: a.userId,
        amount,
        reason: body.reason || 'consume',
        refType: body.refType || null,
        refId: body.refId || null,
      });
      return json({ balance });

    } else if (path === '/credits/grant') {
      // 发放是特权操作：必须带正确的 ADMIN_SECRET（不依赖 initData）
      if (!env.ADMIN_SECRET || body.adminSecret !== env.ADMIN_SECRET) {
        return json({ error: 'forbidden' }, 403);
      }
      const userId = String(body.userId);
      if (!userId) return json({ error: 'missing_user_id' }, 400);
      const amount = parseInt(body.amount, 10);
      const balance = await grant(store, {
        userId,
        amount,
        reason: body.reason || 'grant',
        refType: body.refType || null,
        refId: body.refId || null,
      });
      return json({ balance });
    }
  } catch (e) {
    if (e.code === 'INSUFFICIENT_FUNDS') return json({ error: 'insufficient_funds' }, 402);
    if (e.code === 'INVALID_AMOUNT') return json({ error: 'invalid_amount' }, 400);
    return json({ error: 'internal', detail: String(e && e.message) }, 500);
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env);
  },
};
