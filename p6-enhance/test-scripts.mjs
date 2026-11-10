/**
 * test-scripts.mjs — P6(A) 台词云端同步 本地测试（无需 Cloudflare）
 * 运行：node --test p6-enhance/test-scripts.mjs
 *
 * 覆盖：
 *   0) 非 Pro 一律 403
 *   1) save → list 往返（新增可被本人列出）
 *   2) upsert 更新已有台词内容
 *   3) 非法 initData（篡改 hash）→ 401
 *   4) 删除强制执行所有权（他人不能删）
 *   5–11) /scripts POST 写入配额：请求体 / 字段类型 / 正文与标题字节数 / 每用户 200 篇
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import worker from './enhance-worker.js';
import { makeEnv, signInitData, BOT_TOKEN } from './test-helpers.mjs';

const ENV = makeEnv();

function req(overEnv, method, path, body, query) {
  let url = 'https://x' + path;
  if (query) url += '?' + query;
  const init = { method, headers: { 'content-type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return worker.fetch(new Request(url, init), overEnv || ENV);
}

test('0) 非 Pro 用户访问 /scripts 一律 403（云同步为 Pro 权益）', async () => {
  const init = await signInitData(BOT_TOKEN, 'u_free');
  const post = await req(ENV, 'POST', '/scripts', { initData: init, title: 't', content: 'c' });
  assert.equal(post.status, 403);
  assert.equal((await post.json()).error, 'pro_required');

  const get = await req(ENV, 'GET', '/scripts', null, 'initData=' + encodeURIComponent(init));
  assert.equal(get.status, 403);

  const del = await req(ENV, 'DELETE', '/scripts', { initData: init, id: 1 });
  assert.equal(del.status, 403);
});

test('1) save → list 往返：新增台词可被本人列出', async () => {
  const init = await signInitData(BOT_TOKEN, 'u_scripts_1');
  ENV.DB.grantPro('u_scripts_1');
  const save = await req(ENV, 'POST', '/scripts', { initData: init, title: '稿A', content: '内容A' });
  assert.equal(save.status, 200);
  const saved = (await save.json()).script;
  assert.ok(saved.id != null, '应返回自增 id');
  assert.equal(saved.title, '稿A');
  assert.equal(saved.content, '内容A');

  const list = await req(ENV, 'GET', '/scripts', null, 'initData=' + encodeURIComponent(init));
  assert.equal(list.status, 200);
  const scripts = (await list.json()).scripts;
  assert.ok(Array.isArray(scripts) && scripts.some((s) => s.id === saved.id && s.content === '内容A'));
});

test('2) upsert：传 id 更新已有台词内容', async () => {
  const init = await signInitData(BOT_TOKEN, 'u_scripts_2');
  ENV.DB.grantPro('u_scripts_2');
  const s1 = (await req(ENV, 'POST', '/scripts', { initData: init, title: '稿B', content: '旧内容' }).then((r) => r.json())).script;
  const s2 = (await req(ENV, 'POST', '/scripts', { initData: init, id: s1.id, title: '稿B改', content: '新内容' }).then((r) => r.json())).script;
  assert.equal(s2.id, s1.id, '应原地更新同一行');
  assert.equal(s2.content, '新内容');

  const list = (await req(ENV, 'GET', '/scripts', null, 'initData=' + encodeURIComponent(init)).then((r) => r.json())).scripts;
  assert.equal(list.filter((s) => s.id === s1.id).length, 1, '仍只有一条（非新增）');
  assert.equal(list.find((s) => s.id === s1.id).content, '新内容');
});

test('3) 非法 initData（篡改 hash）→ 401', async () => {
  const bad = (await signInitData(BOT_TOKEN, 'u_scripts_x')) + 'X';

  const post = await req(ENV, 'POST', '/scripts', { initData: bad, title: 't', content: 'c' });
  assert.equal(post.status, 401, 'POST 应拒绝篡改 initData');

  const get = await req(ENV, 'GET', '/scripts', null, 'initData=' + encodeURIComponent(bad));
  assert.equal(get.status, 401, 'GET 应拒绝篡改 initData');

  const del = await req(ENV, 'DELETE', '/scripts', { initData: bad, id: 1 });
  assert.equal(del.status, 401, 'DELETE 应拒绝篡改 initData');
});

test('4) 删除强制执行所有权：他人不能删我的台词', async () => {
  const owner = await signInitData(BOT_TOKEN, 'u_owner');
  const other = await signInitData(BOT_TOKEN, 'u_other');
  ENV.DB.grantPro('u_owner');

  const s = (await req(ENV, 'POST', '/scripts', { initData: owner, title: '我的稿', content: '私密' }).then((r) => r.json())).script;

  // 他人尝试删除 → 403（越权）
  const forbidden = await req(ENV, 'DELETE', '/scripts', { initData: other, id: s.id });
  assert.equal(forbidden.status, 403, '非所有者删除应被拒');

  // 不存在的 id → 404
  const missing = await req(ENV, 'DELETE', '/scripts', { initData: owner, id: 999999 });
  assert.equal(missing.status, 404);

  // 本人删除 → 200，且列表为空
  const ok = await req(ENV, 'DELETE', '/scripts', { initData: owner, id: s.id });
  assert.equal(ok.status, 200);
  const list = (await req(ENV, 'GET', '/scripts', null, 'initData=' + encodeURIComponent(owner)).then((r) => r.json())).scripts;
  assert.equal(list.length, 0);
});

// ── 写入配额 / 长度上限（2026-11-10）─────────────────────────
// 每个用例用独立 userId，避免污染上面共享的 mock DB。
async function quotaUser(tag, pro = true) {
  const userId = 'u_quota_' + tag;
  const initData = await signInitData(BOT_TOKEN, userId);
  if (pro) ENV.DB.grantPro(userId);
  return initData;
}

test('5) 正文超过 100 KiB → 400 content_too_long，且不落库', async () => {
  const initData = await quotaUser('content_over');
  const tooLong = 'a'.repeat(100 * 1024 + 1);
  const res = await req(ENV, 'POST', '/scripts', { initData, title: '超长稿', content: tooLong });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'content_too_long');

  const list = await req(ENV, 'GET', '/scripts', null, 'initData=' + encodeURIComponent(initData));
  assert.equal((await list.json()).scripts.length, 0, '被拒的稿子不应写入 D1');
});

test('6) 正文恰好 100 KiB → 允许保存（边界值为闭区间）', async () => {
  const initData = await quotaUser('content_edge');
  const exact = 'a'.repeat(100 * 1024);
  const res = await req(ENV, 'POST', '/scripts', { initData, title: '边界稿', content: exact });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).script.content.length, 100 * 1024);
});

test('7) 标题超过 1 KiB → 400 title_too_long', async () => {
  const initData = await quotaUser('title_over');
  const res = await req(ENV, 'POST', '/scripts', {
    initData, title: 't'.repeat(1025), content: '正文',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'title_too_long');
});

test('8) 非字符串字段 → 400 invalid_fields（防绕过字节校验）', async () => {
  const initData = await quotaUser('bad_types');
  const objectTitle = await req(ENV, 'POST', '/scripts', {
    initData, title: { nested: 'x' }, content: '正文',
  });
  assert.equal(objectTitle.status, 400);
  assert.equal((await objectTitle.json()).error, 'invalid_fields');

  const numberContent = await req(ENV, 'POST', '/scripts', {
    initData, title: '标题', content: 12345,
  });
  assert.equal(numberContent.status, 400);
  assert.equal((await numberContent.json()).error, 'invalid_fields');
});

test('9) 请求体超过 256 KiB → 413 payload_too_large（读字段之前就拦下）', async () => {
  const initData = await quotaUser('body_over');
  const huge = 'a'.repeat(300 * 1024);
  const res = await req(ENV, 'POST', '/scripts', { initData, title: '巨型稿', content: huge });
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, 'payload_too_large');
});

test('10) 每用户 200 篇：边界可建、第 201 篇 409、更新仍可、删除后恢复、按用户隔离', async () => {
  const initData = await quotaUser('limit200');
  const otherInitData = await quotaUser('limit_other');

  let firstId = null;
  for (let i = 1; i <= 200; i++) {
    const r = await req(ENV, 'POST', '/scripts', {
      initData, title: '稿' + i, content: '内容' + i,
    });
    assert.equal(r.status, 200, '第 ' + i + ' 篇应可创建');
    const saved = (await r.json()).script;
    if (i === 1) firstId = saved.id;
  }

  const overflow = await req(ENV, 'POST', '/scripts', {
    initData, title: '第201篇', content: '超出配额',
  });
  assert.equal(overflow.status, 409);
  const overflowBody = await overflow.json();
  assert.equal(overflowBody.error, 'script_limit_reached');
  assert.equal(overflowBody.limit, 200);

  // 达到上限后，更新已有讲稿不受影响（不消耗新配额）
  const update = await req(ENV, 'POST', '/scripts', {
    initData, id: firstId, title: '稿1改', content: '改过的内容',
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).script.content, '改过的内容');

  // 删一篇后可再新增
  const del = await req(ENV, 'DELETE', '/scripts', { initData, id: firstId });
  assert.equal(del.status, 200);
  const again = await req(ENV, 'POST', '/scripts', {
    initData, title: '腾位后的新稿', content: '新建成功',
  });
  assert.equal(again.status, 200);

  // 配额按 user_id 隔离：另一个用户不受影响
  const other = await req(ENV, 'POST', '/scripts', {
    initData: otherInitData, title: '别人的稿', content: '互不干扰',
  });
  assert.equal(other.status, 200);
});

test('11) 限流不破坏鉴权顺序：非法 initData → 401、非 Pro → 403', async () => {
  const bad = (await signInitData(BOT_TOKEN, 'u_quota_bad')) + 'X';
  const tampered = await req(ENV, 'POST', '/scripts', {
    initData: bad, title: '超长', content: 'a'.repeat(100 * 1024 + 1),
  });
  assert.equal(tampered.status, 401, '验签必须先于任何字段校验');

  const freeInitData = await quotaUser('free', false);
  const free = await req(ENV, 'POST', '/scripts', {
    initData: freeInitData, title: '正常稿', content: '正常内容',
  });
  assert.equal(free.status, 403);
  assert.equal((await free.json()).error, 'pro_required');
});
