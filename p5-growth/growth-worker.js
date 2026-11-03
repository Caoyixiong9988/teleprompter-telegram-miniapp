/**
 * growth-worker.js — P5 病毒增长（Cloudflare Worker, Modules 格式 + D1）
 *
 * 复用：
 *   - shared/verify.js          ：initData HMAC 验签
 *   - shared/ledger-core.js     ：积分发放/消耗语义（grant / consume）
 *   - ./growth-core.js          ：纯逻辑（归因 / 排行榜 / 礼物 / 分享载荷）
 *   - 同一 D1 库 teleprompter-credits（P2 统一积分总账），使积分变动与增长表同库。
 *
 * 路由：
 *   POST /growth/referral   经 initData 验签；归因推荐人 + 铸造专属码 + 平台发放双方奖励
 *   GET  /growth/leaderboard ?group=GID&limit=N  公开；按 reads_count 排名（群 / 全站）
 *   POST /growth/gift       经 initData 验签；平台中介礼物（consume+grant，非转账）
 *   GET  /growth/share      经 initData 验签；返回分享深链 + 卡片数据（Canvas 渲染在 index.html）
 *   GET  /growth/verify     ADMIN_SECRET 门禁；运营对账
 *
 * 合规：所有积分变动平台中介；无 transfer/withdraw/赌博；分享为 UGC 有机传播。
 *
 * secret（占位，部署时填）：BOT_TOKEN、ADMIN_SECRET
 * vars  ：BOT_USERNAME（分享深链用，明文即可，但建议放 secret 避免泄露 bot 指纹）
 */

import { verifyInitData, getUserIdFromInitData } from '../shared/verify.js';
import { grant, consume, getBalance } from '../shared/ledger-core.js';
import { attributeReferral, getLeaderboard, sendGift, buildSharePayload } from './growth-core.js';

// ── D1 Store 适配器（同时实现 growth-core 与 ledger-core 的 Store 接口）──
class D1Store {
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

