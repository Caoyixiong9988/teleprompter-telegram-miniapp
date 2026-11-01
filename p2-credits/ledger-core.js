/**
 * ledger-core.js — 统一积分账本核心逻辑（纯函数，不依赖 Cloudflare）
 *
 * 这是 P2 的"真·全共用模块"：三款出海小程序（提词器 / 决策助手 / 表情包）
 * 共用同一套 users_credits 总账，靠 Telegram user_id（跨 bot 恒定）打通。
 *
 * 设计边界（合规铁律，见功能清单第 7/8 节）：
 *   - 内部积分 ≠ Telegram Stars，≠ 法定货币
 *   - 不可提现为法币 / 加密货币
 *   - 不可在用户间当货币"转账"（积分只由平台发放，不是 A 转 B）
 *   - 不可用于赌博（只换明确功能，不押注）
 * 因此本模块**刻意不提供 transfer()**：积分只能由平台 grant，用户只能 consume。
 *
 * 依赖一个 `store` 实现（见下方 Store 接口）。生产用 D1 adapter（见 credits-worker.js），
 * 测试用 inmemory-store.js。
 *
 * ── Store 接口（由 adapter 实现）─────────────────────────────
 *   ensureUser(userId)                  -> Promise<void>             INSERT OR IGNORE 余额 0
 *   getBalance(userId)                  -> Promise<number>          无记录返回 0
 *   atomicAdjust(userId, delta)         -> Promise<boolean>         余额 + delta；若结果 < 0 则整笔拒绝并返回 false（原子）
 *   recordLedger({userId,delta,reason,refType,refId}) -> Promise<void>
 *   getLedger(userId, limit=50)         -> Promise<Array>           按时间倒序
 */

// 参数校验：积分变动必须是正整数
function assertPositiveAmount(amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw Object.assign(new Error('INVALID_AMOUNT'), { code: 'INVALID_AMOUNT' });
  }
}

/**
 * 平台发放积分（mint）。仅供受信任的后端调用（Worker 层须用 ADMIN_SECRET 门禁）。
 * @returns {Promise<number>} 操作后余额
 */
export async function grant(store, { userId, amount, reason = 'grant', refType = null, refId = null }) {
  assertPositiveAmount(amount);
  await store.ensureUser(userId);
  const ok = await store.atomicAdjust(userId, +amount);
  if (!ok) throw Object.assign(new Error('ADJUST_FAILED'), { code: 'ADJUST_FAILED' });
  await store.recordLedger({ userId, delta: +amount, reason, refType, refId });
  return store.getBalance(userId);
}

/**
 * 用户消耗积分兑换权益（如解锁 Pro、去水印导出、生成次数）。
 * 余额不足时抛 INSUFFICIENT_FUNDS，余额不变。
 * @returns {Promise<number>} 操作后余额
 */
export async function consume(store, { userId, amount, reason = 'consume', refType = null, refId = null }) {
  assertPositiveAmount(amount);
  await store.ensureUser(userId);
  const ok = await store.atomicAdjust(userId, -amount);
  if (!ok) throw Object.assign(new Error('INSUFFICIENT_FUNDS'), { code: 'INSUFFICIENT_FUNDS' });
  await store.recordLedger({ userId, delta: -amount, reason, refType, refId });
  return store.getBalance(userId);
}

/**
 * 查询余额（无记录视为 0）。
 */
export async function getBalance(store, { userId }) {
  return store.getBalance(userId);
}

/**
 * 查询流水（审计 / 防滥用 / 用户展示）。
 */
export async function getLedger(store, { userId, limit = 50 }) {
  return store.getLedger(userId, limit);
}
