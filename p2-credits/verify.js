/**
 * verify.js — Telegram initData HMAC 服务端验签（共用模块）
 *
 * 被以下场景复用：
 *   - P0 各 App 的验签 Worker（teleprompter/verify worker）
 *   - P2 统一积分 Worker（credits-worker.js）：任何积分操作前先验身份，取 user_id
 *
 * 算法（Telegram 官方）：
 *   1. 解析 initData，取出 hash；其余键值按字母序排序，拼成 data_check_string（key=value\n）
 *   2. secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
 *   3. computed   = HMAC_SHA256(key=secret_key, msg=data_check_string)
 *   4. 常量时间比较 computed 与 hash
 *   5. 可选：auth_date 容差检查（默认 24h）
 *
 * 依赖：运行环境提供 Web Crypto（`crypto.subtle`）。Cloudflare Workers 与 Node 22+ 均原生具备。
 */

const DEFAULT_MAX_AGE_SECONDS = 86400; // 24h

// 常量时间比较，避免时序侧信道
export function constantTimeCompare(a, b) {
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
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key, msg) {
  const keyBuf = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', keyBuf, msg);
  return new Uint8Array(sig);
}

/**
 * 校验 Telegram Mini App 传入的 initData。
 * @param {string} initData  Telegram.WebApp.initData 原始串
 * @param {string} botToken  BotFather 下发的 bot token
 * @param {{maxAgeSeconds?: number}} [opts]
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
export async function verifyInitData(initData, botToken, opts = {}) {
  if (!initData || typeof initData !== 'string' || initData.trim() === '') {
    return { valid: false, reason: 'empty' };
  }
  if (!botToken || botToken === '__BOT_TOKEN_PLACEHOLDER__') {
    return { valid: false, reason: 'token_not_configured' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { valid: false, reason: 'no_hash' };
  params.delete('hash');

  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map((k) => k + '=' + params.get(k)).join('\n');

  const secret = await hmacSha256(bytes('WebAppData'), bytes(botToken));
  const computed = await hmacSha256(secret, bytes(dataCheckString));
  const computedHex = toHex(computed);

  if (!constantTimeCompare(computedHex, hash)) {
    return { valid: false, reason: 'bad_hash' };
  }

  const maxAge = opts.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (authDate) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - authDate) > maxAge) {
      return { valid: false, reason: 'expired' };
    }
  }

  return { valid: true };
}

/**
 * 从 initData 中提取 Telegram user_id。
 * 跨 App 通用的统一身份键：同一 Telegram 账号在任一 Mini App 的 user_id 恒定。
 * @param {string} initData
 * @returns {string|null} 形如 "123456789" 的字符串 id；解析失败返回 null
 */
export function getUserIdFromInitData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const userRaw = params.get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    return user && user.id != null ? String(user.id) : null;
  } catch {
    return null;
  }
}
