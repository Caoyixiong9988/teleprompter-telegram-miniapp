/**
 * payments-worker.js — P3 Telegram Stars 支付账本（Cloudflare Worker, Modules 格式 + D1）
 *
 * 复用：
 *   - shared/verify.js          ：initData HMAC 验签（/invoice、/history 门禁）
 *   - shared/ledger-core.js     ：积分发放语义（grant 三步：ensureUser→atomicAdjust→recordLedger）
 *   - 同一 D1 库 teleprompter-credits（P2 统一积分总账），使"支付 + 积分"可原子 batch。
 *
 * 路由：
 *   POST /payments/webhook   Telegram Stars webhook：pre_checkout→放行；successful_payment→记录+发积分（幂等）
 *   POST /payments/invoice   经 initData 验签；调用 Bot API createInvoiceLink 返回发票链接
 *   GET  /payments/history   经 initData 验签；返回当前用户 Stars 支付历史
 *   GET  /payments/verify    ADMIN_SECRET 门禁；运营对账
 *
 * 合规：Stars 只经 Telegram 官方；积分仅平台发放、用户只消耗；无 P2P 转账 / 无赌博。
 *
 * secret（占位，部署时填）：BOT_TOKEN、ADMIN_SECRET、WEBHOOK_SECRET（setWebhook 的 secret_token）
 */

import { verifyInitData, getUserIdFromInitData } from '../shared/verify.js';
import { processSuccessfulPayment, STARS_PRODUCTS } from './payments-core.js';

// ── D1 Store 适配器（实现 payments-core 的 Store 接口 + ledger-core 的 Store 接口）──
class D1PaymentsStore {
  constructor(db) {
    this.db = db;
  }

  // ── ledger-core Store 接口（供 grant 语义复用；D1 下由下方 batch 直接发，这里仅备审计用）──
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
  async atomicAdjust(userId, delta) {
    const now = Date.now();
    const info = await this.db
      .prepare('UPDATE users_credits SET balance = balance + ?, updated_at = ? WHERE user_id = ? AND balance + ? >= 0')
      .bind(delta, now, userId, delta)
      .run();
    return (info.meta?.changes ?? 0) > 0;
  }
  async recordLedger({ userId, delta, reason, refType, refId }) {
    const now = Date.now();
    await this.db
      .prepare('INSERT INTO credits_ledger (user_id, delta, reason, ref_type, ref_id, created_at) VALUES (?,?,?,?,?,?)')
      .bind(userId, delta, reason, refType ?? null, refId ?? null, now)
      .run();
  }
  async getLedger(userId, limit = 50) {
    const rows = await this.db
      .prepare('SELECT id, user_id, delta, reason, ref_type, ref_id, created_at FROM credits_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?')
      .bind(userId, limit)
      .all();
    return rows.results ?? [];
  }

  /**
   * 原子记录支付 + 发放积分（幂等）。三条积分 SQL 与 ledger-core#grant 完全一致，
   * 与支付行 INSERT 一起放进同一个 D1 batch（事务原子）；tg_payment_charge_id 唯一约束
   * 保证重复回调命中 UNIQUE → 整批回滚 → 识别为 duplicate，绝不二次发放。
   */
  async recordPaymentAndGrantTxn({ userId, chargeId, stars, creditsGranted }) {
    const now = Date.now();
    try {
      await this.db.batch([
        // 1) 支付行（UNIQUE 是幂等硬保证）
        this.db.prepare(
          'INSERT INTO payments_stars (user_id, tg_payment_charge_id, provider, stars, credits_granted, status, created_at) VALUES (?,?,?,?,?,?,?)'
        ).bind(userId, chargeId, 'telegram_stars', stars, creditsGranted, 'completed', now),
        // 2) ensureUser（与 grant 一致）
        this.db.prepare('INSERT OR IGNORE INTO users_credits (user_id, balance, created_at, updated_at) VALUES (?,0,?,?)')
          .bind(userId, now, now),
        // 3) atomicAdjust（与 grant 一致）
        this.db.prepare('UPDATE users_credits SET balance = balance + ?, updated_at = ? WHERE user_id = ?')
          .bind(creditsGranted, now, userId),
        // 4) recordLedger（与 grant 一致）
        this.db.prepare('INSERT INTO credits_ledger (user_id, delta, reason, ref_type, ref_id, created_at) VALUES (?,?,?,?,?,?)')
          .bind(userId, creditsGranted, 'stars_purchase', 'stars', chargeId, now),
      ]);
      return { inserted: true };
    } catch (e) {
      const msg = String((e && e.message) || e);
      // 重复 charge_id 触发唯一约束 → 视为已处理，不二次发放
      if (/UNIQUE|unique|constraint|tg_payment_charge_id/i.test(msg)) {
        return { inserted: false, duplicate: true };
      }
      throw e;
    }
  }

