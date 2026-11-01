/**
 * inmemory-store.js — ledger-core 的纯内存 Store 实现（仅用于本地测试）
 * 生产环境用 credits-worker.js 内的 D1Store（Cloudflare D1）。
 */
export class InMemoryStore {
  constructor() {
    this.balances = new Map();   // userId -> balance (int)
    this.ledger = [];            // {id,userId,delta,reason,refType,refId,created_at}
    this._ledgerId = 1;
  }

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
      id: this._ledgerId++,
      userId, delta, reason,
      ref_type: refType ?? null,
      ref_id: refId ?? null,
      created_at: Date.now(),
    });
  }

  async getLedger(userId, limit = 50) {
    return this.ledger
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }
}
