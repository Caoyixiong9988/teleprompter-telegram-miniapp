/**
 * inmemory-bounty-store.js — bounty-core 的纯内存 Store 实现（仅用于本地测试 / 本地 dev）
 *
 * 生产环境用 bounty-worker.js 内的 D1BountyStore（Cloudflare D1）。
 *
 * 关键点：积分托管/发放**直接复用 P2 的 ledger-core.consume / grant**（不重造轮子），
 * 因此本 Store 同时实现 ledger-core 与 bounty 两套接口。
 */
import { grant, consume, getBalance, getLedger } from '../shared/ledger-core.js';

export class InMemoryBountyStore {
  constructor() {
    // ledger-core 接口
    this.balances = new Map();
    this.ledger = [];
    this._lid = 1;
    // bounty 接口
    this.bounties = new Map();   // id -> {id,owner_user_id,title,script_text,reward_credits,status,created_at,deadline}
    this.submissions = [];       // {id,bounty_id,author_user_id,revised_text,status,created_at}
    this._bid = 1;
    this._sid = 1;
  }

  // ── ledger-core 接口（供 grant/consume 使用）──────────────
  async ensureUser(userId) {
    if (!this.balances.has(userId)) this.balances.set(userId, 0);
  }
  async getBalance(userId) {
    return this.balances.get(userId) ?? 0;
  }
  async atomicAdjust(userId, delta) {
    const cur = this.balances.get(userId) ?? 0;
    const next = cur + delta;
    if (next < 0) return false;
    this.balances.set(userId, next);
    return true;
  }
  async recordLedger({ userId, delta, reason, refType, refId }) {
    this.ledger.push({ id: this._lid++, user_id: userId, delta, reason, ref_type: refType ?? null, ref_id: refId ?? null, created_at: Date.now() });
  }
  async getLedger(userId, limit = 50) {
    return this.ledger.filter((r) => r.user_id === userId).sort((a, b) => b.id - a.id).slice(0, limit);
  }

  // ── bounty 接口 ──────────────────────────────────────────
  async insertBounty({ ownerUserId, title, scriptText, rewardCredits, deadline }) {
    const id = 'B' + (this._bid++);
    this.bounties.set(id, {
      id, owner_user_id: ownerUserId, title, script_text: scriptText,
      reward_credits: rewardCredits, status: 'open', created_at: Date.now(), deadline: deadline ?? null,
    });
    return id;
  }
  async getBounty(bountyId) {
    return this.bounties.get(bountyId) || null;
  }
  async listOpenBounties({ limit, offset }) {
    return [...this.bounties.values()]
      .filter((b) => b.status === 'open')
      .sort((a, b) => b.created_at - a.created_at)
      .slice(offset, offset + limit);
  }
  async insertSubmission({ bountyId, authorUserId, revisedText }) {
    const id = this._sid++;
    this.submissions.push({ id, bounty_id: bountyId, author_user_id: authorUserId, revised_text: revisedText, status: 'pending', created_at: Date.now() });
    return id;
  }
  async getSubmission(submissionId) {
    return this.submissions.find((s) => s.id === submissionId) || null;
  }
  async listSubmissions(bountyId) {
    return this.submissions.filter((s) => s.bounty_id === bountyId)
      .sort((a, b) => a.created_at - b.created_at);
  }
  async markAwarded({ bountyId, submissionId, winnerUserId }) {
    for (const s of this.submissions) {
      if (s.bounty_id !== bountyId) continue;
      if (s.id === submissionId) s.status = 'accepted';
      else s.status = 'rejected';
    }
  }
  async setBountyStatus(bountyId, status) {
    const b = this.bounties.get(bountyId);
    if (b) b.status = status;
  }
}
