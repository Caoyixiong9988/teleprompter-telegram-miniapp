/**
 * test-credits.mjs — P2 本地测试（无需 Cloudflare）
 * 运行：node --test p2-credits/test-credits.mjs
 *
 * 覆盖：
 *   1) ledger-core 业务逻辑（grant/consume/余额不足/非法金额/流水）
 *   2) 并发安全性（无丢失更新）
 *   3) credits-worker 端到端（验签门禁 / adminSecret 门禁 / 402 / 401 / 403）
 *   4) 合规：核心模块不得导出 transfer（禁止 P2P 转账）
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { grant, consume, getBalance, getLedger } from '../shared/ledger-core.js';
import { verifyInitData, getUserIdFromInitData } from '../shared/verify.js';
import worker from './credits-worker.js';
import { InMemoryStore } from './inmemory-store.js';

const BOT_TOKEN = 'TEST_BOT_TOKEN:abc';
const ADMIN_SECRET = 'super-secret';

// ── 工具：用与 verify 相同的算法"签发"一份合法 initData ──
async function signInitData(botToken, userId) {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify({ id: userId, first_name: 'Tester' }));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'test-q');
  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map((k) => k + '=' + params.get(k)).join('\n');
  const enc = (s) => new TextEncoder().encode(s);
  const k1 = await crypto.subtle.importKey('raw', enc('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', k1, enc(botToken)));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc(dataCheckString)));
  const hash = Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
  params.set('hash', hash);
  return params.toString();
}

// ── 工具：模拟 D1 的 mock DB（匹配 credits-worker.js 中的 SQL）──
function makeMockDB() {
  const users = new Map();   // userId -> {balance,created_at,updated_at}
  const ledger = [];         // {id,user_id,delta,reason,ref_type,ref_id,created_at}
  let lid = 1;
  const run = (sql, p) => {
    if (sql.includes('INSERT OR IGNORE INTO users_credits')) {
      const [userId, , ca, ua] = p;
      if (!users.has(userId)) users.set(userId, { balance: 0, created_at: ca, updated_at: ua });
      return { meta: { changes: 0 } };
    }
    if (sql.includes('UPDATE users_credits')) {
      // UPDATE ... SET balance = balance + ?, updated_at = ? WHERE user_id = ? AND balance + ? >= 0
      const [delta, ua, userId] = p;
      const row = users.get(userId);
      if (!row) return { meta: { changes: 0 } };
      if (row.balance + delta < 0) return { meta: { changes: 0 } };
      row.balance += delta; row.updated_at = ua;
      return { meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO credits_ledger')) {
      const [userId, delta, reason, refType, refId, ca] = p;
      ledger.push({ id: lid++, user_id: userId, delta, reason, ref_type: refType, ref_id: refId, created_at: ca });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  };
  const first = (sql, p) => {
    if (sql.includes('SELECT balance')) {
      const row = users.get(p[0]);
      return row ? { balance: row.balance } : null;
    }
    return null;
  };
  const all = (sql, p) => {
    if (sql.includes('SELECT id, user_id')) {
      const [userId, limit] = p;
      return {
        results: ledger
          .filter((r) => r.user_id === userId)
          .sort((a, b) => b.id - a.id)
          .slice(0, limit),
      };
    }
    return { results: [] };
  };
  return {
    prepare(sql) {
      return {
        bind(...p) {
          return { run: async () => run(sql, p), first: async () => first(sql, p), all: async () => all(sql, p) };
        },
      };
    },
  };
}

const ENV = { DB: makeMockDB(), BOT_TOKEN, ADMIN_SECRET };

// ════════════════════════════════════════════════════════
test('1) 核心逻辑：grant/consume/余额不足/非法金额/流水', async () => {
  const s = new InMemoryStore();
  let b = await grant(s, { userId: 'u1', amount: 100, reason: 'signin' });
  assert.equal(b, 100);

  b = await consume(s, { userId: 'u1', amount: 30, reason: 'pro_unlock', refType: 'pro' });
  assert.equal(b, 70);

  // 余额不足
  await assert.rejects(() => consume(s, { userId: 'u1', amount: 999 }), (e) => e.code === 'INSUFFICIENT_FUNDS');
  assert.equal(await getBalance(s, { userId: 'u1' }), 70); // 拒绝后余额不变

  // 非法金额
  await assert.rejects(() => grant(s, { userId: 'u1', amount: 0 }), (e) => e.code === 'INVALID_AMOUNT');
  await assert.rejects(() => grant(s, { userId: 'u1', amount: -5 }), (e) => e.code === 'INVALID_AMOUNT');

  // 流水
  const ledger = await getLedger(s, { userId: 'u1' });
  assert.equal(ledger.length, 2);
  assert.equal(ledger[0].delta, -30); // 倒序，最近一笔是消费
  assert.equal(ledger[1].delta, 100);
});

test('2) 并发安全：100 次 grant(1) + 50 次 consume(1) → 余额 50，无丢失更新', async () => {
  const s = new InMemoryStore();
  await s.ensureUser('conc');
  const grants = Array.from({ length: 100 }, () => grant(s, { userId: 'conc', amount: 1 }));
  const consumes = Array.from({ length: 50 }, () => consume(s, { userId: 'conc', amount: 1 }));
  await Promise.all([...grants, ...consumes]);
  assert.equal(await getBalance(s, { userId: 'conc' }), 50);
  assert.equal((await getLedger(s, { userId: 'conc', limit: 1000 })).length, 150);
});

test('3) Worker 端到端：验签门禁 / adminSecret / 402 / 401 / 403', async () => {
  const validInit = await signInitData(BOT_TOKEN, 'u_api');
  const tampered = validInit + 'X'; // 破坏 hash

  // 3.1 无 adminSecret 直接 grant → 403
  let r = await worker.fetch(
    new Request('https://x/credits/grant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u_api', amount: 100 }) }),
    ENV
  );
  assert.equal(r.status, 403);

  // 3.2 带 adminSecret grant → 200，余额 100
  r = await worker.fetch(
    new Request('https://x/credits/grant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adminSecret: ADMIN_SECRET, userId: 'u_api', amount: 100, reason: 'bounty_win' }) }),
    ENV
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).balance, 100);

  // 3.3 合法 initData 查余额 → 100
  r = await worker.fetch(
    new Request('https://x/credits/balance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: validInit }) }),
    ENV
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).balance, 100);

  // 3.4 consume 30（带合法 initData）→ 70
  r = await worker.fetch(
    new Request('https://x/credits/consume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: validInit, amount: 30, reason: 'watermark_export', refType: 'export' }) }),
    ENV
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).balance, 70);

  // 3.5 余额不足 consume 999 → 402
  r = await worker.fetch(
    new Request('https://x/credits/consume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: validInit, amount: 999 }) }),
    ENV
  );
  assert.equal(r.status, 402);

  // 3.6 篡改 initData → 401
  r = await worker.fetch(
    new Request('https://x/credits/balance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: tampered }) }),
    ENV
  );
  assert.equal(r.status, 401);

  // 3.7 流水可查
  r = await worker.fetch(
    new Request('https://x/credits/ledger', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: validInit }) }),
    ENV
  );
  assert.equal(r.status, 200);
  assert.ok((await r.json()).ledger.length >= 2);
});

test('4) 合规：核心模块不得提供 transfer（禁止 P2P 转账）', async () => {
  const mod = await import('../shared/ledger-core.js');
  assert.equal(typeof mod.transfer, 'undefined', '绝不能出现 transfer —— 积分只由平台发放，用户间不可转账');
  assert.equal(typeof mod.grant, 'function');
  assert.equal(typeof mod.consume, 'function');
});

test('5) verify 独立性：未配置 token 时返回 token_not_configured', async () => {
  const v = await verifyInitData('hash=abc&auth_date=1', '__BOT_TOKEN_PLACEHOLDER__');
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'token_not_configured');
  assert.equal(getUserIdFromInitData(await signInitData(BOT_TOKEN, '42')), '42');
});
