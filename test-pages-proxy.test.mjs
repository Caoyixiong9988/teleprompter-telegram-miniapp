/**
 * Pages Function /api/* 同源代理单测（node --test）
 * 覆盖：路径剥离 /api、Service Binding 优先、敏感 hop-by-hop 头不透传、
 *       GET 查询串保留、Binding 抛错回退边缘 fetch、双失败返回 502。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from './functions/api/[[path]].js';

function ctx(opts = {}) {
  const seen = { urls: [], headers: [] };
  const impl = opts.impl || (async (req) => {
    seen.urls.push(String(req.url));
    seen.headers.push(req.headers);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  });
  const env = { BACKEND: { fetch: impl } };
  const request = new Request(opts.url || 'https://teleprompter-49y.pages.dev/api/payments/pro-status?initData=abc', {
    method: opts.method || 'GET',
    headers: opts.headers || { host: 'teleprompter-49y.pages.dev', 'content-type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
    body: opts.body
  });
  return { context: { request, env }, seen };
}

test('P1) /api 前缀被剥离，查询串原样转发到 Worker', async () => {
  const { context, seen } = ctx();
  const res = await onRequest(context);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(seen.urls[0], 'https://teleprompter-monolith.sd-4e4eb6f1.workers.dev/payments/pro-status?initData=abc');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('P2) host / cf-* 等逐跳头不透传，content-type 保留', async () => {
  const { context, seen } = ctx();
  await onRequest(context);
  const h = seen.headers[0];
  assert.equal(h.get('host'), null);
  assert.equal(h.get('cf-connecting-ip'), null);
  assert.equal(h.get('content-type'), 'application/json');
});

test('P3) POST body 与 method 原样转发', async () => {
  const seenBodies = [];
  const { context } = ctx({
    method: 'POST',
    body: JSON.stringify({ initData: 'x', productId: 'pro_month' }),
    impl: async (req) => {
      seenBodies.push({ method: req.method, body: await req.text() });
      return new Response('{}', { status: 200 });
    }
  });
  await onRequest(context);
  assert.equal(seenBodies[0].method, 'POST');
  assert.equal(seenBodies[0].body, '{"initData":"x","productId":"pro_month"}');
});

test('P4) Service Binding 抛错时回退边缘 fetch', async () => {
  let fellBack = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    fellBack = true;
    assert.ok(String(u).includes('/verify'));
    return new Response('{"valid":false}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const { context } = ctx({
      url: 'https://teleprompter-49y.pages.dev/api/verify',
      impl: async () => { throw new Error('binding_down'); }
    });
    const res = await onRequest(context);
    assert.equal(res.status, 200);
    assert.equal(fellBack, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('P5) 两条链路都失败返回 502，不带假成功响应', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('edge_down'); };
  try {
    const { context } = ctx({ impl: async () => { throw new Error('binding_down'); } });
    const res = await onRequest(context);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: 'backend_unreachable' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('P6) 空路径返回 400', async () => {
  const { context } = ctx({ url: 'https://teleprompter-49y.pages.dev/api' });
  const res = await onRequest(context);
  assert.equal(res.status, 400);
});