  async getPaymentHistory(userId, limit = 50) {
    const rows = await this.db
      .prepare(
        'SELECT id, user_id, tg_payment_charge_id, provider, stars, credits_granted, status, created_at FROM payments_stars WHERE user_id = ? ORDER BY id DESC LIMIT ?'
      )
      .bind(userId, limit)
      .all();
    return rows.results ?? [];
  }

  async getRecentPayments(limit = 20) {
    const rows = await this.db
      .prepare(
        'SELECT id, user_id, tg_payment_charge_id, provider, stars, credits_granted, status, created_at FROM payments_stars ORDER BY id DESC LIMIT ?'
      )
      .bind(limit)
      .all();
    return rows.results ?? [];
  }

  async countPayments() {
    const row = await this.db.prepare('SELECT COUNT(*) AS c FROM payments_stars').first();
    return row ? row.c : 0;
  }
}

// ── HTTP 工具 ──────────────────────────────────────────────
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

// 验签并取 user_id（复用 P2 verify.js）
async function authUser(initData, env) {
  const v = await verifyInitData(initData, env.BOT_TOKEN);
  if (!v.valid) return { ok: false, status: 401, error: v.reason };
  const userId = getUserIdFromInitData(initData);
  if (!userId) return { ok: false, status: 401, error: 'no_user_id' };
  return { ok: true, userId };
}

// ── 各端点 ─────────────────────────────────────────────────
// Webhook：Telegram Stars 回调（pre_checkout / successful_payment）
async function handleWebhook(request, env) {
  // 1) webhook 签名校验（setWebhook 时设置的 secret_token）
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return json({ error: 'bad_json' }, 400);
  }

  // 2) pre_checkout_query：必须应答 ok（此时尚未扣款，只做放行；商品为功能解锁积分包）
  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query;
    // Telegram webhook 支持"以方法作为响应体"：直接返回 answerPreCheckoutQuery
    return json({ method: 'answerPreCheckoutQuery', pre_checkout_query_id: pcq.id, ok: true });
  }

  // 3) successful_payment：记录 + 原子发积分（幂等）
  const msg = update.message;
  if (msg && msg.successful_payment) {
    const sp = msg.successful_payment;
    const chargeId = sp.telegram_payment_charge_id; // 官方唯一支付号
    const stars = sp.total_amount;                  // XTR：金额即为 Stars 数
    const productId = sp.invoice_payload;           // 我们下单时填的 productId
    const userId = String((msg.from && msg.from.id) || '');
    if (!chargeId) return json({ ok: false, error: 'missing_charge_id' }, 200);

    const store = new D1PaymentsStore(env.DB);
    const res = await processSuccessfulPayment(store, { userId, chargeId, stars, productId });
    if (!res.ok) {
      // 未知商品：不发放积分。已回 200 让 Telegram 收下（不再重试），仅留痕于日志。
      return json({ ok: false, error: res.reason }, 200);
    }
    return json({ ok: true, duplicate: !!res.duplicate, creditsGranted: res.creditsGranted });
  }

  // 其它更新（普通消息等）忽略
  return json({ ok: true });
}

