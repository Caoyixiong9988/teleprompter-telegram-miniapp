/**
 * worker.js — Telegram initData HMAC 服务端验签（P0 脚手架）
 *
 * 用途：在 Cloudflare Worker 上校验 Telegram Mini App 传入的 initData，
 *       防止伪造身份。暴露 POST /verify 端点，返回 { valid: true/false, reason? }。
 *
 * 部署格式：Service Worker（兼容 `wrangler deploy`，且可被 `node --check worker.js` 通过）。
 *
 * 必填环境变量（在 wrangler.toml [vars] 或 `wrangler secret put BOT_TOKEN`）：
 *   BOT_TOKEN  = 你的 BotFather bot token（如 123456:ABC-DEF...）
 *
 * 验签算法（Telegram 官方）：
 *   1. 解析 initData，取出 hash，其余键值按字母序排序，拼成 data_check_string（key=value\n 连接）
 *   2. secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *   3. hmac       = HMAC_SHA256(key=secret_key, msg=data_check_string)
 *   4. 比较 hex(hmac) 与 hash（常量时间比较）
 *   5. 可选：校验 auth_date 是否在容差内（默认 24h）
 */

// 占位符：部署前请通过环境变量注入真实 bot token；未配置时验签返回 false（属预期）。
const BOT_TOKEN = (typeof BOT_TOKEN !== 'undefined') ? BOT_TOKEN : '__BOT_TOKEN_PLACEHOLDER__';
const MAX_AGE_SECONDS = 86400; // auth_date 容差：24 小时

function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bytes(str) {
  return new TextEncoder().encode(str);
}

function toHex(buf) {
  return Array.from(buf).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function hmacSha256(key, msg) {
  const keyBuf = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', keyBuf, msg);
  return new Uint8Array(sig);
}

async function verifyInitData(initData) {
  if (!initData || typeof initData !== 'string' || initData.trim() === '') {
    return { valid: false, reason: 'empty' };
  }
  if (!BOT_TOKEN || BOT_TOKEN === '__BOT_TOKEN_PLACEHOLDER__') {
    return { valid: false, reason: 'token_not_configured' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false, reason: 'no_hash' };
  params.delete('hash');

  // data_check_string：键字母序排序，key=value 以 \n 连接
  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map(function (k) { return k + '=' + params.get(k); }).join('\n');

  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  const secret = await hmacSha256(bytes('WebAppData'), bytes(BOT_TOKEN));
  // hash = HMAC_SHA256(secret, data_check_string)
  const computed = await hmacSha256(secret, bytes(dataCheckString));
  const computedHex = toHex(computed);

  if (!constantTimeCompare(computedHex, hash)) {
    return { valid: false, reason: 'bad_hash' };
  }

  // 可选：auth_date 过期检查
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (authDate) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - authDate) > MAX_AGE_SECONDS) {
      return { valid: false, reason: 'expired' };
    }
  }

  return { valid: true };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*'
    }
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === '/verify') {
    if (request.method !== 'POST') {
      return jsonResponse({ valid: false, reason: 'method_not_post' }, 405);
    }
    let initData;
    try {
      const ct = request.headers.get('content-type') || '';
      if (ct.indexOf('application/json') !== -1) {
        const body = await request.json();
        initData = body && body.initData;
      } else {
        const form = await request.formData();
        initData = form.get('initData');
      }
    } catch (e) {
      return jsonResponse({ valid: false, reason: 'bad_body' }, 400);
    }
    const result = await verifyInitData(initData);
    return jsonResponse(result, 200);
  }

  return new Response(
    'Teleprompter initData verify worker.\nPOST your initData to /verify',
    { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
  );
}

addEventListener('fetch', function (event) {
  event.respondWith(handleRequest(event.request));
});
