/**
 * test-payments.mjs — P3 本地测试（无需 Cloudflare）
 * 运行：node --test p3-payments/test-payments.mjs
 *
 * 覆盖（对应任务 5 条断言）：
 *   a) 成功支付 → 记录 + 正确发放积分（core 级 + worker 级）
 *   b) 重复 tg_payment_charge_id → 不二次发放（幂等）
 *   c) pre_checkout_query → 应答 answerPreCheckoutQuery ok
 *   d) 未授权 webhook（缺/错 secret）→ 401；/payments/verify 缺 ADMIN_SECRET → 403
 *   e) /invoice 与 /history 使用非法 initData → 401
 *   附加：未知商品不发放；/invoice 合法 → 返回发票链接（stub Bot API）
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import { processSuccessfulPayment, STARS_PRODUCTS } from './payments-core.js';
import { InMemoryPaymentsStore } from './inmemory-payments-store.js';
import worker from './payments-worker.js';

const BOT_TOKEN = 'TEST_BOT_TOKEN:abc';
const ADMIN_SECRET = 'super-secret';
const WEBHOOK_SECRET = 'webhook-secret-xyz';

// ── 签发合法 initData（复用与 verify.js 一致的算法）──
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

// ── 模拟 D1（prepare/bind/run/first/all/batch + 唯一约束 + 事务回滚）──
function makeMockDB() {
  const users = new Map();    // userId -> {balance,created_at,updated_at}
  const ledger = [];          // {id,user_id,delta,reason,ref_type,ref_id,created_at}
  const payments = new Map(); // chargeId -> row
  let lid = 1, pid = 1;

  function exec(sql, p) {
    const r = {};
    if (sql.includes('INSERT INTO payments_stars')) {
      const [userId, chargeId, , stars, credits, , created_at] = p;
      // 唯一约束：重复 charge_id 抛错（模拟 D1 UNIQUE 失败 → 整批回滚）
      if (payments.has(chargeId)) {
        throw new Error('UNIQUE constraint failed: payments_stars.tg_payment_charge_id');
      }
      payments.set(chargeId, {
        id: pid++, user_id: userId, tg_payment_charge_id: chargeId,
        provider: 'telegram_stars', stars, credits_granted: credits, status: 'completed', created_at,
      });
      r.changes = 1;
    } else if (sql.includes('INSERT OR IGNORE INTO users_credits')) {
      const [userId, , ca, ua] = p;
      if (!users.has(userId)) users.set(userId, { balance: 0, created_at: ca, updated_at: ua });
      r.changes = 0;
    } else if (sql.includes('UPDATE users_credits')) {
      const [delta, ua, userId] = p;
      const row = users.get(userId);
      if (!row) { r.changes = 0; }
      else if (row.balance + delta < 0) { r.changes = 0; }
      else { row.balance += delta; row.updated_at = ua; r.changes = 1; }
    } else if (sql.includes('INSERT INTO credits_ledger')) {
      const [userId, delta, reason, refType, refId, ca] = p;
      ledger.push({ id: lid++, user_id: userId, delta, reason, ref_type: refType, ref_id: refId, created_at: ca });
      r.changes = 1;
    } else if (sql.includes('SELECT balance FROM users_credits')) {
      const row = users.get(p[0]);
      r.row = row ? { balance: row.balance } : null;
    } else if (sql.includes('FROM credits_ledger')) {
      const [userId, limit] = p;
      r.results = ledger.filter((x) => x.user_id === userId).sort((a, b) => b.id - a.id).slice(0, limit);
    } else if (sql.includes('COUNT(*)')) {
      r.row = { c: payments.size };
    } else if (sql.includes('FROM payments_stars WHERE user_id')) {
      const [userId, limit] = p;
      r.results = [...payments.values()].filter((x) => x.user_id === userId).sort((a, b) => b.id - a.id).slice(0, limit);
    } else if (sql.includes('FROM payments_stars')) {
      const [limit] = p;
      r.results = [...payments.values()].sort((a, b) => b.id - a.id).slice(0, limit);
    } else {
      r.changes = 0;
    }
    return r;
  }

  function prepare(sql) {
    const stmt = {
      sql,
      args: [],
      bind(...args) { this.args = args; return this; },
      async run() { return { meta: { changes: exec(this.sql, this.args).changes || 0 } }; },
      async first() { const r = exec(this.sql, this.args); return r.row ?? null; },
      async all() { const r = exec(this.sql, this.args); return { results: r.results ?? [] }; },
      _exec() { return exec(this.sql, this.args); },
    };
    return stmt;
  }

  function snapshot() {
    return {
      users: structuredClone(users),
      ledger: structuredClone(ledger),
      payments: structuredClone(payments),
      lid, pid,
    };
  }
  function restore(s) {
    // 用新引用替换，使闭包内后续读取看到回滚后的状态
    users.clear(); ledger.length = 0; payments.clear();
    for (const [k, v] of s.users) users.set(k, v);
    for (const v of s.ledger) ledger.push(v);
    for (const [k, v] of s.payments) payments.set(k, v);
    lid = s.lid; pid = s.pid;
  }

  async function batch(stmts) {
    const snap = snapshot();
    try {
      const out = [];
      for (const s of stmts) out.push(s._exec());
      return out.map((r) => ({ meta: { changes: (r && r.changes) || 0 } }));
    } catch (e) {
      restore(snap);
      throw e;
    }
  }

  return {
    prepare,
    batch,
    // 测试用内省
    balance: (uid) => users.get(uid)?.balance ?? 0,
    paymentCount: () => payments.size,
    ledgerCount: () => ledger.length,
    hasPayment: (cid) => payments.has(cid),
  };
}

const ENV = { DB: makeMockDB(), BOT_TOKEN, ADMIN_SECRET, WEBHOOK_SECRET };

// ── stub Bot API（createInvoiceLink）──
let realFetch;
before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('createInvoiceLink')) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: 'https://t.me/invoice/FAKE_LINK_123' }),
      };
    }
    return realFetch(url);
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

// ════════════════════════════════════════════════════════
test('a) 核心：成功支付记录 + 正确发放积分', async () => {
  const s = new InMemoryPaymentsStore();
  const r = await processSuccessfulPayment(s, { userId: 'u_a', chargeId: 'c_a', stars: 200, productId: 'credits_pro' });
  assert.equal(r.ok, true);
  assert.equal(r.creditsGranted, STARS_PRODUCTS.credits_pro.credits); // 2400
  assert.equal(await s.getBalance('u_a'), 2400);
  const hist = await s.getPaymentHistory('u_a');
  assert.equal(hist.length, 1);
  assert.equal(hist[0].tg_payment_charge_id, 'c_a');
  assert.equal(hist[0].credits_granted, 2400);
});

test('b) 核心：重复 charge_id 不二次发放（幂等）', async () => {
  const s = new InMemoryPaymentsStore();
  await processSuccessfulPayment(s, { userId: 'u_b', chargeId: 'c_b', stars: 200, productId: 'credits_pro' });
  const r2 = await processSuccessfulPayment(s, { userId: 'u_b', chargeId: 'c_b', stars: 200, productId: 'credits_pro' });
  assert.equal(r2.ok, true);
  assert.equal(r2.duplicate, true);              // 命中幂等
  assert.equal(await s.getBalance('u_b'), 2400); // 余额未翻倍
  assert.equal((await s.getPaymentHistory('u_b')).length, 1);
});

test('b2) 核心：未知商品不发放积分', async () => {
  const s = new InMemoryPaymentsStore();
  const r = await processSuccessfulPayment(s, { userId: 'u_b2', chargeId: 'c_b2', stars: 10, productId: 'nope' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unknown_product');
  assert.equal(await s.getBalance('u_b2'), 0);
});

test('a/b worker：成功支付记录并原子发积分；重复不二次发放', async () => {
  const upd = {
    update_id: 10,
    message: {
      from: { id: 777777 },
      successful_payment: {
        currency: 'XTR', total_amount: 200,
        telegram_payment_charge_id: 'charge_XYZ', invoice_payload: 'credits_pro',
      },
    },
  };
  const req = () => new Request('https://x/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: JSON.stringify(upd),
  });

  let r = await worker.fetch(req(), ENV);
  assert.equal(r.status, 200);
  let d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.creditsGranted, 2400);
  assert.equal(ENV.DB.balance('777777'), 2400);
  assert.equal(ENV.DB.paymentCount(), 1);

  // 重复投递同一 charge_id
  r = await worker.fetch(req(), ENV);
  assert.equal(r.status, 200);
  d = await r.json();
  assert.equal(d.duplicate, true);
  assert.equal(ENV.DB.balance('777777'), 2400); // 未翻倍
  assert.equal(ENV.DB.paymentCount(), 1);
});

test('c) worker：pre_checkout_query 应答 answerPreCheckoutQuery ok', async () => {
  const upd = { update_id: 2, pre_checkout_query: { id: 'pcq_1', currency: 'XTR', total_amount: 200, invoice_payload: 'credits_pro' } };
  const r = await worker.fetch(new Request('https://x/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: JSON.stringify(upd),
  }), ENV);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.method, 'answerPreCheckoutQuery');
  assert.equal(d.ok, true);
  assert.equal(d.pre_checkout_query_id, 'pcq_1');
});

test('d) worker：未授权 webhook（缺/错 secret）→ 401', async () => {
  // 缺 secret
  let r = await worker.fetch(new Request('https://x/payments/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ update_id: 3 }),
  }), ENV);
  assert.equal(r.status, 401);

  // 错误 secret
  r = await worker.fetch(new Request('https://x/payments/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong' },
    body: JSON.stringify({ update_id: 3 }),
  }), ENV);
  assert.equal(r.status, 401);
});

test('d2) worker：/payments/verify 缺 ADMIN_SECRET → 403；带正确 → 200', async () => {
  let r = await worker.fetch(new Request('https://x/payments/verify'), ENV);
  assert.equal(r.status, 403);

  r = await worker.fetch(new Request('https://x/payments/verify', { headers: { 'x-admin-secret': ADMIN_SECRET } }), ENV);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(typeof d.total, 'number');
});

test('e) worker：/invoice 与 /history 使用非法 initData → 401', async () => {
  const valid = await signInitData(BOT_TOKEN, 'u_e');

  // /invoice 篡改 initData
  let r = await worker.fetch(new Request('https://x/payments/invoice', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: valid + 'X', productId: 'credits_pro' }),
  }), ENV);
  assert.equal(r.status, 401);

  // /history 篡改 initData（GET + query）
  r = await worker.fetch(new Request('https://x/payments/history?initData=' + encodeURIComponent(valid + 'X')), ENV);
  assert.equal(r.status, 401);
});

test('e2) worker：合法 initData 下单 /invoice → 返回发票链接（stub Bot API）', async () => {
  const valid = await signInitData(BOT_TOKEN, 'u_e2');
  const r = await worker.fetch(new Request('https://x/payments/invoice', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: valid, productId: 'credits_starter' }),
  }), ENV);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.invoiceLink, 'https://t.me/invoice/FAKE_LINK_123');
  assert.equal(d.productId, 'credits_starter');
  assert.equal(d.stars, STARS_PRODUCTS.credits_starter.stars);
  assert.equal(d.credits, STARS_PRODUCTS.credits_starter.credits);
});

test('e3) worker：合法 initData 查 /history → 返回该用户支付记录', async () => {
  // 先走一次成功 webhook（777777 已有 1 笔）
  const upd = {
    update_id: 20, message: { from: { id: 777777 },
      successful_payment: { currency: 'XTR', total_amount: 500, telegram_payment_charge_id: 'charge_HIST', invoice_payload: 'credits_ultra' } },
  };
  await worker.fetch(new Request('https://x/payments/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: JSON.stringify(upd),
  }), ENV);

  const valid = await signInitData(BOT_TOKEN, 777777);
  const r = await worker.fetch(new Request('https://x/payments/history?initData=' + encodeURIComponent(valid)), ENV);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.history.length >= 2);
});

test('合规：payments-core 不导出任何 transfer / withdraw / 赌博 能力', async () => {
  const mod = await import('./payments-core.js');
  for (const banned of ['transfer', 'withdraw', 'payout', 'gamble', 'bet', 'predict', 'fortune']) {
    assert.equal(typeof mod[banned], 'undefined', `绝不能出现 ${banned} —— Stars 仅经 Telegram 官方，积分只平台发放、用户只消耗`);
  }
  assert.equal(typeof mod.processSuccessfulPayment, 'function');
});

test('平台对账 admin 门禁：无/错 ADMIN_SECRET → 403', async () => {
  const noSecret = await worker.fetch(new Request('https://x/admin/summary'), { ADMIN_SECRET: '' }, {});
  assert.equal(noSecret.status, 403);
  const noSecretPage = await worker.fetch(new Request('https://x/admin'), { ADMIN_SECRET: '' }, {});
  assert.equal(noSecretPage.status, 403);
  const wrong = await worker.fetch(new Request('https://x/admin/summary?adminSecret=bad'), { ADMIN_SECRET: 'good' }, {});
  assert.equal(wrong.status, 403);
});