// 创建发票：经 initData 验签 → 调 Bot API createInvoiceLink（XTR / Stars）→ 返回链接
async function handleInvoice(body, env) {
  const a = await authUser(body.initData, env);
  if (!a.ok) return json({ error: a.error }, a.status);

  const productId = body.productId;
  const product = STARS_PRODUCTS[productId];
  if (!product) return json({ error: 'unknown_product' }, 400);

  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/createInvoiceLink`;
  const payload = {
    title: product.title,
    description: product.description,
    payload: productId,            // 回传作为 invoice_payload，webhook 据此发积分
    provider_token: '',            // XTR（Stars）必须为空
    currency: 'XTR',
    prices: [{ label: product.title, amount: product.stars }],
  };
  let data;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    data = await resp.json();
  } catch (e) {
    return json({ error: 'invoice_create_failed', detail: String(e && e.message) }, 502);
  }
  if (!data || !data.ok) {
    return json({ error: 'invoice_create_failed', detail: data && data.description }, 502);
  }
  return json({
    invoiceLink: data.result,
    productId,
    stars: product.stars,
    credits: product.credits,
  });
}

// 历史：经 initData 验签
async function handleHistory(initData, env) {
  const a = await authUser(initData, env);
  if (!a.ok) return json({ error: a.error }, a.status);
  const store = new D1PaymentsStore(env.DB);
  const history = await store.getPaymentHistory(a.userId, 50);
  return json({ history });
}

// 管理对账：ADMIN_SECRET 门禁
async function handleVerify(request, env) {
  const provided =
    request.headers.get('x-admin-secret') ||
    new URL(request.url).searchParams.get('adminSecret');
  if (!env.ADMIN_SECRET || provided !== env.ADMIN_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }
  const store = new D1PaymentsStore(env.DB);
  const total = await store.countPayments();
  const recent = await store.getRecentPayments(20);
  return json({ ok: true, total, recent });
}

// ── 平台对账：聚合收到 Stars 总额 / 兑换积分总量 / 笔数（ADMIN_SECRET 门禁）──
async function requireAdmin(request, env) {
  const provided =
    request.headers.get('x-admin-secret') ||
    new URL(request.url).searchParams.get('adminSecret');
  if (!env.ADMIN_SECRET || provided !== env.ADMIN_SECRET) {
    return { ok: false };
  }
  return { ok: true };
}

async function handleAdminSummary(request, env) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return json({ error: 'forbidden' }, 403);
  const store = new D1PaymentsStore(env.DB);
  const total = await store.countPayments();
  const agg = await env.DB
    .prepare(
      'SELECT COALESCE(SUM(stars),0) AS stars, COALESCE(SUM(credits_granted),0) AS credits FROM payments_stars'
    )
    .first();
  const recent = await store.getRecentPayments(20);
  return json({
    ok: true,
    totalPayments: total,
    totalStarsReceived: agg ? agg.stars : 0,
    totalCreditsGranted: agg ? agg.credits : 0,
    recent,
  });
}

// 平台对账页面（HTML 仪表盘，ADMIN_SECRET 门禁）—— 直接回答"管理收到的 Stars"
async function handleAdminPage(request, env) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return new Response('403 Forbidden', { status: 403 });
  const store = new D1PaymentsStore(env.DB);
  const total = await store.countPayments();
  const agg = await env.DB
    .prepare(
      'SELECT COALESCE(SUM(stars),0) AS stars, COALESCE(SUM(credits_granted),0) AS credits FROM payments_stars'
    )
    .first();
  const recent = await store.getRecentPayments(20);
  const rows = (recent || [])
    .map(
      (r) =>
        `<tr><td>${String(r.user_id).replace(/[<>&]/g, '')}</td><td>${r.stars}</td><td>${r.credits_granted}</td><td>${r.status}</td><td>${new Date(r.created_at).toISOString()}</td></tr>`
    )
    .join('');
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>Stars 对账</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#f7f8fa;color:#222}
.kpi{display:flex;gap:1rem;margin-bottom:1rem}.kpi div{background:#fff;border-radius:12px;padding:1rem 1.5rem;flex:1;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.kpi b{display:block;font-size:1.8rem}.kpi span{color:#888;font-size:.85rem}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
th,td{padding:.7rem 1rem;text-align:left;border-bottom:1px solid #eee;font-size:.9rem}</style></head>
<body><h1>Telegram Stars 对账（平台）</h1>
<div class="kpi">
<div><b>${total}</b><span>总笔数</span></div>
<div><b>${agg ? agg.stars : 0}</b><span>收到 Stars 总额</span></div>
<div><b>${agg ? agg.credits : 0}</b><span>兑换积分总量</span></div>
</div>
<div><h3>最近 20 笔</h3>
<table><thead><tr><th>用户</th><th>Stars</th><th>积分</th><th>状态</th><th>时间(UTC)</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">暂无记录</td></tr>'}</tbody></table></div>
<p style="color:#888;font-size:.8rem">内部积分 ≠ Stars ≠ 法币；不可提现、不可转账、不可交易。数据仅平台可见。</p>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── 路由 ───────────────────────────────────────────────────
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

  if (path === '/payments/webhook') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    return handleWebhook(request, env);
  }

  if (path === '/payments/invoice') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    const body = await readJson(request);
    return handleInvoice(body, env);
  }

  if (path === '/payments/history') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    const initData = url.searchParams.get('initData') || (await readJson(request)).initData || '';
    return handleHistory(initData, env);
  }

  if (path === '/payments/verify') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleVerify(request, env);
  }

  // 平台对账（P7 Stars 管理落地）：ADMIN_SECRET 门禁
  if (path === '/admin/summary') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleAdminSummary(request, env);
  }
  if (path === '/admin') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleAdminPage(request, env);
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env);
  },
};
