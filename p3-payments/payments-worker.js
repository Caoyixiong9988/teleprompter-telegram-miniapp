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
 *   GET  /payments/pro-status 经 initData 验签；Pro 权益权威来源（退款/到期后返回 false）
 *   GET  /payments/verify    ADMIN_SECRET 门禁；运营对账
 *   GET  /admin              ADMIN_SECRET 门禁；Stars 对账 + 退款操作界面（含退款按钮）
 *   GET  /admin/summary      ADMIN_SECRET 门禁；对账 JSON
 *   GET  /admin/refunds      ADMIN_SECRET 门禁；可退款交易列表 JSON
 *   POST /admin/refund       ADMIN_SECRET 门禁；全额退款并原子撤销 Pro / 扣回积分
 *
 * 合规：Stars 只经 Telegram 官方；积分仅平台发放、用户只消耗；无 P2P 转账 / 无赌博。
 * 退款铁律：必须等 Bot API refundStarPayment 返回 ok:true，才写本地撤销；
 *          平台没退钱就先撤权益，是最容易引发客诉的顺序错误。
 *
 * secret（占位，部署时填）：BOT_TOKEN、ADMIN_SECRET、WEBHOOK_SECRET（setWebhook 的 secret_token）
 */

import { verifyInitData, getUserIdFromInitData } from '../shared/verify.js';
import {
  processSuccessfulPayment,
  STARS_PRODUCTS,
  getProduct,
  evaluateRefundEligibility,
  REFUND_WINDOW_DAYS,
  revokeAmount,
} from './payments-core.js';

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

  /**
   * 原子记录 Pro 订阅支付 + 写入/更新 users_pro（幂等；charge_id 唯一约束防重复）。
   * Pro 不发放积分，仅写订阅行（到期前有效）。
   */
  async grantPro({ userId, chargeId, productId, stars, expiresAt }) {
    const now = Date.now();
    try {
      await this.db.batch([
        this.db.prepare(
          'INSERT INTO payments_stars (user_id, tg_payment_charge_id, provider, stars, credits_granted, status, created_at) VALUES (?,?,?,?,?,?,?)'
        ).bind(userId, chargeId, 'telegram_stars', stars, 0, 'completed', now),
        this.db.prepare(
          'INSERT INTO users_pro (user_id, product_id, charge_id, stars, expires_at, created_at) VALUES (?,?,?,?,?,?) ' +
          'ON CONFLICT(user_id) DO UPDATE SET product_id=excluded.product_id, charge_id=excluded.charge_id, stars=excluded.stars, expires_at=excluded.expires_at, created_at=excluded.created_at'
        ).bind(userId, productId, chargeId, stars, expiresAt, now),
      ]);
      return { inserted: true };
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/UNIQUE|unique|constraint|tg_payment_charge_id/i.test(msg)) {
        return { inserted: false, duplicate: true };
      }
      throw e;
    }
  }

  async getProStatus(userId) {
    const row = await this.db
      .prepare('SELECT user_id, product_id, expires_at FROM users_pro WHERE user_id = ?')
      .bind(userId)
      .first();
    if (!row) return { pro: false };
    const now = Date.now();
    if (row.expires_at && row.expires_at <= now) return { pro: false, expired: true };
    return { pro: true, productId: row.product_id, expiresAt: row.expires_at };
  }

  // ── 退款相关 ──────────────────────────────────────────────
  async getPaymentByChargeId(chargeId) {
    const row = await this.db
      .prepare(
        'SELECT id, user_id, tg_payment_charge_id, stars, credits_granted, status, created_at FROM payments_stars WHERE tg_payment_charge_id = ?'
      )
      .bind(chargeId)
      .first();
    return row || null;
  }

  async getRefundByChargeId(chargeId) {
    const row = await this.db
      .prepare('SELECT id FROM refunds WHERE tg_payment_charge_id = ?').bind(chargeId).first();
    return row || null;
  }

  /**
   * 退款本地落账（单个 D1 batch，原子）。
   * 调用前必须已确认 Bot API refundStarPayment 返回 ok:true —— 平台没退钱，绝不撤权益。
   * Pro 按 charge_id 精确撤销；积分只扣回仍在余额里的部分，不追成负数、不产生用户间转账。
   */
  async recordRefundTxn({ payment, forced }) {
    const now = Date.now();
    const balance = await this.getBalance(payment.user_id);
    const creditsToRevoke = revokeAmount(balance, payment.credits_granted);
    const proRow = await this.db
      .prepare('SELECT user_id FROM users_pro WHERE charge_id = ?')
      .bind(payment.tg_payment_charge_id)
      .first();
    const proRevoked = proRow ? 1 : 0;

    const stmts = [
      this.db.prepare("UPDATE payments_stars SET status = 'refunded' WHERE tg_payment_charge_id = ?")
        .bind(payment.tg_payment_charge_id),
      this.db.prepare(
        'INSERT INTO refunds (user_id, tg_payment_charge_id, stars, credits_revoked, pro_revoked, forced, created_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(payment.user_id, payment.tg_payment_charge_id, payment.stars, creditsToRevoke, proRevoked, forced ? 1 : 0, now),
      // 精确按 charge_id 撤销：用户若随后买了更长订阅覆盖了 users_pro 行，退旧单不会误撤当前有效订阅
      this.db.prepare('DELETE FROM users_pro WHERE charge_id = ?').bind(payment.tg_payment_charge_id),
    ];
    if (creditsToRevoke > 0) {
      stmts.push(
        this.db.prepare('UPDATE users_credits SET balance = balance - ?, updated_at = ? WHERE user_id = ?')
          .bind(creditsToRevoke, now, payment.user_id),
        this.db.prepare('INSERT INTO credits_ledger (user_id, delta, reason, ref_type, ref_id, created_at) VALUES (?,?,?,?,?,?)')
          .bind(payment.user_id, -creditsToRevoke, 'refund_revoke', 'refund', payment.tg_payment_charge_id, now)
      );
    }
    try {
      await this.db.batch(stmts);
      return { ok: true, creditsRevoked: creditsToRevoke, proRevoked: !!proRevoked };
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/UNIQUE|unique|constraint/i.test(msg)) return { ok: false, duplicate: true };
      throw e;
    }
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

    // Pro 订阅商品：写 users_pro（到期前有效），不发放积分
    const product = getProduct(productId);
    if (product && product.kind === 'pro') {
      const store = new D1PaymentsStore(env.DB);
      const expiresAt = Date.now() + (productId === 'pro_year' ? 365 : 30) * 24 * 3600 * 1000;
      const res = await store.grantPro({ userId, chargeId, productId, stars, expiresAt });
      return json({ ok: true, pro: true, duplicate: !!res.duplicate, productId });
    }

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

// ── 退款（管理员操作）──────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 可退款交易列表（JSON，便于脚本核对与自动化测试）
async function handleRefundList(request, env) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return json({ error: 'forbidden' }, 403);
  const store = new D1PaymentsStore(env.DB);
  const recent = await store.getRecentPayments(50);
  const now = Date.now();
  const items = (recent || []).map((r) => {
    const e = evaluateRefundEligibility({ createdAt: r.created_at, now });
    return {
      chargeId: r.tg_payment_charge_id,
      userId: r.user_id,
      stars: r.stars,
      creditsGranted: r.credits_granted,
      status: r.status,
      createdAt: r.created_at,
      refundable: r.status !== 'refunded' && e.ok,
      expired: e.reason === 'refund_window_expired',
      daysLeft: e.daysLeft ?? 0,
    };
  });
  return json({ ok: true, windowDays: REFUND_WINDOW_DAYS, items });
}

