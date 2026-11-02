/**
 * test-bounty.mjs — P4 本地测试（无需 Cloudflare）
 * 运行：node --test p4-bounty/test-bounty.mjs
 *
 * 覆盖：
 *   a) 托管 escrow：发布悬赏扣减发布者余额、写入 open 悬赏；余额不足拒绝（INSUFFICIENT_FUNDS）
 *   b) 投稿：owner 不可自投（OWNER_CANNOT_SUBMIT）；非 owner 可投；已关闭悬赏拒绝（BOUNTY_CLOSED）
 *   c) 释放奖励（幂等）：award 给中标者 +reward（grant 非转账）；重复 award → ALREADY_AWARDED
 *   d) 越权：非 owner award → FORBIDDEN；错误 submission → BAD_SUBMISSION
 *   e) 合规：bounty-core 不得导出 transfer/withdraw/gamble/predict/fortune（绝无 P2P / 赌博 / 预测）
 *   f) Worker 端到端：验签门禁 401 / 402 / 403；create/list/submit/award/detail/verify
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBounty, listOpenBounties, submitRevision, awardBounty, getBounty } from './bounty-core.js';
import { InMemoryBountyStore } from './inmemory-bounty-store.js';
import { grant, getBalance } from '../shared/ledger-core.js';
import worker from './bounty-worker.js';

const BOT_TOKEN = 'TEST_BOT_TOKEN:abc';
const ADMIN_SECRET = 'super-secret';

// ── 签发合法 initData（复用与 verify.js 一致的 HMAC 算法）──
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

// ── 模拟 D1（prepare/bind/run/first/all，覆盖 users_credits/credits_ledger/bounties/bounty_submissions）──
function makeMockD1(seedUsers = {}) {
  const users = new Map();
  for (const [id, bal] of Object.entries(seedUsers)) users.set(id, { balance: bal, created_at: 0, updated_at: 0 });
  const ledger = [];
  let lid = 1;
  const bounties = new Map();
  const submissions = [];
  let sid = 1;

  function prep(sql) {
    // 真实 D1 中 prepare() 既可直接 .first()/.all()/.run()（无参 SQL，如 COUNT 对账），
    // 也可 .bind(...p).first()。两种都支持。
    const direct = {
      run: () => doRun(sql, []),
      first: () => doFirst(sql, []),
      all: () => doAll(sql, []),
    };
    return {
      bind(...p) {
        return {
          run: () => doRun(sql, p),
          first: () => doFirst(sql, p),
          all: () => doAll(sql, p),
        };
      },
      ...direct,
    };
  }
  function doRun(sql, p) {
    if (sql.includes('INSERT OR IGNORE INTO users_credits')) {
      const [userId] = p;
      if (!users.has(userId)) users.set(userId, { balance: 0, created_at: p[2], updated_at: p[3] });
      return { meta: { changes: 0 } };
    }
    if (sql.includes('UPDATE users_credits SET balance')) {
      const [delta, ua, userId] = p;
      const row = users.get(userId);
      if (row && row.balance + delta >= 0) { row.balance += delta; row.updated_at = ua; return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    }
    if (sql.includes('INSERT INTO credits_ledger')) {
      ledger.push({ id: lid++, user_id: p[0], delta: p[1], reason: p[2], ref_type: p[3], ref_id: p[4], created_at: p[5] });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO bounties')) {
      const [id, owner, title, text, reward, status, ca, deadline] = p;
      bounties.set(id, { id, owner_user_id: owner, title, script_text: text, reward_credits: reward, status, created_at: ca, deadline });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('INSERT INTO bounty_submissions')) {
      const [bountyId, author, text, status, ca] = p;
      const id = sid++;
      submissions.push({ id, bounty_id: bountyId, author_user_id: author, revised_text: text, status, created_at: ca });
      return { meta: { changes: 1, lastRowId: id } };
    }
    if (sql.includes("UPDATE bounty_submissions SET status = 'accepted'")) {
      const [subId, bountyId] = p;
      const s = submissions.find((x) => x.id === subId && x.bounty_id === bountyId);
      if (s) { s.status = 'accepted'; return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    }
    if (sql.includes("UPDATE bounty_submissions SET status = 'rejected'")) {
      const [bountyId, subId] = p;
      let ch = 0;
      for (const s of submissions) if (s.bounty_id === bountyId && s.id !== subId) { s.status = 'rejected'; ch++; }
      return { meta: { changes: ch } };
    }
    if (sql.includes('UPDATE bounties SET status')) {
      const [status, bountyId] = p;
      const b = bounties.get(bountyId);
      if (b) { b.status = status; return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    }
    return { meta: { changes: 0 } };
  }
  function doFirst(sql, p) {
    if (sql.includes('SELECT balance FROM users_credits')) {
      const row = users.get(p[0]);
      return row ? { balance: row.balance } : null;
    }
    if (sql.includes('FROM bounties WHERE id')) {
      return bounties.get(p[0]) || null;
    }
    if (sql.includes('FROM bounty_submissions WHERE id')) {
      return submissions.find((x) => x.id === p[0]) || null;
    }
    if (sql.includes("COUNT(*) AS c FROM bounties WHERE status = 'open'")) {
      let c = 0; for (const b of bounties.values()) if (b.status === 'open') c++; return { c };
    }
    if (sql.includes("COUNT(*) AS c FROM bounties WHERE status = 'closed'")) {
      let c = 0; for (const b of bounties.values()) if (b.status === 'closed') c++; return { c };
    }
    return null;
  }
  function doAll(sql, p) {
    if (sql.includes('FROM credits_ledger WHERE user_id')) {
      const [userId, limit] = p;
      return { results: ledger.filter((r) => r.user_id === userId).sort((a, b) => b.id - a.id).slice(0, limit) };
    }
    if (sql.includes("FROM bounties WHERE status = 'open'")) {
      const [limit, offset] = p;
      return { results: [...bounties.values()].filter((b) => b.status === 'open').sort((a, b) => b.created_at - a.created_at).slice(offset, offset + limit) };
    }
    if (sql.includes('FROM bounty_submissions WHERE bounty_id')) {
      const [bountyId] = p;
      return { results: submissions.filter((s) => s.bounty_id === bountyId).sort((a, b) => a.created_at - b.created_at) };
    }
    return { results: [] };
  }
  return { prepare: (sql) => prep(sql), _users: users, _bounties: bounties, _submissions: submissions };
}

// ════════════════════════════════════════════════════════
test('a) 托管 escrow：发布悬赏扣减发布者余额并写入 open；余额不足拒绝', async () => {
  const s = new InMemoryBountyStore();
  await grant(s, { userId: 'owner', amount: 1000, reason: 'signup' });

  const { id } = await createBounty(s, {
    ownerUserId: 'owner', title: '改稿', scriptText: '原始稿', rewardCredits: 300, deadline: null,
  });
  assert.equal(await getBalance(s, { userId: 'owner' }), 700); // 1000 - 300 托管
  const detail = await getBounty(s, { bountyId: id });
  assert.equal(detail.bounty.status, 'open');
  assert.equal(detail.bounty.reward_credits, 300);

  // 余额不足：再发 800 悬赏（仅剩 700）→ 拒绝，且未创建
  await assert.rejects(
    () => createBounty(s, { ownerUserId: 'owner', title: 'x', scriptText: 'y', rewardCredits: 800 }),
    (e) => e.code === 'INSUFFICIENT_FUNDS'
  );
  assert.equal(await getBalance(s, { userId: 'owner' }), 700); // 拒绝后余额不变
  const list = await listOpenBounties(s, {});
  assert.equal(list.length, 1); // 仍只有 1 个 open
});

test('b) 投稿：owner 不可自投；非 owner 可投；已关闭悬赏拒绝', async () => {
  const s = new InMemoryBountyStore();
  await grant(s, { userId: 'owner', amount: 1000, reason: 'signup' });
  const { id } = await createBounty(s, { ownerUserId: 'owner', title: 't', scriptText: 's', rewardCredits: 100 });

  // owner 自投 → 拒绝
  await assert.rejects(
    () => submitRevision(s, { bountyId: id, authorUserId: 'owner', revisedText: '试图自投' }),
    (e) => e.code === 'OWNER_CANNOT_SUBMIT'
  );

  // 非 owner 投稿 → 成功
  const sub = await submitRevision(s, { bountyId: id, authorUserId: 'writerA', revisedText: '改写稿' });
  assert.ok(sub.id >= 1);
  // 再投一个
  await submitRevision(s, { bountyId: id, authorUserId: 'writerB', revisedText: '另一版' });
  assert.equal((await getBounty(s, { bountyId: id })).submissions.length, 2);

  // 关闭后投稿 → 拒绝
  await s.setBountyStatus(id, 'closed');
  await assert.rejects(
    () => submitRevision(s, { bountyId: id, authorUserId: 'writerC', revisedText: '晚来的稿' }),
    (e) => e.code === 'BOUNTY_CLOSED'
  );
});

test('c) 释放奖励（幂等）：award 给中标者 +reward；重复 award → ALREADY_AWARDED', async () => {
  const s = new InMemoryBountyStore();
  await grant(s, { userId: 'owner', amount: 1000, reason: 'signup' });
  const { id } = await createBounty(s, { ownerUserId: 'owner', title: 't', scriptText: 's', rewardCredits: 100 });
  const sub = await submitRevision(s, { bountyId: id, authorUserId: 'writerA', revisedText: '终稿' });

  const r = await awardBounty(s, { bountyId: id, submissionId: sub.id, ownerUserId: 'owner' });
  assert.equal(r.ok, true);
  assert.equal(r.winnerUserId, 'writerA');
  assert.equal(r.reward, 100);
  // 中标者余额 +100（grant，非转账）
  assert.equal(await getBalance(s, { userId: 'writerA' }), 100);
  // 发布者仍为托管后的 900
  assert.equal(await getBalance(s, { userId: 'owner' }), 900);

  // 幂等：重复 award → 不再发放
  await assert.rejects(
    () => awardBounty(s, { bountyId: id, submissionId: sub.id, ownerUserId: 'owner' }),
    (e) => e.code === 'ALREADY_AWARDED'
  );
  assert.equal(await getBalance(s, { userId: 'writerA' }), 100); // 仍为 100，未二次发放
});

test('d) 越权：非 owner award → FORBIDDEN；错误 submission → BAD_SUBMISSION', async () => {
  const s = new InMemoryBountyStore();
  await grant(s, { userId: 'owner', amount: 1000, reason: 'signup' });
  const { id } = await createBounty(s, { ownerUserId: 'owner', title: 't', scriptText: 's', rewardCredits: 100 });
  const sub = await submitRevision(s, { bountyId: id, authorUserId: 'writerA', revisedText: '稿' });

  // 非 owner 想发奖 → 拒绝
  await assert.rejects(
    () => awardBounty(s, { bountyId: id, submissionId: sub.id, ownerUserId: 'someoneElse' }),
    (e) => e.code === 'FORBIDDEN'
  );
  // 指向不属于该悬赏的 submission → 拒绝
  await assert.rejects(
    () => awardBounty(s, { bountyId: id, submissionId: 99999, ownerUserId: 'owner' }),
    (e) => e.code === 'BAD_SUBMISSION'
  );
  // 余额不变
  assert.equal(await getBalance(s, { userId: 'writerA' }), 0);
});

test('e) 合规：bounty-core 不得导出 transfer/withdraw/gamble/predict/fortune', async () => {
  const mod = await import('./bounty-core.js');
  for (const bad of ['transfer', 'withdraw', 'gamble', 'predict', 'fortune']) {
    assert.equal(typeof mod[bad], 'undefined', `绝不能出现 ${bad} —— 积分只由平台托管/发放，绝无 P2P 转账 / 赌博 / 预测`);
  }
  assert.equal(typeof mod.createBounty, 'function');
  assert.equal(typeof mod.awardBounty, 'function');
});

test('f) Worker 端到端：401 / 402 / 403 / create / list / submit / award / detail / verify', async () => {
  const mock = makeMockD1({ owner: 1000 });
  const ENV = { DB: mock, BOT_TOKEN, ADMIN_SECRET };
  const validInit = await signInitData(BOT_TOKEN, 'owner');
  const tampered = validInit + 'X';

  // f.1 篡改 initData → 401
  let r = await worker.fetch(
    new Request('https://x/bounty/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: tampered, title: 't', scriptText: 's', rewardCredits: 100 }) }),
    ENV
  );
  assert.equal(r.status, 401);

  // f.2 合法 initData + 充足余额 → 200，返回 id
  r = await worker.fetch(
    new Request('https://x/bounty/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: validInit, title: '帮我改稿', scriptText: '原始', rewardCredits: 300 }) }),
    ENV
  );
  assert.equal(r.status, 200);
  const created = await r.json();
  assert.ok(created.id);
  assert.equal(mock._users.get('owner').balance, 700); // 托管扣减

  // f.3 余额不足 → 402
  const poorInit = await signInitData(BOT_TOKEN, 'broke');
  mock._users.set('broke', { balance: 10, created_at: 0, updated_at: 0 });
  r = await worker.fetch(
    new Request('https://x/bounty/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: poorInit, title: 't', scriptText: 's', rewardCredits: 500 }) }),
    ENV
  );
  assert.equal(r.status, 402);

  // f.4 公开列表 → 200，含刚创建的悬赏
  r = await worker.fetch(new Request('https://x/bounty/list?limit=20&offset=0'), ENV);
  assert.equal(r.status, 200);
  const list = await r.json();
  assert.equal(list.bounties.length, 1);
  assert.equal(list.bounties[0].id, created.id);

  // f.5 投稿：writerA（非 owner）提交 → 200
  const writerInit = await signInitData(BOT_TOKEN, 'writerA');
  r = await worker.fetch(
    new Request('https://x/bounty/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: writerInit, bountyId: created.id, revisedText: '终稿' }) }),
    ENV
  );
  assert.equal(r.status, 200);
  const sub = await r.json();
  assert.ok(sub.id >= 1);

  // f.6 owner 自投 → 403
  r = await worker.fetch(
    new Request('https://x/bounty/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: validInit, bountyId: created.id, revisedText: '自投' }) }),
    ENV
  );
  assert.equal(r.status, 403);

  // f.7 owner 发奖 → 200，writerA 余额 +300
  r = await worker.fetch(
    new Request('https://x/bounty/award', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: validInit, bountyId: created.id, submissionId: sub.id }) }),
    ENV
  );
  assert.equal(r.status, 200);
  const aw = await r.json();
  assert.equal(aw.winnerUserId, 'writerA');
  assert.equal(mock._users.get('writerA').balance, 300);

  // f.8 幂等发奖 → 409（不再发放）
  r = await worker.fetch(
    new Request('https://x/bounty/award', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: validInit, bountyId: created.id, submissionId: sub.id }) }),
    ENV
  );
  assert.equal(r.status, 409);

  // f.9 详情公开 → 200
  r = await worker.fetch(new Request('https://x/bounty/detail?bountyId=' + encodeURIComponent(created.id)), ENV);
  assert.equal(r.status, 200);
  const detail = await r.json();
  assert.equal(detail.bounty.status, 'closed');

  // f.10 对账：缺 ADMIN_SECRET → 403；带 ADMIN_SECRET → 200
  r = await worker.fetch(new Request('https://x/bounty/verify'), ENV);
  assert.equal(r.status, 403);
  r = await worker.fetch(new Request('https://x/bounty/verify', { headers: { 'x-admin-secret': ADMIN_SECRET } }), ENV);
  assert.equal(r.status, 200);
  const v = await r.json();
  assert.equal(v.openCount, 0);
  assert.equal(v.closedCount, 1);
});
