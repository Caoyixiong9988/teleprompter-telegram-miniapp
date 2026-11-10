/**
 * payments-core.js — P3 Telegram Stars 支付账本「纯逻辑」核心（不依赖 Cloudflare）
 *
 * 与 P2 的 ledger-core.js 同构：纯函数 / 纯逻辑，依赖一个 `store` 适配器。
 * 生产用 D1 适配器（见 payments-worker.js 的 D1PaymentsStore）；测试用
 * inmemory-payments-store.js。
 *
 * 合规红线（见功能清单第 7/8 节，与 P2 一致，凌驾一切）：
 *   - Stars 只经 Telegram 官方支付流转，绝不经手法定货币 / 加密货币。
 *   - credits 是平台发放的内部积分（≠ Stars、≠ 法币），只由平台发放、用户只能消耗。
 *   - 绝不实现点对点转账（transfer）、绝不赌博。
 *   本模块刻意不提供任何"转账 / 提现 / 押注"能力。
 *
 * ── Store 接口（由 adapter 实现）─────────────────────────────
 *   recordPaymentAndGrantTxn({userId, chargeId, stars, creditsGranted})
 *        -> Promise<{inserted:boolean, duplicate?:boolean}>
 *           MUST be atomic: 支付行 + 积分发放（写 users_credits / credits_ledger）
 *           在同一事务内完成；tg_payment_charge_id 重复时返回 {duplicate:true} 且不二次发放。
 *   getPaymentHistory(userId, limit=50)  -> Promise<Array>
 *   getRecentPayments(limit=20)          -> Promise<Array>   （运营 / admin 用）
 *   countPayments()                      -> Promise<number> （admin 用）
 *   以及 ledger-core 的 Store 接口（ensureUser/getBalance/atomicAdjust/recordLedger/getLedger）
 *   —— 因为积分发放要复用 ledger-core 的 grant 语义。
 */

// 商品目录：每个 productId 对应固定的 Stars 价 + 发放积分数。
// 注意：标题 / 描述只谈"功能解锁 / 创作额度"，不写效果承诺或收益暗示。
export const STARS_PRODUCTS = {
  credits_starter: {
    stars: 50,
    credits: 550,
    title: 'Starter Pack',
    description: '550 credits — unlock Pro teleprompter themes & watermark-free export',
  },
  credits_pro: {
    stars: 200,
    credits: 2400,
    title: 'Pro Pack',
    description: '2400 credits — extended scripts, cloud sync, priority generation',
  },
  credits_ultra: {
    stars: 500,
    credits: 6500,
    title: 'Ultra Pack',
    description: '6500 credits — heavy creator usage',
  },
  // Pro 订阅（与前端 CONFIG.PRO_PRICE_*_STARS 对齐）：购买后写 users_pro，到期前解锁 Pro 权益（如去水印高清导出）。不发放积分。
  pro_month: {
    stars: 400,
    credits: 0,
    kind: 'pro',
    title: 'Pro Monthly',
    description: 'Pro membership — watermark-free high-res card export, voice-follow, cloud sync, remote control, unlimited scripts, caption export (30 days)',
  },
  pro_year: {
    stars: 4000,
    credits: 0,
    kind: 'pro',
    title: 'Pro Yearly',
    description: 'Pro membership — watermark-free high-res card export, voice-follow, cloud sync, remote control, unlimited scripts, caption export (365 days)',
  },
};

/**
 * 取商品定义；未知 productId 返回 null（Webhook 遇到未知 payload 不发放积分）。
 */
export function getProduct(productId) {
  return STARS_PRODUCTS[productId] || null;
}

/**
 * 处理一笔成功的 Telegram Stars 支付（纯逻辑，幂等由 store 保证）。
 * @param store  实现了 Store 接口的适配器（D1 或内存）
 * @param {{userId:string, chargeId:string, stars:number, productId:string}} params
 * @returns {Promise<{ok:boolean, reason?:string, duplicate?:boolean, creditsGranted:number}>}
 */
export async function processSuccessfulPayment(store, { userId, chargeId, stars, productId }) {
  const product = getProduct(productId);
  if (!product) {
    // 未知商品：不发放积分。Worker 层会回 200 让 Telegram 收下（不重试），仅记日志。
    return { ok: false, reason: 'unknown_product', creditsGranted: 0 };
  }
  const creditsGranted = product.credits;
  const res = await store.recordPaymentAndGrantTxn({ userId, chargeId, stars, creditsGranted });
  return { ok: true, duplicate: !!res.duplicate, creditsGranted };
}

// ── 退款资格（纯逻辑，不依赖 Cloudflare / DB / 网络，便于单测）────────────
// 与五语 paidNotice 的承诺一致：购买后 14 天内可申请全额退款。
// 超期并非绝对禁止：管理员可显式 force（处理客诉），但会写入 refunds.forced=1 留痕。
export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WINDOW_MS = REFUND_WINDOW_DAYS * 24 * 3600 * 1000;

/**
 * @param {{createdAt:number, now?:number, force?:boolean}} params
 * @returns {{ok:boolean, reason?:string, forced?:boolean, daysLeft?:number}}
 */
export function evaluateRefundEligibility({ createdAt, now = Date.now(), force = false }) {
  if (!Number.isFinite(createdAt) || createdAt <= 0 || now < createdAt) {
    return { ok: false, reason: 'invalid_created_at' };
  }
  const age = now - createdAt;
  const daysLeft = Math.max(0, Math.ceil((REFUND_WINDOW_MS - age) / (24 * 3600 * 1000)));
  if (age > REFUND_WINDOW_MS) {
    if (!force) return { ok: false, reason: 'refund_window_expired', daysLeft: 0, days: REFUND_WINDOW_DAYS };
    return { ok: true, forced: true, daysLeft: 0 };
  }
  return { ok: true, forced: false, daysLeft };
}

/**
 * 退款时应扣回的内部积分数：不超过当初发放量，也不让余额变负（用户可能已消耗）。
 * 纯函数，供 D1 事务与内存 store 共用。
 */
export function revokeAmount(balance, creditsGranted) {
  const b = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const g = Number.isFinite(creditsGranted) && creditsGranted > 0 ? creditsGranted : 0;
  return Math.min(b, g);
}
