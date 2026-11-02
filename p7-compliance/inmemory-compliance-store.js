/**
 * inmemory-compliance-store.js — 测试用内存 store（实现 compliance-core 的 Store 接口）
 *
 * 与生产 D1ComplianceStore 同接口，便于 node --test 无 Cloudflare 跑通。
 */

export function makeInMemoryComplianceStore() {
  let seq = 1;
  const reports = [];
  return {
    /** compliance-core#submitReport 所需 */
    async insertReport({ type, targetId, detail, userId, createdAt }) {
      const id = seq++;
      reports.push({
        id,
        type,
        target_id: targetId,
        detail,
        user_id: userId,
        status: 'pending',
        created_at: createdAt,
      });
      return id;
    },
    // —— 测试辅助 ——
    _all: () => reports.slice(),
    _count: () => reports.length,
  };
}