/**
 * 执行全额退款。顺序不可调换：
 *   1) 鉴权 → 2) 查单 / 幂等 / 14 天窗口 → 3) 调 Bot API refundStarPayment
 *   4) 只有第 3 步 ok:true 才 recordRefundTxn 撤销 Pro + 扣回积分 + 写审计
 * Telegram Stars 销售为 final，平台不会自动退款；也没有 chargeback webhook，
 * 因此「同意退款」这件事只能在后台由管理员点按钮触发，这里就是那个落点。
 */
async function handleRefund(request, env) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return json({ error: 'forbidden' }, 403);

  const body = await readJson(request);
  const chargeId = String(body.chargeId || '').trim();
  const force = body.force === true;
  if (!chargeId) return json({ error: 'missing_charge_id' }, 400);
  if (chargeId.length > 256) return json({ error: 'invalid_charge_id' }, 400);

  const store = new D1PaymentsStore(env.DB);
  const payment = await store.getPaymentByChargeId(chargeId);
  if (!payment) return json({ error: 'payment_not_found' }, 404);
  if (payment.status === 'refunded' || (await store.getRefundByChargeId(chargeId))) {
    return json({ error: 'already_refunded' }, 409);
  }
  const e = evaluateRefundEligibility({ createdAt: payment.created_at, now: Date.now(), force });
  if (!e.ok) return json({ error: e.reason, windowDays: REFUND_WINDOW_DAYS }, 409);

  const userId = Number(payment.user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return json({ error: 'invalid_user_id' }, 400);
  if (!env.BOT_TOKEN || env.BOT_TOKEN === '__BOT_TOKEN_PLACEHOLDER__') {
    return json({ error: 'bot_token_not_configured' }, 503);
  }

  // 1) 让 Telegram 真的退钱。任何失败都不改本地状态。
  let data;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/refundStarPayment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: userId, telegram_payment_charge_id: chargeId }),
    });
    data = await resp.json();
  } catch (err) {
    return json({ error: 'refund_api_failed', detail: String((err && err.message) || err) }, 502);
  }
  if (!data || !data.ok) {
    return json({ error: 'refund_rejected', detail: data && data.description }, 502);
  }

  // 2) 平台已确认退款，才原子撤销本地 Pro 权益与积分
  const res = await store.recordRefundTxn({ payment, forced: !!e.forced });
  if (!res.ok) return json({ error: 'already_refunded' }, 409);
  return json({
    ok: true,
    chargeId,
    userId: payment.user_id,
    stars: payment.stars,
    creditsRevoked: res.creditsRevoked,
    proRevoked: res.proRevoked,
    forced: !!e.forced,
  });
}

