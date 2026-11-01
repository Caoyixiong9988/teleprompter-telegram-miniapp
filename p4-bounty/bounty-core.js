/**
 * bounty-core.js — P4 悬赏改稿「纯逻辑」核心（不依赖 Cloudflare）
 *
 * 复用：
 *   - p2-credits/ledger-core.js ：积分托管/发放语义（consume 托管 escrow、grant 释放奖励）
 *   - p2-credits/verify.js      ：initData 验签（在 worker 层做）
 *
 * 合规红线（凌驾一切，见功能清单 / README）：
 *   - 悬赏 = 任务奖励（task reward）。奖励在创建时由平台托管（escrow），仅当发布者 award 时释放给中标者。
 *   - 绝不实现钱包到钱包的 P2P 转账（transfer）、提现（withdraw）、押注 / 彩票（gamble / lottery）。
 *   - 本模块只调 ledger-core 的 grant / consume：积分只由平台发放，用户只消耗 / 被托管。
 *   本模块刻意不提供任何 transfer / withdraw / bet / predict / fortune 能力。
 *
 * ── Store 接口（由 adapter 实现）─────────────────────────────────
 *   // ledger-core 接口（grant/consume 需要）
 *   ensureUser / getBalance / atomicAdjust / recordLedger / getLedger
 *   // bounty 接口
 *   insertBounty({ownerUserId, title, scriptText, rewardCredits, deadline}) -> Promise<string>  返回 bounty id
 *   getBounty(bountyId) -> Promise<{id,owner_user_id,title,script_text,reward_credits,status,created_at,deadline}|null>
 *   listOpenBounties({limit, offset}) -> Promise<Array>
 *   insertSubmission({bountyId, authorUserId, revisedText}) -> Promise<number>  返回 submission id
 *   getSubmission(submissionId) -> Promise<{id,bounty_id,author_user_id,revised_text,status,created_at}|null>
 *   listSubmissions(bountyId) -> Promise<Array>
 *   markAwarded({bountyId, submissionId, winnerUserId}) -> Promise<void>
 *       将中标 submission 置 accepted，同一 bounty 其余置 rejected
 *   setBountyStatus(bountyId, status) -> Promise<void>
 */

import { grant, consume } from '../p2-credits/ledger-core.js';

// ── 参数校验 ──
function assertPositiveCredits(n) {
  if (!Number.isInteger(n) || n <= 0) {
    const e = new Error('INVALID_AMOUNT');
    e.code = 'INVALID_AMOUNT';
    throw e;
  }
}

/**
 * 发布悬赏（托管 escrow）。
 * 1) 校验 rewardCredits > 0
 * 2) 校验发布者余额充足（consume 内部 atomicAdjust 余额不足即抛 INSUFFICIENT_FUNDS）
 * 3) 平台托管：consume(owner, -reward, 'bounty_escrow')
 * 4) 写入 bounty 行（status='open'）
 *
 * 注意：生产用 D1 时，worker 层应把 (escrow 扣减 SQL + insert bounty) 包进 db.batch() 原子提交；
 * 这里先顺序执行（与 P5 attributeReferral 同风格），保证"扣款成功才写 bounty"的语义。
 *
 * @returns {Promise<{id:string}>}
 */
export async function createBounty(store, { ownerUserId, title, scriptText, rewardCredits, deadline = null }) {
  if (!ownerUserId) throw Object.assign(new Error('INVALID_OWNER'), { code: 'INVALID_OWNER' });
  if (!title || scriptText == null) throw Object.assign(new Error('MISSING_FIELDS'), { code: 'MISSING_FIELDS' });
  assertPositiveCredits(rewardCredits);

  await store.ensureUser(ownerUserId);
  // 平台托管：先把奖励从发布者余额扣到"平台托管"（consume，非 transfer）
  await consume(store, { userId: ownerUserId, amount: rewardCredits, reason: 'bounty_escrow', refType: 'bounty' });
  const id = await store.insertBounty({ ownerUserId, title, scriptText, rewardCredits, deadline });
  return { id };
}

/**
 * 列出开放中的悬赏（分页）。
 */
export async function listOpenBounties(store, { limit = 20, offset = 0 } = {}) {
  const n = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
  const o = Math.max(0, parseInt(offset, 10) || 0);
  return store.listOpenBounties({ limit: n, offset: o });
}

/**
 * 投稿改写。author 不可为 owner（服务端校验）。
 * @returns {Promise<{id:number}>}
 */
export async function submitRevision(store, { bountyId, authorUserId, revisedText }) {
  if (!authorUserId) throw Object.assign(new Error('INVALID_AUTHOR'), { code: 'INVALID_AUTHOR' });
  if (revisedText == null) throw Object.assign(new Error('MISSING_FIELDS'), { code: 'MISSING_FIELDS' });

  const bounty = await store.getBounty(bountyId);
  if (!bounty) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
  if (bounty.status !== 'open') throw Object.assign(new Error('BOUNTY_CLOSED'), { code: 'BOUNTY_CLOSED' });
  if (bounty.owner_user_id === authorUserId) throw Object.assign(new Error('OWNER_CANNOT_SUBMIT'), { code: 'OWNER_CANNOT_SUBMIT' });

  const id = await store.insertSubmission({ bountyId, authorUserId, revisedText });
  return { id };
}

/**
 * 发布者选定中标投稿并释放奖励（幂等）。
 * 幂等：bounty 已 closed 时再 award → 抛 ALREADY_AWARDED（不二次发放）。
 * 1) 校验 bounty 存在、调用者为 owner、bounty 仍 open
 * 2) 校验 submission 属于该 bounty
 * 3) 标记中标 submission = accepted，其余 = rejected
 * 4) 平台释放奖励：grant(winner, +reward, 'bounty_reward')（非转账）
 * 5) bounty status = closed
 *
 * @returns {Promise<{ok:boolean, winnerUserId:string, reward:number}>}
 */
export async function awardBounty(store, { bountyId, submissionId, ownerUserId }) {
  const bounty = await store.getBounty(bountyId);
  if (!bounty) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });
  if (bounty.owner_user_id !== ownerUserId) throw Object.assign(new Error('FORBIDDEN'), { code: 'FORBIDDEN' });
  if (bounty.status === 'closed') throw Object.assign(new Error('ALREADY_AWARDED'), { code: 'ALREADY_AWARDED' });

  const submission = await store.getSubmission(submissionId);
  if (!submission || submission.bounty_id !== bountyId) throw Object.assign(new Error('BAD_SUBMISSION'), { code: 'BAD_SUBMISSION' });

  // 标记中标 / 落选
  await store.markAwarded({ bountyId, submissionId, winnerUserId: submission.author_user_id });
  // 平台释放托管奖励给中标者（grant 而非 transfer；积分仍由平台发放）
  await grant(store, { userId: submission.author_user_id, amount: bounty.reward_credits, reason: 'bounty_reward', refType: 'bounty', refId: bountyId });
  await store.setBountyStatus(bountyId, 'closed');

  return { ok: true, winnerUserId: submission.author_user_id, reward: bounty.reward_credits };
}

/**
 * 悬赏详情 + 其投稿列表。
 */
export async function getBounty(store, { bountyId }) {
  const bounty = await store.getBounty(bountyId);
  if (!bounty) return null;
  const submissions = await store.listSubmissions(bountyId);
  return { bounty, submissions };
}
