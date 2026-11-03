/**
 * test-growth.mjs — P5 本地测试（无需 Cloudflare）
 * 运行：node --test p5-growth/test-growth.mjs
 *
 * 覆盖（对应任务 6 条断言）：
 *   a) 推荐归因：设置推荐人 + 铸造专属码 + 双方各得平台奖励（非转账）；幂等不重复发奖
 *   b) 排行榜：按 reads_count 降序；群内维度正确
 *   c) 礼物：消耗送礼者 + 平台发放收礼者（平台中介）；并验证核心模块无 transfer()
 *   d) 礼物余额不足：拒付（INSUFFICIENT_FUNDS → 402）
 *   e) 未授权：篡改 initData → 401；/growth/verify 缺 ADMIN_SECRET → 403
 *   f) 合规：growth-core 不得导出 transfer/withdraw/gamble/predict/fortune 等能力
 * 外加 Worker 端到端若干。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { attributeReferral, getLeaderboard, sendGift, buildSharePayload, REFERRAL_BONUS } from './growth-core.js';
import { InMemoryGrowthStore } from './inmemory-growth-store.js';
import worker from './growth-worker.js';

const BOT_TOKEN = 'TEST_BOT_TOKEN:abc';
const ADMIN_SECRET = 'super-secret';
const BOT_USERNAME = 'teleprompter_bot';

// ── 签发合法 initData（复用与 verify.js 一致的算法）──
async function signInitData(botToken, userId) {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify({ id: userId, first_name: 'Tester' }));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'test-q');
  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map((k) => k + '=' + params.get(k)).join('\n');
  const enc = (s) => new TextEncoder().encode(s);
  const k1 = await crypto.subtle.importKey('raw', enc('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', k1, enc(botToken)));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc(dataCheckString)));
  const hash = Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
  params.set('hash', hash);
  return params.toString();
}

// ── 模拟 D1（prepare/bind/run/first/all，按 SQL 子串分发；支持 ON CONFLICT 与聚合）──
function makeMockD1() {
  const users = new Map();       // userId -> {balance,created_at,updated_at}
  const ledger = [];             // {id,user_id,delta,reason,ref_type,ref_id,created_at}
  const referrals = new Map();   // userId -> {user_id,referrer_user_id,referral_code,created_at}
  const codeToUser = new Map();  // referralCode -> userId
  const groupStats = new Map();  // "gid\u0000uid" -> {group_id,user_id,reads_count,streak_count,updated_at}
  const giftLog = [];            // {id,from_user_id,to_user_id,amount,reason,created_at}
  let lid = 1, gid = 1;

  function exec(sql, p) {
    const r = { row: undefined, results: undefined, changes: 0 };
    if (sql.includes('INSERT OR IGNORE INTO users_credits')) {
      const [userId, , ca, ua] = p;
      if (!users.has(userId)) users.set(userId, { balance: 0, created_at: ca, updated_at: ua });
      r.changes = 0;
    } else if (sql.includes('SELECT balance FROM users_credits')) {
      const row = users.get(p[0]);
      r.row = row ? { balance: row.balance } : null;
    } else if (sql.includes('UPDATE users_credits SET balance')) {
      const [delta, ua, userId] = p;
      const row = users.get(userId);
      if (row && row.balance + delta >= 0) { row.balance += delta; row.updated_at = ua; r.changes = 1; }
    } else if (sql.includes('INSERT INTO credits_ledger')) {
      const [userId, delta, reason, refType, refId, ca] = p;
      ledger.push({ id: lid++, user_id: userId, delta, reason, ref_type: refType, ref_id: refId, created_at: ca });
      r.changes = 1;
    } else if (sql.includes('FROM credits_ledger WHERE user_id')) {
      const [userId, limit] = p;
      r.results = ledger.filter((x) => x.user_id === userId).sort((a, b) => b.id - a.id).slice(0, limit);
    } else if (sql.includes('FROM users_referral WHERE user_id')) {
      const [userId] = p;
      const row = referrals.get(userId);
      r.row = row ? { user_id: row.user_id, referrer_user_id: row.referrer_user_id, referral_code: row.referral_code, created_at: row.created_at } : null;
    } else if (sql.includes('FROM users_referral WHERE referral_code')) {
      const [code] = p;
      const uid = codeToUser.get(code);
      r.row = uid ? { user_id: uid } : null;
    } else if (sql.includes('INSERT OR IGNORE INTO users_referral')) {
      const [userId, code, ca] = p;
      if (codeToUser.has(code)) r.changes = 0;            // 码被占
      else if (referrals.has(userId)) r.changes = 0;      // 用户行已存在
      else {
        referrals.set(userId, { user_id: userId, referrer_user_id: null, referral_code: code, created_at: ca });
        codeToUser.set(code, userId);
        r.changes = 1;
      }
    } else if (sql.includes('UPDATE users_referral SET referrer_user_id')) {
      const [referrerUserId, userId] = p;
      const row = referrals.get(userId);
      if (row && !row.referrer_user_id) { row.referrer_user_id = referrerUserId; r.changes = 1; }
    } else if (sql.includes('INSERT INTO group_stats')) {
      const [groupId, userId, reads, streak, ua] = p;
      groupStats.set(groupId + '' + userId, { group_id: groupId, user_id: userId, reads_count: reads, streak_count: streak, updated_at: ua });
      r.changes = 1;
    } else if (sql.includes('FROM group_stats WHERE group_id')) {
      const [groupId, limit] = p;
      r.results = [...groupStats.values()].filter((s) => s.group_id === groupId).sort((a, b) => b.reads_count - a.reads_count).slice(0, limit);
    } else if (sql.includes('SUM(reads_count)')) {
      const [limit] = p;
      const agg = new Map();
      for (const s of groupStats.values()) {
        const cur = agg.get(s.user_id) || { reads_count: 0, streak_count: 0 };
        cur.reads_count += s.reads_count;
        cur.streak_count = Math.max(cur.streak_count, s.streak_count);
        agg.set(s.user_id, cur);
      }
      r.results = [...agg.entries()]
        .map(([user_id, v]) => ({ user_id, reads_count: v.reads_count, streak_count: v.streak_count }))
        .sort((a, b) => b.reads_count - a.reads_count).slice(0, limit);
    } else if (sql.includes('INSERT INTO gift_log')) {
      const [from, to, amount, reason, ca] = p;
      giftLog.push({ id: gid++, from_user_id: from, to_user_id: to, amount, reason, created_at: ca });
      r.changes = 1;
    } else if (sql.includes('COUNT(*) AS c FROM gift_log')) {
      r.row = { c: giftLog.length };
    } else {
      throw new Error('unhandled SQL in mock D1: ' + sql);
    }
    return r;
  }

  function prepare(sql) {
    const stmt = {
      sql,
      args: [],
      bind(...args) { this.args = args; return this; },
      async run() { return { meta: { changes: exec(this.sql, this.args).changes || 0 } }; },
      async first() { const r = exec(this.sql, this.args); return r.row ?? null; },
      async all() { const r = exec(this.sql, this.args); return { results: r.results ?? [] }; },
    };
    return stmt;
  }

  return {
    prepare,
    // 测试内省
    balance: (uid) => users.get(uid)?.balance ?? 0,
    giftCount: () => giftLog.length,
    seedGroupStat: (g, u, r, s) => groupStats.set(g + '' + u, { group_id: g, user_id: u, reads_count: r, streak_count: s, updated_at: Date.now() }),
    seedReferral: (u, code, ref) => { referrals.set(u, { user_id: u, referrer_user_id: ref || null, referral_code: code, created_at: Date.now() }); codeToUser.set(code, u); },
    seedBalance: (u, b) => users.set(u, { balance: b, created_at: Date.now(), updated_at: Date.now() }),
  };
}

const ENV = { DB: makeMockD1(), BOT_TOKEN, ADMIN_SECRET, BOT_USERNAME };

// ════════════════════════════════════════════════════════
test('a) 核心：推荐归因设置推荐人 + 铸造专属码 + 双方各得平台奖励（非转账）', async () => {
  const s = new InMemoryGrowthStore();
  const rA = await attributeReferral(s, { userId: 'A' });
  assert.equal(rA.referralCode && rA.referralCode.length > 0, true, 'A 应获得专属码');
  assert.equal(rA.referrerUserId, null);
  assert.equal(await s.getBalance('A'), 0, 'A 自己不给自己发奖');

  const aRow = await s.getReferralRow('A');
  const Acode = aRow.referral_code;

  const rB = await attributeReferral(s, { userId: 'B', referralCode: Acode });
  assert.equal(rB.attributed, true);
  assert.equal(rB.referrerUserId, 'A');
  // 双方各得平台发放奖励（A 是推荐人，B 是新用户）
  assert.equal(await s.getBalance('A'), REFERRAL_BONUS);
  assert.equal(await s.getBalance('B'), REFERRAL_BONUS);
});

test('a2) 核心：重复归因幂等，不重复发奖', async () => {
  const s = new InMemoryGrowthStore();
  const aRow = await s.getReferralRow('A');
  const Acode = (await s.getReferralRow('A'))?.referral_code || 'CODEA';
  await s.ensureUser('A'); await s.ensureUser('B');
  // 直接构造最小场景
  const s2 = new InMemoryGrowthStore();
  await attributeReferral(s2, { userId: 'A' });
  const codeA = (await s2.getReferralRow('A')).referral_code;
  await attributeReferral(s2, { userId: 'B', referralCode: codeA });
  const beforeA = await s2.getBalance('A');
  const beforeB = await s2.getBalance('B');
  // 再次归因 B（带或不带码）
  const r = await attributeReferral(s2, { userId: 'B', referralCode: codeA });
  assert.equal(r.attributed, false, '已归因用户再次归因应幂等');
  assert.equal(await s2.getBalance('A'), beforeA, '推荐人奖励不应重复');
  assert.equal(await s2.getBalance('B'), beforeB, '新用户奖励不应重复');
});

test('a3) 核心：无效/不存在的推荐码不归因、不发奖', async () => {
  const s = new InMemoryGrowthStore();
  const r = await attributeReferral(s, { userId: 'C', referralCode: 'NOPE' });
  assert.equal(r.attributed, false);
  assert.equal(r.referrerUserId, null);
  assert.equal(await s.getBalance('C'), 0);
});

test('b) 核心：排行榜按 reads_count 降序；群内维度正确', async () => {
  const s = new InMemoryGrowthStore();
  await s.setGroupStat({ groupId: 'g1', userId: 'u1', readsCount: 10, streakCount: 1, updatedAt: Date.now() });
  await s.setGroupStat({ groupId: 'g1', userId: 'u2', readsCount: 30, streakCount: 3, updatedAt: Date.now() });
  await s.setGroupStat({ groupId: 'g1', userId: 'u3', readsCount: 20, streakCount: 2, updatedAt: Date.now() });
  await s.setGroupStat({ groupId: 'g2', userId: 'u1', readsCount: 5, streakCount: 0, updatedAt: Date.now() });

  const lb = await getLeaderboard(s, { groupId: 'g1', limit: 20 });
  assert.equal(lb.length, 3);
  assert.deepEqual(lb.map((x) => x.user_id), ['u2', 'u3', 'u1']);

  // 全站聚合：u1=15, u2=30, u3=20 → u2,u3,u1
  const global = await getLeaderboard(s, { groupId: null, limit: 20 });
  assert.deepEqual(global.map((x) => x.user_id), ['u2', 'u3', 'u1']);
});

test('c) 核心：礼物消耗送礼者 + 平台发放收礼者（平台中介）；核心模块无 transfer()', async () => {
  const s = new InMemoryGrowthStore();
  await s.ensureUser('G'); await s.ensureUser('R');
  await import('../shared/ledger-core.js').then((m) => m.grant(s, { userId: 'G', amount: 100, reason: 'topup' }));
  assert.equal(await s.getBalance('G'), 100);

  await sendGift(s, { fromUserId: 'G', toUserId: 'R', amount: 30 });
  assert.equal(await s.getBalance('G'), 70, '送礼者被消耗');
  assert.equal(await s.getBalance('R'), 30, '收礼者由平台发放');
  assert.equal(s.giftLogCount(), 1, '礼物应记一条 gift_log');

  // 合规：核心模块绝不导出 transfer
  const mod = await import('./growth-core.js');
  assert.equal(typeof mod.transfer, 'undefined', '绝不能出现 transfer —— 礼物为平台中介（consume+grant），非钱包互转');
});

test('d) 核心：礼物余额不足拒付（INSUFFICIENT_FUNDS）', async () => {
  const s = new InMemoryGrowthStore();
  await s.ensureUser('G2'); await s.ensureUser('R2');
  await import('../shared/ledger-core.js').then((m) => m.grant(s, { userId: 'G2', amount: 10, reason: 'topup' }));
  await assert.rejects(
    () => sendGift(s, { fromUserId: 'G2', toUserId: 'R2', amount: 999 }),
    (e) => e.code === 'INSUFFICIENT_FUNDS'
  );
  assert.equal(await s.getBalance('G2'), 10, '拒付后余额不变');
  assert.equal(await s.getBalance('R2'), 0);
});

test('e) Worker：篡改 initData → 401；/growth/verify 缺 ADMIN_SECRET → 403', async () => {
  const valid = await signInitData(BOT_TOKEN, 'w_e');
  // 篡改
  let r = await worker.fetch(new Request('https://x/growth/referral', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: valid + 'X' }),
  }), ENV);
  assert.equal(r.status, 401);

  // /growth/share 篡改 initData
  r = await worker.fetch(new Request('https://x/growth/share?initData=' + encodeURIComponent(valid + 'X')), ENV);
  assert.equal(r.status, 401);

  // /growth/verify 缺 secret
  r = await worker.fetch(new Request('https://x/growth/verify'), ENV);
  assert.equal(r.status, 403);
  // 带正确 secret
  r = await worker.fetch(new Request('https://x/growth/verify', { headers: { 'x-admin-secret': ADMIN_SECRET } }), ENV);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
});

test('e2) Worker：合法 initData 跑通 referral / gift / share / leaderboard 端到端', async () => {
  // 1) w1 归因（铸造码）
  let init1 = await signInitData(BOT_TOKEN, 'w1');
  let r = await worker.fetch(new Request('https://x/growth/referral', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: init1 }),
  }), ENV);
  assert.equal(r.status, 200);
  let d = await r.json();
  assert.equal(d.referralCode && d.referralCode.length > 0, true);
  const code1 = d.referralCode;

  // 2) w2 用 w1 的码归因 → 双方各 +50
  let init2 = await signInitData(BOT_TOKEN, 'w2');
  r = await worker.fetch(new Request('https://x/growth/referral', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: init2, referralCode: code1 }),
  }), ENV);
  assert.equal(r.status, 200);
  assert.equal(ENV.DB.balance('w1'), REFERRAL_BONUS);
  assert.equal(ENV.DB.balance('w2'), REFERRAL_BONUS);

  // 3) w1 给 w2 送 10 积分（w1 现有 50）
  r = await worker.fetch(new Request('https://x/growth/gift', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: init1, toUserId: 'w2', amount: 10 }),
  }), ENV);
  assert.equal(r.status, 200);
  assert.equal(ENV.DB.balance('w1'), REFERRAL_BONUS - 10);
  assert.equal(ENV.DB.balance('w2'), REFERRAL_BONUS + 10);
  assert.equal(ENV.DB.giftCount(), 1);

  // 4) 分享载荷（w1 再拉一次，应带已有码）
  r = await worker.fetch(new Request('https://x/growth/share?initData=' + encodeURIComponent(init1)), ENV);
  assert.equal(r.status, 200);
  d = await r.json();
  assert.equal(d.referralCode, code1);
  assert.ok(d.deepLink.includes('t.me/' + BOT_USERNAME + '?start=' + code1), '深链须含 bot 用户名与 start 参数');
  assert.ok(d.card && d.card.kind === 'ugc_share_card');
});

test('e3) Worker：礼物余额不足 → 402', async () => {
  ENV.DB.seedBalance('poor', 5);
  const initP = await signInitData(BOT_TOKEN, 'poor');
  const r = await worker.fetch(new Request('https://x/growth/gift', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initP, toUserId: 'w2', amount: 999 }),
  }), ENV);
  assert.equal(r.status, 402);
});

test('e4) Worker：排行榜公开可读（群内维度）', async () => {
  ENV.DB.seedGroupStat('club', 'm1', 7, 1);
  ENV.DB.seedGroupStat('club', 'm2', 99, 5);
  ENV.DB.seedGroupStat('club', 'm3', 42, 2);
  const r = await worker.fetch(new Request('https://x/growth/leaderboard?group=club&limit=10'), ENV);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.leaderboard.map((x) => x.user_id), ['m2', 'm3', 'm1']);
});

test('f) 合规：growth-core 不得导出任何 transfer/withdraw/gamble/bet 能力', async () => {
  const mod = await import('./growth-core.js');
  for (const banned of ['transfer', 'withdraw', 'payout', 'gamble', 'bet', 'casino']) {
    assert.equal(typeof mod[banned], 'undefined', `绝不能出现 ${banned} —— 增长模块严禁转账/提现/赌博`);
  }
  // 允许的纯函数应存在
  assert.equal(typeof mod.attributeReferral, 'function');
  assert.equal(typeof mod.sendGift, 'function');
  assert.equal(typeof mod.getLeaderboard, 'function');
  assert.equal(typeof mod.buildSharePayload, 'function');
});