  // ── growth 接口 ──────────────────────────────────────────
  async getReferralRow(userId) {
    return this.db.prepare('SELECT user_id, referrer_user_id, referral_code, created_at FROM users_referral WHERE user_id = ?').bind(userId).first();
  }
  async claimReferralCode({ userId, referralCode, createdAt }) {
    const taken = await this.db.prepare('SELECT user_id FROM users_referral WHERE referral_code = ?').bind(referralCode).first();
    if (taken) return false;                                  // 码被占用
    const info = await this.db.prepare('INSERT OR IGNORE INTO users_referral (user_id, referrer_user_id, referral_code, created_at) VALUES (?,NULL,?,?)').bind(userId, referralCode, createdAt).run();
    const inserted = (info.meta?.changes ?? 0) > 0;
    if (!inserted) {
      const existing = await this.getReferralRow(userId);
      if (existing && existing.referral_code === referralCode) return true;
      return false;                                           // 并发下用户行已存在 → 碰撞
    }
    return true;
  }
  async setReferrer(userId, referrerUserId) {
    const info = await this.db.prepare('UPDATE users_referral SET referrer_user_id = ? WHERE user_id = ? AND referrer_user_id IS NULL').bind(referrerUserId, userId).run();
    return (info.meta?.changes ?? 0) > 0;
  }
  async getUserIdByReferralCode(code) {
    const row = await this.db.prepare('SELECT user_id FROM users_referral WHERE referral_code = ?').bind(code).first();
    return row ? row.user_id : null;
  }
  async setGroupStat({ groupId, userId, readsCount, streakCount, updatedAt }) {
    await this.db.prepare(
      'INSERT INTO group_stats (group_id, user_id, reads_count, streak_count, updated_at) VALUES (?,?,?,?,?) ' +
      'ON CONFLICT(group_id, user_id) DO UPDATE SET reads_count = excluded.reads_count, streak_count = excluded.streak_count, updated_at = excluded.updated_at'
    ).bind(groupId, userId, readsCount, streakCount, updatedAt).run();
  }
  async getLeaderboard({ groupId, limit = 20 }) {
    if (groupId) {
      const rows = await this.db.prepare('SELECT user_id, reads_count, streak_count FROM group_stats WHERE group_id = ? ORDER BY reads_count DESC LIMIT ?').bind(groupId, limit).all();
      return rows.results ?? [];
    }
    const rows = await this.db.prepare('SELECT user_id, SUM(reads_count) AS reads_count, MAX(streak_count) AS streak_count FROM group_stats GROUP BY user_id ORDER BY reads_count DESC LIMIT ?').bind(limit).all();
    return rows.results ?? [];
  }
  async insertGiftLog({ fromUserId, toUserId, amount, reason, createdAt }) {
    await this.db.prepare('INSERT INTO gift_log (from_user_id, to_user_id, amount, reason, created_at) VALUES (?,?,?,?,?)').bind(fromUserId, toUserId, amount, reason, createdAt).run();
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

// ── 各端点 ─────────────────────────────────────────────────
async function handleReferral(body, env) {
  const a = await authUser(body.initData, env);
  if (!a.ok) return json({ error: a.error }, a.status);
  const store = new D1Store(env.DB);
  const res = await attributeReferral(store, { userId: a.userId, referralCode: (body.referralCode || '').trim() || null });
  return json(res);
}

async function handleLeaderboard(url, env) {
  const groupId = url.searchParams.get('group') || null;
  const limit = parseInt(url.searchParams.get('limit') || '20', 10) || 20;
  const store = new D1Store(env.DB);
  const leaderboard = await getLeaderboard(store, { groupId, limit });
  return json({ leaderboard });
}

async function handleGift(body, env) {
  const a = await authUser(body.initData, env);
  if (!a.ok) return json({ error: a.error }, a.status);
  const toUserId = String(body.toUserId || '');
  const amount = parseInt(body.amount, 10);
  const store = new D1Store(env.DB);
  try {
    await sendGift(store, { fromUserId: a.userId, toUserId, amount, reason: body.reason || 'gift' });
  } catch (e) {
    if (e.code === 'INSUFFICIENT_FUNDS') return json({ error: 'insufficient_funds' }, 402);
    if (e.code === 'INVALID_AMOUNT') return json({ error: 'invalid_amount' }, 400);
    if (e.code === 'INVALID_GIFT') return json({ error: 'invalid_gift' }, 400);
    return json({ error: 'internal', detail: String(e && e.message) }, 500);
  }
  return json({
    ok: true,
    fromBalance: await getBalance(store, { userId: a.userId }),
    toBalance: await getBalance(store, { userId: toUserId }),
  });
}

async function handleShare(initData, env) {
  const a = await authUser(initData, env);
  if (!a.ok) return json({ error: a.error }, a.status);
  const store = new D1Store(env.DB);
  let row = await store.getReferralRow(a.userId);
  let code = row ? row.referral_code : null;
  if (!code) {
    // 首次分享：顺带铸造本用户专属码
    const r = await attributeReferral(store, { userId: a.userId, referralCode: null });
    code = r.referralCode;
  }
  const payload = buildSharePayload({
    userId: a.userId,
    referralCode: code,
    botUsername: env.BOT_USERNAME,
    appUrl: env.APP_URL,
  });
  return json(payload);
}

async function handleVerify(request, env) {
  const provided =
    request.headers.get('x-admin-secret') ||
    new URL(request.url).searchParams.get('adminSecret');
  if (!env.ADMIN_SECRET || provided !== env.ADMIN_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }
  const store = new D1Store(env.DB);
  let giftCount = 0;
  try {
    const row = await store.db.prepare('SELECT COUNT(*) AS c FROM gift_log').first();
    giftCount = row ? row.c : 0;
  } catch { /* 表未初始化等 */ }
  return json({ ok: true, giftCount });
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

  if (path === '/growth/referral') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    return handleReferral(await readJson(request), env);
  }
  if (path === '/growth/leaderboard') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleLeaderboard(url, env);                                    // 公开，无需 initData
  }
  if (path === '/growth/gift') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    return handleGift(await readJson(request), env);
  }
  if (path === '/growth/share') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    const initData = url.searchParams.get('initData') || (await readJson(request)).initData || '';
    return handleShare(initData, env);
  }
  if (path === '/growth/verify') {
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
