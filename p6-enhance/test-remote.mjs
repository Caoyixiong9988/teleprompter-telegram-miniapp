/**
 * test-remote.mjs — P6(B) 双设备远程控制 本地测试（无需 Cloudflare）
 * 运行：node --test p6-enhance/test-remote.mjs
 *
 * 覆盖：
 *   1) Pro 用户 create 经验签铸造 session_token
 *   2) 非 Pro 用户 create 被拒(403 pro_required)
 *   3) command 更新状态；getState 返回最新指令
 *   4) 缺失 / 无效 token → 401
 *   5) 非法 cmd → 400；未授权 create（坏 initData）→ 401
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import worker from './enhance-worker.js';
import { makeEnv, signInitData, BOT_TOKEN } from './test-helpers.mjs';

const ENV = makeEnv();

function req(method, path, body, query) {
  let url = 'https://x' + path;
  if (query) url += '?' + query;
  const init = { method, headers: { 'content-type': 'application/json' } };
  if (body) init.body = JSON.stringify(body);
  return worker.fetch(new Request(url, init), ENV);
}

test('1) Pro 用户 create 经验签铸造 session_token', async () => {
  ENV.DB.grantPro('u_remote_1');
  const init = await signInitData(BOT_TOKEN, 'u_remote_1');
  const r = await req('POST', '/remote/create', { initData: init });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(typeof d.sessionToken === 'string' && d.sessionToken.length > 0, '应返回非空 token');
  assert.equal(d.owner_user_id, 'u_remote_1');
});

test('2) 非 Pro 用户 create 被拒(403 pro_required)', async () => {
  const init = await signInitData(BOT_TOKEN, 'u_remote_free');
  const r = await req('POST', '/remote/create', { initData: init });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'pro_required');
});

test('3) command 更新状态；getState 返回最新指令', async () => {
  ENV.DB.grantPro('u_remote_2');
  const init = await signInitData(BOT_TOKEN, 'u_remote_2');
  const { sessionToken: token } = (await req('POST', '/remote/create', { initData: init }).then((r) => r.json()));

  // 先 pause
  let c = await req('POST', '/remote/command', { cmd: 'pause' }, 'token=' + encodeURIComponent(token));
  assert.equal(c.status, 200);
  let st = (await req('GET', '/remote/state', null, 'token=' + encodeURIComponent(token)).then((r) => r.json()));
  assert.equal(st.command.cmd, 'pause');
  assert.equal(st.command.value, null);
  assert.ok(typeof st.command.updated_at === 'number');

  // 再 speed=1.5（应覆盖为最新）
  c = await req('POST', '/remote/command', { cmd: 'speed', value: 1.5 }, 'token=' + encodeURIComponent(token));
  assert.equal(c.status, 200);
  st = (await req('GET', '/remote/state', null, 'token=' + encodeURIComponent(token)).then((r) => r.json()));
  assert.equal(st.command.cmd, 'speed');
  assert.equal(st.command.value, 1.5);
  assert.ok(typeof st.command.updated_at === 'number', 'getState 必须返回最新指令');
});

test('4) 缺失 / 无效 token → 401', async () => {
  // 缺 token
  let r = await req('POST', '/remote/command', { cmd: 'play' });
  assert.equal(r.status, 401);

  // 无效 token
  r = await req('POST', '/remote/command', { cmd: 'play' }, 'token=does_not_exist');
  assert.equal(r.status, 401);

  // getState 无效 token
  r = await req('GET', '/remote/state', null, 'token=nope');
  assert.equal(r.status, 401);
});

test('5) 非法 cmd → 400；未授权 create → 401', async () => {
  ENV.DB.grantPro('u_remote_3');
  const init = await signInitData(BOT_TOKEN, 'u_remote_3');
  const { sessionToken: token } = (await req('POST', '/remote/create', { initData: init }).then((r) => r.json()));

  const badCmd = await req('POST', '/remote/command', { cmd: 'fly' }, 'token=' + encodeURIComponent(token));
  assert.equal(badCmd.status, 400, '非法 cmd 应被拒');

  const badInit = await req('POST', '/remote/create', { initData: (await signInitData(BOT_TOKEN, 'x')) + 'X' });
  assert.equal(badInit.status, 401, '坏 initData 的 create 应被拒');
});
