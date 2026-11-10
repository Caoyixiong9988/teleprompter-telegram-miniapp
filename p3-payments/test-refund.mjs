/**
 * test-refund.mjs — 后台退款 + 退款后撤销 Pro 权益（P3 回归）
 * 运行：node --test p3-payments/test-refund.mjs
 *
 * 覆盖：
 *   1) 退款资格纯逻辑（14 天窗口 / force / 非法时间）与积分扣回上限
 *   2) users_pro.charge_id 精确撤销：退旧单不误撤后买的更长订阅
 *   3) /admin/refunds、/admin/refund 的 ADMIN_SECRET 门禁与参数校验
 *   4) 退款成功 → Bot API 参数正确、支付行标 refunded、Pro 撤销、pro-status 降为 false、审计留痕
 *   5) 积分包退款 → 扣回积分且不追成负数；已消耗部分只扣余额
 *   6) 重复退款 409、超期 409、force 放行并留痕
 *   7) 铁律：Bot API 失败 / 未配 token 时，本地状态一律不动（不先撤权益）
 *   8) /admin 页面含可点击退款按钮；单体 worker.js 的 /admin 路由可达（修 404）
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import worker from './payments-worker.js';
import monolith from '../worker.js';
import { InMemoryPaymentsStore } from './inmemory-payments-store.js';
import {
  evaluateRefundEligibility,
  revokeAmount,
  REFUND_WINDOW_DAYS,
  REFUND_WINDOW_MS,
} from './payments-core.js';

const BOT_TOKEN = 'TEST_BOT_TOKEN:abc';
const ADMIN_SECRET = 'super-secret';
const WEBHOOK_SECRET = 'webhook-secret-xyz';

// ── stub Bot API：记录 refundStarPayment 调用，可切换成功/失败 ──
let realFetch;
let refundApiCalls = [];
let refundApiResponse = { ok: true, result: true };
let refundApiThrows = false;

before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (typeof url === 'string' && url.includes('refundStarPayment')) {
      refundApiCalls.push({ url, body: JSON.parse(opts.body) });
      if (refundApiThrows) throw new Error('network down');
      return { ok: true, json: async () => refundApiResponse };
    }
    if (typeof url === 'string' && url.includes('createInvoiceLink')) {
      return { ok: true, json: async () => ({ ok: true, result: 'https://t.me/invoice/FAKE' }) };
    }
    return realFetch(url, opts);
  };
});
after(() => { globalThis.fetch = realFetch; });

function resetApi() {
  refundApiCalls = [];
  refundApiResponse = { ok: true, result: true };
  refundApiThrows = false;
}

// ── 模拟 D1（支持支付/订阅/退款/积分全部 SQL + batch 事务回滚）──
function makeRefundDB() {
  const payments = new Map();   // chargeId -> row
  const users = new Map();      // userId -> {balance}
  const pro = new Map();        // userId -> {product_id, charge_id, expires_at}
  const refunds = new Map();    // chargeId -> row
  const ledger = [];
  let pid = 1;

  function exec(sql, p) {
    const r = {};
    if (sql.includes('INSERT INTO payments_stars')) {
      const [userId, chargeId, , stars, credits, status, created_at] = p;
      if (payments.has(chargeId)) {
        throw new Error('UNIQUE constraint failed: payments_stars.tg_payment_charge_id');
      }
      payments.set(chargeId, {
        id: pid++, user_id: userId, tg_payment_charge_id: chargeId,
        provider: 'telegram_stars', stars, credits_granted: credits,
        status: status || 'completed', created_at,
      });
      r.changes = 1;
    } else if (sql.includes('INSERT OR IGNORE INTO users_credits')) {
      if (!users.has(p[0])) users.set(p[0], { balance: 0 });
      r.changes = 0;
    } else if (sql.includes('INSERT INTO users_pro')) {
      const [userId, productId, chargeId, , expiresAt] = p;
      pro.set(userId, { product_id: productId, charge_id: chargeId, expires_at: expiresAt });
      r.changes = 1;
    } else if (sql.includes('INSERT INTO refunds')) {
      const [userId, chargeId, stars, creditsRevoked, proRevoked, forced, createdAt] = p;
      if (refunds.has(chargeId)) {
        throw new Error('UNIQUE constraint failed: refunds.tg_payment_charge_id');
      }
      refunds.set(chargeId, {
        user_id: userId, tg_payment_charge_id: chargeId, stars,
        credits_revoked: creditsRevoked, pro_revoked: proRevoked, forced, created_at: createdAt,
      });
      r.changes = 1;
    } else if (sql.includes('INSERT INTO credits_ledger')) {
      const [userId, delta, reason, refType, refId, createdAt] = p;
      ledger.push({ user_id: userId, delta, reason, ref_type: refType, ref_id: refId, created_at: createdAt });
      r.changes = 1;
    } else if (sql.includes("UPDATE payments_stars SET status = 'refunded'")) {
      const row = payments.get(p[0]);
      if (row) { row.status = 'refunded'; r.changes = 1; } else { r.changes = 0; }
    } else if (sql.includes('UPDATE users_credits SET balance = balance +')) {
      const [delta, , userId] = p;
      const row = users.get(userId);
      if (!row) r.changes = 0;
      else { row.balance += delta; r.changes = 1; }
    } else if (sql.includes('UPDATE users_credits SET balance = balance -')) {
      const [delta, , userId] = p;
      const row = users.get(userId);
      if (!row) r.changes = 0;
      else { row.balance -= delta; r.changes = 1; }
    } else if (sql.includes('DELETE FROM users_pro WHERE charge_id')) {
      let deleted = 0;
      for (const [uid, row] of pro) {
        if (row.charge_id === p[0]) { pro.delete(uid); deleted++; }
      }
      r.changes = deleted;
    } else if (sql.includes('SELECT balance FROM users_credits')) {
      r.row = { balance: users.get(p[0])?.balance ?? 0 };
    } else if (sql.includes('FROM users_pro WHERE charge_id')) {
      for (const [uid, row] of pro) {
        if (row.charge_id === p[0]) { r.row = { user_id: uid }; break; }
      }
    } else if (sql.includes('FROM users_pro WHERE user_id')) {
      const row = pro.get(p[0]);
      r.row = row ? { user_id: p[0], product_id: row.product_id, expires_at: row.expires_at } : null;
    } else if (sql.includes('FROM payments_stars WHERE tg_payment_charge_id')) {
      r.row = payments.get(p[0]) || null;
    } else if (sql.includes('FROM refunds WHERE tg_payment_charge_id')) {
      r.row = refunds.has(p[0]) ? { id: 1 } : null;
    } else if (sql.includes('FROM payments_stars WHERE user_id')) {
      const [userId, limit] = p;
      r.results = [...payments.values()].filter((x) => x.user_id === userId)
        .sort((a, b) => b.id - a.id).slice(0, limit);
    } else if (sql.includes('COUNT(*)')) {
      r.row = { c: payments.size };
    } else if (sql.includes('COALESCE(SUM')) {
      const rows = [...payments.values()];
      r.row = {
        stars: rows.reduce((s, x) => s + x.stars, 0),
        credits: rows.reduce((s, x) => s + x.credits_granted, 0),
      };
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
      sql, args: [],
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
      payments: structuredClone(payments), users: structuredClone(users),
      pro: structuredClone(pro), refunds: structuredClone(refunds),
      ledger: structuredClone(ledger), pid,
    };
  }
  function restore(s) {
    payments.clear(); users.clear(); pro.clear(); refunds.clear(); ledger.length = 0;
    for (const [k, v] of s.payments) payments.set(k, v);
    for (const [k, v] of s.users) users.set(k, v);
    for (const [k, v] of s.pro) pro.set(k, v);
    for (const [k, v] of s.refunds) refunds.set(k, v);
    for (const v of s.ledger) ledger.push(v);
    pid = s.pid;
  }
  async function batch(stmts) {
    const snap = snapshot();
    try {
      return stmts.map((s) => ({ meta: { changes: s._exec().changes || 0 } }));
    } catch (e) {
      restore(snap);
      throw e;
    }
  }

  return {
    prepare, batch,
    // 测试内省
    payment: (cid) => payments.get(cid),
    proOf: (uid) => pro.get(uid),
    refundOf: (cid) => refunds.get(cid),
    balance: (uid) => users.get(uid)?.balance ?? 0,
    ledgerOf: (uid) => ledger.filter((x) => x.user_id === uid),
    setCreatedAt: (cid, ts) => { const r = payments.get(cid); if (r) r.created_at = ts; },
    setBalance: (uid, v) => { users.set(uid, { balance: v }); },
    refundCount: () => refunds.size,
  };
}

function envWith(db, extra = {}) {
  return { DB: db, BOT_TOKEN, ADMIN_SECRET, WEBHOOK_SECRET, ...extra };
}

async function seedPayment(env, { userId = '10001', chargeId, productId, stars, daysAgo = 0 }) {
  const upd = {
    update_id: 1,
    message: {
      from: { id: Number(userId) },
      successful_payment: {
        currency: 'XTR', total_amount: stars,
        telegram_payment_charge_id: chargeId, invoice_payload: productId,
      },
    },
  };
  const r = await worker.fetch(new Request('https://x/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: JSON.stringify(upd),
  }), env);
  assert.equal(r.status, 200);
  if (daysAgo) env.DB.setCreatedAt(chargeId, Date.now() - daysAgo * 24 * 3600 * 1000);
  return r.json();
}

async function postRefund(env, { chargeId, force = false, adminSecret = ADMIN_SECRET }) {
  return worker.fetch(new Request('https://x/admin/refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-secret': adminSecret },
    body: JSON.stringify({ chargeId, force }),
  }), env);
}

async function signInitData(botToken, userId) {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify({ id: userId, first_name: 'Tester' }));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  const keys = Array.from(params.keys()).sort();
  const dcs = keys.map((k) => k + '=' + params.get(k)).join('\n');
  const enc = (s) => new TextEncoder().encode(s);
  const k1 = await crypto.subtle.importKey('raw', enc('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', k1, enc(botToken)));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc(dcs)));
  params.set('hash', Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join(''));
  return params.toString();
}

// ════════════════════════════════════════════════════════
test('1) 退款资格纯逻辑：14 天窗口 / force / 非法时间', () => {
  const now = Date.now();
  assert.equal(evaluateRefundEligibility({ createdAt: now - 1000, now }).ok, true);
  assert.equal(evaluateRefundEligibility({ createdAt: now - REFUND_WINDOW_MS - 1, now }).reason, 'refund_window_expired');
  const forced = evaluateRefundEligibility({ createdAt: now - REFUND_WINDOW_MS - 1, now, force: true });
  assert.equal(forced.ok, true);
  assert.equal(forced.forced, true);
  assert.equal(evaluateRefundEligibility({ createdAt: 0, now }).reason, 'invalid_created_at');
  assert.equal(REFUND_WINDOW_DAYS, 14);
  assert.equal(revokeAmount(100, 2400), 100);   // 余额不足只扣余额
  assert.equal(revokeAmount(2400, 2400), 2400); // 全额扣回
  assert.equal(revokeAmount(-5, 2400), 0);      // 不追负数
});

test('2) users_pro 按 charge_id 精确撤销：退旧单不误撤后买的更长订阅', async () => {
  const s = new InMemoryPaymentsStore();
  const exp = Date.now() + 365 * 24 * 3600 * 1000;
  await s.grantPro({ userId: 'u1', chargeId: 'c_old', productId: 'pro_month', stars: 400, expiresAt: exp });
  await s.grantPro({ userId: 'u1', chargeId: 'c_new', productId: 'pro_year', stars: 4000, expiresAt: exp });
  assert.equal((await s.getProStatus('u1')).productId, 'pro_year');
  assert.equal(s.revokeProByCharge('c_old'), false, '旧单已被覆盖，不应撤销当前有效订阅');
  assert.equal((await s.getProStatus('u1')).pro, true);
  assert.equal(s.revokeProByCharge('c_new'), true);
  assert.equal((await s.getProStatus('u1')).pro, false);
});

test('3) /admin/refunds 与 /admin/refund 均需 ADMIN_SECRET', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  let r = await worker.fetch(new Request('https://x/admin/refunds'), env);
  assert.equal(r.status, 403);
  r = await postRefund(env, { chargeId: 'whatever', adminSecret: 'wrong' });
  assert.equal(r.status, 403);
  assert.equal(refundApiCalls.length, 0, '鉴权失败绝不能调用 Bot API');
  r = await worker.fetch(new Request('https://x/admin/refunds', { headers: { 'x-admin-secret': ADMIN_SECRET } }), env);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.windowDays, 14);
  assert.equal(d.items.length, 0);
});

test('4) 参数校验：缺 chargeId 400 / 未知单 404', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  let r = await postRefund(env, { chargeId: '' });
  assert.equal(r.status, 400);
  r = await postRefund(env, { chargeId: 'not-exist' });
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'payment_not_found');
});

test('5) Pro 单退款成功：Bot API 参数正确 + 撤销 Pro + pro-status 降级 + 审计留痕', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  await seedPayment(env, { chargeId: 'charge_pro_1', productId: 'pro_month', stars: 400 });
  assert.ok(db.proOf('10001'), '前置：Pro 已授予');

  const r = await postRefund(env, { chargeId: 'charge_pro_1' });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.proRevoked, true);
  assert.equal(d.creditsRevoked, 0);
  assert.equal(d.stars, 400);

  assert.equal(refundApiCalls.length, 1);
  assert.equal(refundApiCalls[0].body.user_id, 10001);
  assert.equal(refundApiCalls[0].body.telegram_payment_charge_id, 'charge_pro_1');
  assert.ok(refundApiCalls[0].url.includes('/refundStarPayment'));

  assert.equal(db.payment('charge_pro_1').status, 'refunded');
  assert.equal(db.proOf('10001'), undefined, 'Pro 权益必须已撤销');
  assert.equal(db.refundOf('charge_pro_1').pro_revoked, 1);
  assert.equal(db.refundOf('charge_pro_1').forced, 0);

  const initData = await signInitData(BOT_TOKEN, 10001);
  const ps = await worker.fetch(new Request('https://x/payments/pro-status?initData=' + encodeURIComponent(initData)), env);
  assert.equal((await ps.json()).pro, false, '退款后 pro-status 必须降为 false');
});

test('6) 积分包退款：扣回未使用积分并记负向 ledger', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  await seedPayment(env, { chargeId: 'charge_credits_1', productId: 'credits_pro', stars: 200 });
  assert.equal(db.balance('10001'), 2400);

  const r = await postRefund(env, { chargeId: 'charge_credits_1' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).creditsRevoked, 2400);
  assert.equal(db.balance('10001'), 0);
  const rev = db.ledgerOf('10001').filter((x) => x.reason === 'refund_revoke');
  assert.equal(rev.length, 1);
  assert.equal(rev[0].delta, -2400);
  assert.equal(rev[0].ref_id, 'charge_credits_1');
});

test('7) 积分已被消耗：只扣余额，绝不追成负数', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  await seedPayment(env, { chargeId: 'charge_spent', productId: 'credits_pro', stars: 200 });
  db.setBalance('10001', 300);
  const r = await postRefund(env, { chargeId: 'charge_spent' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).creditsRevoked, 300);
  assert.equal(db.balance('10001'), 0);
  assert.equal(db.ledgerOf('10001').filter((x) => x.reason === 'refund_revoke')[0].delta, -300);
});

test('8) 重复退款 → 409，且不再调用 Bot API', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  await seedPayment(env, { chargeId: 'charge_dup', productId: 'pro_month', stars: 400 });
  assert.equal((await postRefund(env, { chargeId: 'charge_dup' })).status, 200);
  const r = await postRefund(env, { chargeId: 'charge_dup' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'already_refunded');
  assert.equal(refundApiCalls.length, 1);
  assert.equal(db.refundCount(), 1);
});

test('9) 超 14 天默认拒绝；force 放行并写 forced=1 留痕', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  await seedPayment(env, { chargeId: 'charge_old', productId: 'pro_month', stars: 400, daysAgo: 20 });
  let r = await postRefund(env, { chargeId: 'charge_old' });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, 'refund_window_expired');
  assert.equal(refundApiCalls.length, 0, '窗口外拒绝时不能调 Bot API');

  r = await postRefund(env, { chargeId: 'charge_old', force: true });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).forced, true);
  assert.equal(db.refundOf('charge_old').forced, 1);
});

test('10) 铁律：Bot API 失败时本地状态完全不变（不先撤权益）', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  await seedPayment(env, { chargeId: 'charge_fail', productId: 'pro_month', stars: 400 });

  refundApiResponse = { ok: false, description: 'CHARGE_NOT_FOUND' };
  let r = await postRefund(env, { chargeId: 'charge_fail' });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'refund_rejected');

  refundApiThrows = true;
  r = await postRefund(env, { chargeId: 'charge_fail' });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error, 'refund_api_failed');

  assert.equal(db.payment('charge_fail').status, 'completed');
  assert.ok(db.proOf('10001'), '平台没退钱，Pro 绝不能被撤销');
  assert.equal(db.refundCount(), 0);
  resetApi();
});

test('11) 未配置 BOT_TOKEN → 503，且不改本地状态', async () => {
  const db = makeRefundDB();
  const env = envWith(db, { BOT_TOKEN: '' });
  resetApi();
  await seedPayment(env, { chargeId: 'charge_notoken', productId: 'pro_month', stars: 400 });
  const r = await postRefund(env, { chargeId: 'charge_notoken' });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'bot_token_not_configured');
  assert.ok(db.proOf('10001'));
  assert.equal(refundApiCalls.length, 0);
});

test('12) /admin 页面含可点击退款按钮；超期与已退款状态正确呈现', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  resetApi();
  await seedPayment(env, { chargeId: 'charge_page_1', productId: 'pro_month', stars: 400 });
  await seedPayment(env, { chargeId: 'charge_page_2', productId: 'credits_pro', stars: 200, daysAgo: 30 });
  const r = await worker.fetch(new Request('https://x/admin?adminSecret=' + encodeURIComponent(ADMIN_SECRET)), env);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('button class="rf"'), '必须有可点击的退款按钮');
  assert.ok(html.includes('data-charge="charge_page_1"'));
  assert.ok(html.includes('/admin/refund'));
  assert.ok(html.includes('refundStarPayment'));
  assert.ok(html.includes('超 14 天'), '超窗口要有提示');
  assert.ok(html.includes('history.replaceState'), '地址栏里的密钥应被立即清除');
  assert.ok(html.includes('var ADMIN = "super-secret"'), '密钥只注入到脚本变量，供 fetch 带 header 用');
  assert.equal((await worker.fetch(new Request('https://x/admin'), env)).status, 403);
});

test('13) 密钥含 </script> 也不会破坏页面（注入防护）', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  const evil = '</script><script>alert(1)</script>';
  const r = await worker.fetch(new Request('https://x/admin?adminSecret=' + encodeURIComponent(evil)), env);
  assert.equal(r.status, 403, '错误密钥本就不该进页面');
  const env2 = envWith(db, { ADMIN_SECRET: evil });
  const r2 = await worker.fetch(new Request('https://x/admin?adminSecret=' + encodeURIComponent(evil)), env2);
  assert.equal(r2.status, 200);
  const html = await r2.text();
  assert.equal(html.includes('</script><script>alert(1)</script>'), false);
});

test('14) 单体 worker.js 的 /admin 路由可达（此前漏挂导致 404）', async () => {
  const db = makeRefundDB();
  const env = envWith(db);
  const r = await monolith.fetch(new Request('https://x/admin/summary?adminSecret=' + encodeURIComponent(ADMIN_SECRET)), env);
  assert.equal(r.status, 200, '/admin/summary 不应再是 404');
  const page = await monolith.fetch(new Request('https://x/admin?adminSecret=' + encodeURIComponent(ADMIN_SECRET)), env);
  assert.equal(page.status, 200);
  const health = await monolith.fetch(new Request('https://x/health'), env);
  assert.equal(health.status, 200);
});