// 平台对账 + 退款操作页面（HTML 仪表盘，ADMIN_SECRET 门禁）
async function handleAdminPage(request, env) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return new Response('403 Forbidden', { status: 403 });
  const provided =
    request.headers.get('x-admin-secret') ||
    new URL(request.url).searchParams.get('adminSecret') || '';
  const adminLiteral = JSON.stringify(provided).replace(/</g, '\\u003c');

  const store = new D1PaymentsStore(env.DB);
  const total = await store.countPayments();
  const agg = await env.DB
    .prepare(
      'SELECT COALESCE(SUM(stars),0) AS stars, COALESCE(SUM(credits_granted),0) AS credits FROM payments_stars'
    )
    .first();
  const recent = await store.getRecentPayments(20);
  const now = Date.now();
  const rows = (recent || []).map((r) => {
    const e = evaluateRefundEligibility({ createdAt: r.created_at, now });
    const refunded = r.status === 'refunded';
    let action;
    if (refunded) {
      action = '<span class="done">已退款</span>';
    } else {
      const tag = e.reason === 'refund_window_expired'
        ? '<span class="warn">超 ' + REFUND_WINDOW_DAYS + ' 天</span> ' : '';
      action = tag + '<button class="rf" data-charge="' + esc(r.tg_payment_charge_id) + '">退款</button>';
    }
    return '<tr><td>' + esc(r.user_id) + '</td><td>' + esc(r.stars) + '</td><td>' + esc(r.credits_granted) +
      '</td><td>' + esc(r.status) + '</td><td>' + esc(new Date(r.created_at).toISOString()) +
      '</td><td>' + (e.daysLeft ?? 0) + '</td><td>' + action + '</td></tr>';
  }).join('');

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Stars 对账与退款</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#f7f8fa;color:#222;max-width:1100px}
.kpi{display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap}
.kpi div{background:#fff;border-radius:12px;padding:1rem 1.5rem;flex:1;min-width:140px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.kpi b{display:block;font-size:1.8rem}.kpi span{color:#888;font-size:.85rem}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
th,td{padding:.7rem .8rem;text-align:left;border-bottom:1px solid #eee;font-size:.85rem;word-break:break-all}
.note{background:#fff8e6;border:1px solid #f0d9a0;border-radius:10px;padding:.8rem 1rem;font-size:.85rem;line-height:1.6;margin-bottom:1rem}
button.rf{background:#c0392b;color:#fff;border:0;border-radius:6px;padding:.35rem .8rem;cursor:pointer;font-size:.85rem}
button.rf:disabled{background:#aaa;cursor:default}
.done{color:#1f9d55}.warn{color:#b26a00;font-size:.8rem}
#msg{margin:.8rem 0;font-size:.9rem;min-height:1.2em}
label.force{font-size:.85rem;display:inline-flex;gap:.4rem;align-items:center}</style></head>
<body><h1>Telegram Stars 对账与退款</h1>
<div class="kpi">
<div><b>${total}</b><span>总笔数</span></div>
<div><b>${agg ? agg.stars : 0}</b><span>收到 Stars 总额</span></div>
<div><b>${agg ? agg.credits : 0}</b><span>兑换积分总量</span></div>
</div>
<div class="note">
退款为<b>全额</b>、不可撤销。点击后先调用 Telegram <code>refundStarPayment</code>；<b>只有平台确认退款成功</b>，才会撤销该笔授予的 Pro 权益、扣回仍未使用的积分，并写入退款审计。<br>
默认仅允许购买后 ${REFUND_WINDOW_DAYS} 天内退款；超过窗口需勾选下方「强制」并会留痕。客户通过 <code>/paysupport</code> 申请后，请在此页面按支付号操作。<br>
管理密钥仅本次页面会话有效，地址栏已自动清除；刷新请重新带 <code>?adminSecret=...</code> 打开。用完请关闭页面。
</div>
<div id="msg"></div>
<label class="force"><input type="checkbox" id="forceChk"> 强制退款（超过 ${REFUND_WINDOW_DAYS} 天，留痕）</label>
<h3>最近 20 笔</h3>
<table><thead><tr><th>用户 ID</th><th>Stars</th><th>积分</th><th>状态</th><th>时间(UTC)</th><th>剩余天数</th><th>操作</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7">暂无记录</td></tr>'}</tbody></table>
<p style="color:#888;font-size:.8rem">内部积分 ≠ Stars ≠ 法币；不可提现、不可转账、不可交易。数据仅平台可见。退款后用户端 Pro 状态由 /payments/pro-status 自动降为 false。</p>
<script>
var ADMIN = ${adminLiteral};
try { history.replaceState(null, '', location.pathname); } catch (e) {}
var msg = document.getElementById('msg');
document.addEventListener('click', async function (ev) {
  var btn = ev.target.closest ? ev.target.closest('button.rf') : null;
  if (!btn) return;
  var chargeId = btn.getAttribute('data-charge');
  var force = document.getElementById('forceChk').checked;
  if (!confirm('确认全额退还这笔 Stars 支付？\\n支付号：' + chargeId +
    '\\n将同时撤销该笔授予的 Pro 权益与未使用积分，且不可撤销。' +
    (force ? '\\n【强制】已超过 ' + ${REFUND_WINDOW_DAYS} + ' 天窗口，将写入审计。' : ''))) return;
  btn.disabled = true;
  msg.textContent = '正在请求 Telegram 退款…';
  try {
    var r = await fetch('/admin/refund', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': ADMIN },
      body: JSON.stringify({ chargeId: chargeId, force: force })
    });
    var d = await r.json();
    if (!r.ok || !d.ok) {
      msg.style.color = '#c0392b';
      msg.textContent = '退款失败：' + (d.error || r.status) + (d.detail ? ' — ' + d.detail : '');
      btn.disabled = false;
      return;
    }
    msg.style.color = '#1f9d55';
    msg.textContent = '退款成功：' + d.stars + ' Stars｜撤销 Pro：' + (d.proRevoked ? '是' : '否') +
      '｜扣回积分：' + d.creditsRevoked + (d.forced ? '｜强制留痕' : '');
    btn.outerHTML = '<span class="done">已退款</span>';
  } catch (err) {
    msg.style.color = '#c0392b';
    msg.textContent = '网络错误：' + (err && err.message ? err.message : err);
    btn.disabled = false;
  }
});
</script>
</body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
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

  if (path === '/payments/pro-status') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    const initData = url.searchParams.get('initData') || (await readJson(request)).initData || '';
    const a = await authUser(initData, env);
    if (!a.ok) return json({ error: a.error }, a.status);
    const store = new D1PaymentsStore(env.DB);
    return json(await store.getProStatus(a.userId));
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
  if (path === '/admin/refunds') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return handleRefundList(request, env);
  }
  if (path === '/admin/refund') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    return handleRefund(request, env);
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env);
  },
};
