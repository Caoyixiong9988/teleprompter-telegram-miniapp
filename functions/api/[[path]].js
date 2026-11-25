/**
 * Pages Function：同源后端代理 /api/*
 *
 * 背景：单体 Worker 已部署在 *.workers.dev，且 BOT_TOKEN / ADMIN_SECRET /
 * WEBHOOK_SECRET 均已配置；但国内网络到 workers.dev 不通，而 pages.dev 可达。
 * 前端只请求同源 /api/...，由 Cloudflare 边缘节点把请求转发给 Worker
 * （优先 Service Binding，失败回退云端 fetch），这样：
 *   1. 用户设备不需要直连 workers.dev；
 *   2. 同源请求不产生 CORS 预检；
 *   3. Worker 仍是 Pro 权益 / 支付 / 验签的唯一真相，代理不缓存、不伪造任何响应。
 *
 * 注意：functions/ 必须位于运行 wrangler 的 cwd（项目根），不能放在静态输出目录里，
 * 否则部署日志不会出现 "Uploading Functions bundle"，路由会返回 405 空 body。
 */

const UPSTREAM = 'https://teleprompter-monolith.sd-4e4eb6f1.workers.dev';

function proxyHeaders(original) {
  const h = new Headers();
  const skip = new Set([
    'host', 'connection', 'content-length', 'cf-connecting-ip',
    'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-forwarded-proto'
  ]);
  original.forEach(function (value, key) {
    if (!skip.has(key.toLowerCase())) h.set(key, value);
  });
  return h;
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  if (!path) {
    return new Response(JSON.stringify({ error: 'proxy_path_required' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  const target = UPSTREAM + '/' + path + url.search;
  const init = {
    method: request.method,
    headers: proxyHeaders(request.headers),
    redirect: 'manual',
    // Node 单测里用 ReadableStream 作为 body 时必须声明 duplex；Workers 运行时忽略该字段。
    duplex: 'half'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  let upstream;
  const binding = context.env && context.env.BACKEND;
  try {
    if (binding && typeof binding.fetch === 'function') {
      upstream = await binding.fetch(new Request(target, init));
    } else {
      upstream = await fetch(target, init);
    }
  } catch (e) {
    // Service Binding 在个别项目配置未生效时回退到边缘 fetch，避免线上支付整体不可用。
    try {
      upstream = await fetch(target, init);
    } catch (e2) {
      return new Response(JSON.stringify({ error: 'backend_unreachable' }), {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    }
  }

  const headers = new Headers(upstream.headers);
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: headers
  });
}
