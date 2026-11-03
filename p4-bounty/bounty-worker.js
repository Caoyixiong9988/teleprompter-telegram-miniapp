/**
 * bounty-worker.js — P4 悬赏改稿（Cloudflare Worker, Modules 格式 + D1）
 *
 * 复用：
 *   - shared/verify.js          ：initData HMAC 验签
 *   - shared/ledger-core.js     ：积分托管/发放语义（consume / grant）
 *   - ./bounty-core.js          ：纯逻辑（托管 / 投稿 / 释放奖励 / 幂等）
 *   - 同一 D1 库 teleprompter-credits（P2 统一积分总账），使 escrow 托管与积分发放同库。
 *
 * 路由：
 *   POST /bounty/create         经 initData 验签；托管 reward 并创建悬赏
 *   GET  /bounty/list           公开；列出 open 悬赏（分页）
 *   POST /bounty/submit         经 initData 验签；投稿（author 不可为 owner）
 *   POST /bounty/award          经 initData 验签 + 必须 owner；释放奖励（幂等）
 *   GET  /bounty/detail         公开；详情 + 投稿列表
 *   GET  /bounty/verify         ADMIN_SECRET 门禁；运营对账
 *
 * 合规：奖励全程平台托管（escrow）→ 仅 award 释放给中标者；绝不 P2P 转账 / 赌博。
 *
 * secret（占位，部署时填）：BOT_TOKEN、ADMIN_SECRET
 */

import { verifyInitData, getUserIdFromInitData } from '../shared/verify.js';
import { grant, consume, getBalance } from '../shared/ledger-core.js';
import { createBounty, listOpenBounties, submitRevision, awardBounty, getBounty } from './bounty-core.js';

// ── D1 Store 适配器（同时实现 bounty-core 与 ledger-core 的 Store 接口）──
class D1BountyStore {
  constructor(db) { this.db = db; }

  // ── ledger-core 接口（供 grant/consume 使用）──────────────
  async ensureUser(userId) {
    const now = Date.now();
    await this.db.prepare('INSERT OR IGNORE INTO users_credits (user_id, balance, created_at, updated_at) VALUES (?,0,?,?)').bind(userId, now, now).run();
  }
  async getBalance(userId) {
    const row = await this.db.prepare('SELECT balance FROM users_credits WHERE user_id = ?').bind(userId).first();
    return row ? row.balance : 0;
  }
  async atomicAdjust(userId, delta) {
    const now = Date.now();
    const info = await this.db.prepare('UPDATE users_credits SET balance = balance + ?, updated_at = ? WHERE user_id = ? AND balance + ? >= 0').bind(delta, now, userId, delta).run();
    return (info.meta?.changes ?? 0) > 0;
  }
  async recordLedger({ userId, delta, reason, refType, refId }) {
    const now = Date.now();
    await this.db.prepare('INSERT INTO credits_ledger (user_id, delta, reason, ref_type, ref_id, created_at) VALUES (?,?,?,?,?,?)').bind(userId, delta, reason, refType ?? null, refId ?? null, now).run();
  }
  async getLedger(userId, limit = 50) {
    const rows = await this.db.prepare('SELECT id, user_id, delta, reason, ref_type, ref_id, created_at FROM credits_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').bind(userId, limit).all();
    return rows.results ?? [];
  }

