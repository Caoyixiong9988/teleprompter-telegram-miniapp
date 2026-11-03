/**
 * growth-core.js — P5 病毒增长「纯逻辑」核心（不依赖 Cloudflare）
 *
 * 复用：
 *   - shared/ledger-core.js     ：积分发放/消耗语义（grant / consume）
 *   - shared/verify.js          ：initData 验签（在 worker 层做）
 *
 * 合规红线（凌驾一切，见功能清单）：
 *   - 所有积分变动均由平台中介：发放=grant、消耗=consume，绝不做钱包对钱包的 transfer()。
 *   - 邀请 / 礼物奖励均为平台发放（reason='referral_bonus' / 'gift_receive'），不是 A 转 B。
 *   - 分享卡片是用户原创（UGC）有机传播，非付费广告网络。
 *   - 绝不出现赌博、收益承诺类文案或能力。
 *   本模块刻意不提供任何 transfer / withdraw / bet / predict 能力。
 *
 * ── Store 接口（由 adapter 实现）─────────────────────────────────
 *   // 推荐
 *   getReferralRow(userId) -> Promise<{user_id,referrer_user_id,referral_code,created_at}|null>
 *   claimReferralCode({userId, referralCode, createdAt}) -> Promise<boolean>  // false=码被占用（碰撞）
 *   setReferrer(userId, referrerUserId) -> Promise<boolean>                  // 仅首次成功（referrer IS NULL）
 *   getUserIdByReferralCode(code) -> Promise<string|null>
 *   // 群组统计 / 排行榜
 *   setGroupStat({groupId, userId, readsCount, streakCount, updatedAt}) -> Promise<void>
 *   getLeaderboard({groupId, limit}) -> Promise<Array<{user_id,reads_count,streak_count}>>
 *   // 礼物流水
 *   insertGiftLog({fromUserId, toUserId, amount, reason, createdAt}) -> Promise<void>
 *   // ledger-core 接口（grant/consume 需要）：ensureUser/getBalance/atomicAdjust/recordLedger/getLedger
 */

import { grant, consume } from '../shared/ledger-core.js';

// 邀请双方各得平台发放积分（非转账）。值为正整数，符合 ledger-core 的 assertPositiveAmount。
export const REFERRAL_BONUS = 50;

/**
 * 生成专属推荐码。碰撞由 store 的 claimReferralCode 唯一约束兜底（worker 层重试）。
 * 仅用字母数字，避免 URL 编码问题。
 */
export function generateReferralCode(seed) {
  const base = String(seed).replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase() || 'U';
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return (base + rand).toUpperCase().slice(0, 12);
}

/**
 * 归因推荐关系 + 为本用户铸造专属邀请码 + 平台发放双方奖励。
 * 幂等：已归因者直接返回，不重复发奖。
 *
 * @returns {Promise<{ok:boolean, attributed:boolean, referrerUserId:?string, referralCode:string}>}
 */
export async function attributeReferral(store, { userId, referralCode }) {
  let row = await store.getReferralRow(userId);
  let myCode = row ? row.referral_code : null;
  let attributed = false;
  let referrerUserId = row ? row.referrer_user_id : null;

  // 1) 首次访问：铸造本用户专属码（碰撞重试）
  if (!myCode) {
    myCode = await mintCode(store, userId);
  }

  // 2) 归因推荐人（仅当未归因、且提供了有效码、且不是自己）
  if (!referrerUserId && referralCode) {
    const refId = await store.getUserIdByReferralCode(referralCode);
    if (refId && refId !== userId) {
      const ok = await store.setReferrer(userId, refId);
      if (ok) {
        referrerUserId = refId;
        attributed = true;
        // 平台发放双方奖励（纯平台发放，非转账）
        await grant(store, { userId, amount: REFERRAL_BONUS, reason: 'referral_bonus', refType: 'referral', refId: refId });
        await grant(store, { userId: refId, amount: REFERRAL_BONUS, reason: 'referral_bonus', refType: 'referral', refId: userId });
      }
    }
  }

  return { ok: true, attributed, referrerUserId, referralCode: myCode };
}

async function mintCode(store, userId) {
  for (let i = 0; i < 8; i++) {
    const code = generateReferralCode(userId + ':' + i + ':' + Date.now() + ':' + Math.random());
    const ok = await store.claimReferralCode({ userId, referralCode: code, createdAt: Date.now() });
    if (ok) return code;
  }
  throw Object.assign(new Error('CODE_MINT_FAILED'), { code: 'CODE_MINT_FAILED' });
}

/**
 * 排行榜：group 给定则按该群内 reads_count 排名；否则按全站聚合（SUM reads_count）排名。
 * 返回 [{user_id, reads_count, streak_count}]，按 reads_count 降序，截断 limit。
 */
export async function getLeaderboard(store, { groupId = null, limit = 20 } = {}) {
  const n = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
  return store.getLeaderboard({ groupId, limit: n });
}

/**
 * 平台中介的积分礼物（非 P2P 钱包互转）：
 *   1) 消耗送礼者 amount（consume reason='gift_send'，余额不足即抛 INSUFFICIENT_FUNDS）
 *   2) 平台向收礼者发放 amount（grant reason='gift_receive'）
 *   3) 记 gift_log
 * 注意：不存在 transfer()——两笔都是平台记账语义，满足"积分只由平台发放"红线。
 *
 * @returns {Promise<{ok:boolean}>}
 */
export async function sendGift(store, { fromUserId, toUserId, amount, reason = 'gift' }) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    throw Object.assign(new Error('INVALID_GIFT'), { code: 'INVALID_GIFT' });
  }
  // 先消耗送礼者（余额不足会抛 INSUFFICIENT_FUNDS，worker 转 402）
  await consume(store, { userId: fromUserId, amount, reason: 'gift_send', refType: 'gift', refId: toUserId });
  // 平台向收礼者发放（不是从送礼者钱包扣除后直转）
  await grant(store, { userId: toUserId, amount, reason: 'gift_receive', refType: 'gift', refId: fromUserId });
  await store.insertGiftLog({ fromUserId, toUserId, amount, reason, createdAt: Date.now() });
  return { ok: true };
}

/**
 * 构建分享载荷（"作品即广告"）。实际 Canvas 卡片渲染在 index.html 完成；此处仅返回数据/深链。
 * 分享文案不含任何收益承诺措辞，属用户原创（UGC）有机传播。
 *
 * @param {{userId:string, referralCode:string, botUsername?:string, appUrl?:string}} params
 */
export function buildSharePayload({ userId, referralCode, botUsername, appUrl }) {
  const handle = (botUsername && botUsername !== '__BOT_USERNAME_PLACEHOLDER__') ? botUsername : 'your_bot';
  const code = referralCode;
  const deepLink = `https://t.me/${handle}?start=${encodeURIComponent(code)}`;
  return {
    referralCode: code,
    deepLink,
    shareText:
      `I use this teleprompter to read my scripts hands-free — smooth and simple. ` +
      `Open it through my link and try it free: ${deepLink}`,
    card: {
      kind: 'ugc_share_card',                 // index.html 的 Canvas 据此渲染分享卡片（此处仅返回数据）
      title: 'Teleprompter',
      subtitle: 'Read scripts hands-free',
      referralCode: code,
      deepLink,
    },
    note: 'Organic UGC share — not a paid ad network. No fortune-telling or prediction copy.',
  };
}
