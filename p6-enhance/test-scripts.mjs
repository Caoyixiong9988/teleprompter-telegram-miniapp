/**
 * test-scripts.mjs — P6(A) 台词云端同步 本地测试（无需 Cloudflare）
 * 运行：node --test p6-enhance/test-scripts.mjs
 *
 * 覆盖：
 *   1) save → list 往返（新增可被本人列出）
 *   2) upsert 更新已有台词内容
 *   3) 非法 initData（篡改 hash）→ 401
 *   4) 删除强制执行所有权（他人不能删）
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