  // ── bounty 接口 ──────────────────────────────────────────
  async insertBounty({ ownerUserId, title, scriptText, rewardCredits, deadline }) {
    const id = (globalThis.crypto?.randomUUID?.()) || ('B' + Date.now() + '_' + Math.random().toString(16).slice(2));
    const now = Date.now();
    await this.db.prepare(
      'INSERT INTO bounties (id, owner_user_id, title, script_text, reward_credits, status, created_at, deadline) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(id, ownerUserId, title, scriptText, rewardCredits, 'open', now, deadline ?? null).run();
    return id;
  }
  async getBounty(bountyId) {
    return this.db.prepare(
      'SELECT id, owner_user_id, title, script_text, reward_credits, status, created_at, deadline FROM bounties WHERE id = ?'
    ).bind(bountyId).first();
  }
  async listOpenBounties({ limit, offset }) {
    const rows = await this.db.prepare(
      "SELECT id, owner_user_id, title, script_text, reward_credits, status, created_at, deadline FROM bounties WHERE status = 'open' ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).bind(limit, offset).all();
    return rows.results ?? [];
  }
  async insertSubmission({ bountyId, authorUserId, revisedText }) {
    const now = Date.now();
    const info = await this.db.prepare(
      "INSERT INTO bounty_submissions (bounty_id, author_user_id, revised_text, status, created_at) VALUES (?,?,?,?,?)"
    ).bind(bountyId, authorUserId, revisedText, 'pending', now).run();
    return info.meta?.lastRowId ?? info.meta?.changes ?? null;
  }
  async getSubmission(submissionId) {
    return this.db.prepare(
      'SELECT id, bounty_id, author_user_id, revised_text, status, created_at FROM bounty_submissions WHERE id = ?'
    ).bind(submissionId).first();
  }
  async listSubmissions(bountyId) {
    const rows = await this.db.prepare(
      'SELECT id, bounty_id, author_user_id, revised_text, status, created_at FROM bounty_submissions WHERE bounty_id = ? ORDER BY created_at ASC'
    ).bind(bountyId).all();
    return rows.results ?? [];
  }
  async markAwarded({ bountyId, submissionId, winnerUserId }) {
    await this.db.prepare("UPDATE bounty_submissions SET status = 'accepted' WHERE id = ? AND bounty_id = ?").bind(submissionId, bountyId).run();
    await this.db.prepare("UPDATE bounty_submissions SET status = 'rejected' WHERE bounty_id = ? AND id <> ?").bind(bountyId, submissionId).run();
  }
  async setBountyStatus(bountyId, status) {
    await this.db.prepare('UPDATE bounties SET status = ? WHERE id = ?').bind(status, bountyId).run();
  }
}

// ── HTTP 工具 ──────────────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, x-admin-secret',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  });
}
async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

// 验签并取 user_id（复用 P2 verify.js）
async function authUser(initData, env) {
  const v = await verifyInitData(initData, env.BOT_TOKEN);
  if (!v.valid) return { ok: false, status: 401, error: v.reason };
  const userId = getUserIdFromInitData(initData);
  if (!userId) return { ok: false, status: 401, error: 'no_user_id' };
  return { ok: true, userId };
}

// 业务异常码 → HTTP 状态
function statusForCode(code) {
  switch (code) {
    case 'INSUFFICIENT_FUNDS': return 402;
    case 'INVALID_AMOUNT': return 400;
    case 'MISSING_FIELDS': return 400;
    case 'INVALID_OWNER': return 400;
    case 'INVALID_AUTHOR': return 400;
    case 'NOT_FOUND': return 404;
    case 'BOUNTY_CLOSED': return 409;
    case 'OWNER_CANNOT_SUBMIT': return 403;
    case 'FORBIDDEN': return 403;
    case 'ALREADY_AWARDED': return 409;
    case 'BAD_SUBMISSION': return 400;
    default: return 500;
  }
}

// ── 各端点 ─────────────────────────────────────────────────
async function handleCreate(body, env) {
  const a = await authUser(body.initData, env);
  if (!a.ok) return json({ error: a.error }, a.status);
  const store = new D1BountyStore(env.DB);
  try {
    const r = await createBounty(store, {
      ownerUserId: a.userId, title: body.title, scriptText: body.scriptText,
      rewardCredits: body.rewardCredits, deadline: body.deadline ?? null,
    });
    return json({ id: r.id, status: 'open' });
  } catch (e) {
    return json({ error: e.code || 'internal', detail: String(e && e.message) }, statusForCode(e.code));
  }
}

async function handleList(url, env) {
  const limit = parseInt(url.searchParams.get('limit') || '20', 10) || 20;
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
  const store = new D1BountyStore(env.DB);
  const list = await listOpenBounties(store, { limit, offset });
  return json({ bounties: list });
}

async function handleSubmit(body, env) {
  const a = await authUser(body.initData, env);
 if (!a.ok) return json({ error: a.error }, a.status);
  const store = new D1BountyStore(env.DB);
  try {
    const r = await submitRevision(store, { bountyId: body.bountyId, authorUserId: a.userId, revisedText: body.revisedText });
    return json({ id: r.id, status: 'pending' });
  } catch (e) {
    return json({ error: e.code || 'internal' }, statusForCode(e.code));
  }
}

async function handleAward(body, env) {
  const a = await authUser(body.initData, env);
  if (!a.ok) return json({ error: a.error }, a.status);
  const store = new D1BountyStore(env.DB);
  try {
    const r = await awardBounty(store, { bountyId: body.bountyId, submissionId: body.submissionId, ownerUserId: a.userId });
    return json({ ok: true, winnerUserId: r.winnerUserId, reward: r.reward });
  } catch (e) {
    return json({ error: e.code || 'internal' }, statusForCode(e.code));
  }
}

async function handleDetail(url, env) {
  const bountyId = url.searchParams.get('bountyId');
  const store = new D1BountyStore(env.DB);
  const detail = await getBounty(store, { bountyId });
  if (!detail) return json({ error: 'not_found' }, 404);
  return json(detail);
}

async function handleVerify(request, env) {
  const provided = request.headers.get('x-admin-secret') || new URL(request.url).searchParams.get('adminSecret');
  if (!env.ADMIN_SECRET || provided !== env.ADMIN_SECRET) return json({ error: 'forbidden' }, 403);
  const store = new D1BountyStore(env.DB);
  let openCount = 0, closedCount = 0;
  try {
    const o = await store.db.prepare("SELECT COUNT(*) AS c FROM bounties WHERE status = 'open'").first();
    const c = await store.db.prepare("SELECT COUNT(*) AS c FROM bounties WHERE status = 'closed'").first();
    openCount = o ? o.c : 0; closedCount = c ? c.c : 0;
  } catch { /* 表未初始化等 */ }
  return json({ ok: true, openCount, closedCount });
}

// ── 路由 ───────────────────────────────────────────────────
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, x-admin-secret',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      },
    });
  }

  if (path === '/bounty/create') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    return handleCreate(await readJson(request), env);
  }
  if (path === '/bounty/list') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleList(url, env);
  }
  if (path === '/bounty/submit') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    return handleSubmit(await readJson(request), env);
  }
  if (path === '/bounty/award') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    return handleAward(await readJson(request), env);
  }
  if (path === '/bounty/detail') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleDetail(url, env);
  }
  if (path === '/bounty/verify') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleVerify(request, env);
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env);
  },
};
