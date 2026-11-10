/**
 * inmemory-payments-store.js — payments-core 的纯内存 Store 实现（仅用于本地测试 / 本地 dev）
 *
 * 生产环境用 payments-worker.js 内的 D1PaymentsStore（Cloudflare D1）。
 *
 * 关键点：积分发放**直接复用 P2 的 ledger-core.grant**（不重造轮子），
 * 支付行与积分发放在单线程内存里天然顺序执行，幂等靠 payments Map 的 charge_id 去重。
 */
import { grant } from '../shared/ledger-core.js';

export class InMemoryPaymentsStore {
  constructor() {
    this.balances = new Map();   // userId -> balance (int)
    this.ledger = [];            // {id,user_id,delta,reason,ref_type,ref_id,created_at}
    this.payments = new Map();   // tg_payment_charge_id -> row
    this._lid = 1;
  }

  // ── ledger-core Store 接口（供 grant() 使用）──────────────
  async ensureUser(userId) {
    if (!this.balances.has(userId)) this.balances.set(userId, 0);
  }
  async getBalance(userId) {
    return this.balances.get(userId) ?? 0;
  }
  // 原子调整：读+写在同一个无 await 同步块内，模拟 D1 的原子 UPDATE ... WHERE balance+delta>=0
  async atomicAdjust(userId, delta) {
    const cur = this.balances.get(userId) ?? 0;
    const next = cur + delta;
    if (next < 0) return false;          // 余额不足，整笔拒绝
    this.balances.set(userId, next);
    return true;
  }
  async recordLedger({ userId, delta, reason, refType, refId }) {
    this.ledger.push({
      id: this._lid++,
      user_id: userId, delta, reason,
      ref_type: refType ?? null,
      ref_id: refId ?? null,
      created_at: Date.now(),
    });
  }
  async getLedger(userId, limit = 50) {
    return this.ledger
      .filter((r) => r.user_id === userId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }

  // ── payments 接口 ────────────────────────────────────────
  /**
   * 原子记录支付 + 发放积分（幂等）。
   * 内存实现：先按 charge_id 去重；未重复则调用 P2 ledger-core.grant 发放积分，
   * 再写入支付行。grant 只用正整数，不会失败；两步在同一事件循环内完成。
   */
  async recordPaymentAndGrantTxn({ userId, chargeId, stars, creditsGranted }) {
    if (this.payments.has(chargeId)) {
      return { inserted: false, duplicate: true };
    }
    // 复用 P2 统一积分账本的 grant：写 users_credits + credits_ledger
    await grant(this, {
      userId,
      amount: creditsGranted,
      reason: 'stars_purchase',
      refType: 'stars',
      refId: chargeId,
    });
    this.payments.set(chargeId, {
      id: this.payments.size + 1,
      user_id: userId,
      tg_payment_charge_id: chargeId,
      provider: 'telegram_stars',
      stars,
      credits_granted: creditsGranted,
      status: 'completed',
      created_at: Date.now(),
    });
    return { inserted: true };
  }

  async getPaymentHistory(userId, limit = 50) {
    return [...this.payments.values()]
      .filter((p) => p.user_id === userId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }

  async getRecentPayments(limit = 20) {
    return [...this.payments.values()]
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }

  async countPayments() {
    return this.payments.size;
  }

  // ── Pro 订阅（内存实现，仅测试/dev 用）──────────────────
  grantPro({ userId, chargeId, productId, stars, expiresAt }) {
    if (this.payments.has(chargeId)) return { inserted: false, duplicate: true };
    this.payments.set(chargeId, {
      id: this.payments.size + 1,
      user_id: userId,
      tg_payment_charge_id: chargeId,
      provider: 'telegram_stars',
      stars,
      credits_granted: 0,
      status: 'completed',
      created_at: Date.now(),
    });
    this.pro = this.pro || new Map();
    // charge_id 记录「是哪笔支付授予的订阅」，退款时按此精确撤销（与 D1 版一致）
    this.pro.set(userId, { product_id: productId, charge_id: chargeId, stars, expires_at: expiresAt });
    return { inserted: true };
  }

  /**
   * 按 charge_id 精确撤销订阅。用户若随后买了更长订阅覆盖了本行，退旧单不会误撤当前有效订阅。
   * @returns {boolean} 是否真的撤销了一行
   */
  revokeProByCharge(chargeId) {
    if (!this.pro) return false;
    for (const [uid, row] of this.pro) {
      if (row.charge_id === chargeId) {
        this.pro.delete(uid);
        return true;
      }
    }
    return false;
  }

  markPaymentRefunded(chargeId) {
    const row = this.payments.get(chargeId);
    if (!row) return false;
    row.status = 'refunded';
    return true;
  }

  getPaymentByChargeId(chargeId) {
    return this.payments.get(chargeId) || null;
  }

  getProStatus(userId) {
    const r = this.pro && this.pro.get(userId);
    if (!r) return { pro: false };
    if (r.expires_at && r.expires_at <= Date.now()) return { pro: false, expired: true };
    return { pro: true, productId: r.product_id, expiresAt: r.expires_at };
  }
}
