/**
 * test-http-endpoints.mjs — B 层：单体 worker.fetch 的真实 HTTP 级测试
 *
 * 与 test-compliance.mjs 的区别：后者只 import 纯函数（compliance-core），
 * 这里真正走 worker.js 的路由分发 + compliance-worker.js 的 handle()，
 * 覆盖 CORS 预检、405、404、七语声明 HTTP 响应、举报写入 D1。
 *
 * 不依赖 Cloudflare：用内存 DB stub 满足 D1ComplianceStore.prepare().bind().run()。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker.js';

// —— 内存 D1 stub：只需支撑 reports 表 INSERT ——
function makeReportsDB() {
  const rows = [];
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              rows.push({ sql, params });
              return { meta: { last_row_id: rows.length } };
            },
          };
        },
      };
    },
    _rows: rows,
  };
}

const DB = makeReportsDB();
const ENV = { DB, BOT_TOKEN: undefined, ADMIN_SECRET: 'test-admin' };
const BASE = 'https://teleprompter.test.workers.dev';

function req(path, init) {
  return worker.fetch(new Request(BASE + path, init), ENV, {});
}
async function jsonBody(res) {
  return JSON.parse(await res.text());
}

// ════════════════════════════════════════════════════════
test('B1) OPTIONS 全局 CORS 预检 → 204 + 允许方法与头', async () => {
  const r = await req('/compliance/disclaimer', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const methods = r.headers.get('access-control-allow-methods') || '';
  assert.ok(methods.includes('GET') && methods.includes('POST'));
  const headers = r.headers.get('access-control-allow-headers') || '';
  assert.ok(headers.includes('x-telegram-bot-api-secret-token'));
});

test('B2) 未知路径 → 404 not_found', async () => {
  const r = await req('/compliance/nonexistent');
  assert.equal(r.status, 404);
  const d = await jsonBody(r);
  assert.equal(d.error, 'not_found');
});

test('B3) 顶层未知前缀 → 404 带 path 回显', async () => {
  const r = await req('/totally-unknown');
  assert.equal(r.status, 404);
  const d = await jsonBody(r);
  assert.equal(d.error, 'not_found');
  assert.equal(d.path, '/totally-unknown');
});

test('B4) /compliance/disclaimer 默认 zh', async () => {
  const r = await req('/compliance/disclaimer');
  assert.equal(r.status, 200);
  const d = await jsonBody(r);
  assert.equal(d.lang, 'zh');
  assert.ok(d.body && d.title);
});

test('B5) /compliance/disclaimer 七语经 HTTP 各自返回本地文本', async () => {
  for (const lang of ['zh', 'en', 'de', 'fr', 'ja', 'ko', 'ru']) {
    const r = await req('/compliance/disclaimer?lang=' + lang);
    assert.equal(r.status, 200, lang);
    const d = await jsonBody(r);
    assert.equal(d.lang, lang, `${lang} HTTP 返回语言不符`);
    assert.ok(d.body, `${lang} 缺 body`);
  }
});

test('B6) /compliance/disclaimer 非法语言回落 zh（经 HTTP）', async () => {
  const r = await req('/compliance/disclaimer?lang=xx');
  const d = await jsonBody(r);
  assert.equal(d.lang, 'zh');
});

test('B7) /compliance/disclaimer 非 GET → 405 method_not_get', async () => {
  const r = await req('/compliance/disclaimer', { method: 'POST', body: '{}' });
  assert.equal(r.status, 405);
  const d = await jsonBody(r);
  assert.equal(d.error, 'method_not_get');
});

test('B8) /compliance/report POST 正常写入 D1 并返回 id', async () => {
  const before = DB._rows.length;
  const r = await req('/compliance/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'abuse', targetId: 'script-9', detail: '侵权', userId: '123' }),
  });
  assert.equal(r.status, 200);
  const d = await jsonBody(r);
  assert.equal(d.ok, true);
  assert.equal(typeof d.id, 'number');
  assert.equal(DB._rows.length, before + 1, '未写入 D1');
  assert.ok(DB._rows[DB._rows.length - 1].sql.includes('INSERT INTO reports'));
});

test('B9) /compliance/report 空 detail → 400 empty_detail，不写库', async () => {
  const before = DB._rows.length;
  const r = await req('/compliance/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ detail: '   ' }),
  });
  assert.equal(r.status, 400);
  const d = await jsonBody(r);
  assert.equal(d.error, 'empty_detail');
  assert.equal(DB._rows.length, before, '空举报不应写库');
});

test('B10) /verify 非 POST → 405（单体顶层端点）', async () => {
  const r = await req('/verify', { method: 'GET' });
  assert.equal(r.status, 405);
  const d = await jsonBody(r);
  assert.equal(d.valid, false);
  assert.equal(d.reason, 'method_not_post');
});

test('B11) /health 健康检查列出全部模块', async () => {
  const r = await req('/health');
  assert.equal(r.status, 200);
  const d = await jsonBody(r);
  assert.equal(d.status, 'ok');
  for (const m of ['credits', 'payments', 'growth', 'enhance', 'compliance', 'verify']) {
    assert.ok(d.modules.includes(m), `health 缺模块 ${m}`);
  }
});
