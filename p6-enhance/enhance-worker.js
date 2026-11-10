/**
 * enhance-worker.js — P6 增强模块（Cloudflare Worker, Modules 格式 + D1）
 *
 * 复用：
 *   - shared/verify.js ：initData HMAC 验签（/scripts、/remote/create 门禁）
 *   （P6 不依赖积分/账本，故 ledger-core 无需引入；也绝不重造验签或账本逻辑。）
 *
 * 三大路由合入本 Worker（D1 bind = env.DB；BOT_TOKEN / ADMIN_SECRET 来自 env）：
 *   A) 台词云端同步 /scripts        （initData 验签：list / save 即 upsert / delete owner-only）
 *   B) 双设备远程控制 /remote/*      （Telegram 中转的共享 token；create 需验签，command/state 凭 token）
 *   D) 台词模板库 /templates         （PUBLIC，无鉴权；返回中性口播框架）
 *
 * 合规铁律（凌驾一切，美国 App Store）：
 *   - 模板库只放"中性口播框架"，不含绝对化承诺用语
 *   - 远程控制只是设备间播放指令中转，绝不涉及 P2P 转账 / 赌博
 *   - secret（BOT_TOKEN / ADMIN_SECRET）保持占位，部署时由 wrangler secret put 注入
 *
 * 存储防护（2026-11-10）：/scripts POST 是唯一能让用户无上限写 D1 的入口。
 * 未加限制时单篇可塞到 D1 单行上限 2 MB、篇数不限，足以撑爆免费额度或被恶意刷量。
 * 现按「请求体 → 字段类型 → 字段字节数 → 每用户篇数」四层拦截，且只作用于新增。
 */

import { verifyInitData, getUserIdFromInitData } from '../shared/verify.js';
import { TEMPLATES } from './templates.js';

const ALLOWED_CMDS = ['play', 'pause', 'speed'];

// ── /scripts 写入配额（防撑爆 D1 免费额度 / 恶意刷量）──
// 按 UTF-8 字节而非 JS 字符数计算：中文 3 字节/字，与 D1 实际占用一致。
// 请求体上限留出 JSON 转义（最坏约 2 倍）与 initData 的开销，避免误拒合法长稿。
const SCRIPT_LIMITS = Object.freeze({
  MAX_CONTENT_BYTES: 100 * 1024,  // 单篇正文 100 KiB
  MAX_TITLE_BYTES:   1024,        // 标题 1 KiB
  MAX_PER_USER:      200,         // 每用户最多 200 篇
  MAX_BODY_BYTES:    256 * 1024,  // 整个请求体 256 KiB
});

function utf8Bytes(s) {
  return new TextEncoder().encode(s).length;
}

/**
 * 仅供 /scripts POST 使用：先用 Content-Length 快速拒绝明显超大的请求，
 * 再读文本按实际 UTF-8 字节数复核（防伪造 header / chunked 无长度）。
 * 其他路由继续用 readJson()，行为保持不变。
 */
async function readJsonLimited(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: 'payload_too_large' };
  }
  let raw;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  if (utf8Bytes(raw) > maxBytes) {
    return { ok: false, status: 413, error: 'payload_too_large' };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: 'invalid_body' };
    }
    return { ok: true, body: parsed };
  } catch {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
}

// ── D1 Store 适配器（实现 P6 所需的 scripts / remote_sessions 读写）──
class D1EnhanceStore {
  constructor(db) {
    this.db = db;
  }

  // ── scripts ──
  async countScripts(userId) {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS n FROM scripts WHERE user_id = ?')
      .bind(userId)
      .first();
    return Number(row?.n ?? 0);
  }
  async listScripts(userId) {
    const rows = await this.db
      .prepare('SELECT id, user_id, title, content, updated_at FROM scripts WHERE user_id = ? ORDER BY updated_at DESC')
      .bind(userId)
      .all();
    return rows.results ?? [];
  }
  async getScript(id) {
    return this.db
      .prepare('SELECT id, user_id, title, content, updated_at FROM scripts WHERE id = ?')
      .bind(id)
      .first();
  }
  async insertScript({ userId, title, content, updatedAt }) {
    const info = await this.db
      .prepare('INSERT INTO scripts (user_id, title, content, updated_at) VALUES (?,?,?,?)')
      .bind(userId, title, content, updatedAt)
      .run();
    const id = info.meta?.lastRowId ?? info.meta?.changes ?? null;
    return this.getScript(id);
  }
  async updateScript({ id, userId, title, content, updatedAt }) {
    await this.db
      .prepare('UPDATE scripts SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?')
      .bind(title, content, updatedAt, id, userId)
      .run();
    return this.getScript(id);
  }
  async deleteScript({ id, userId }) {
    const info = await this.db
      .prepare('DELETE FROM scripts WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();
    return (info.meta?.changes ?? 0) > 0;
  }

  // ── users_pro（与 payments 同 D1；云同步是 Pro 权益，未订阅禁止读写）──
  async getProStatus(userId) {
    const row = await this.db
      .prepare('SELECT user_id, expires_at FROM users_pro WHERE user_id = ? AND expires_at > ?')
      .bind(userId, Date.now())
      .first();
    return !!row;
  }

  // ── remote_sessions ──
  async createSession({ ownerUserId, sessionToken, createdAt }) {
    await this.db
      .prepare('INSERT INTO remote_sessions (owner_user_id, session_token, last_command, created_at, updated_at) VALUES (?,?,?,?,?)')
      .bind(ownerUserId, sessionToken, null, createdAt, createdAt)
      .run();
    return this.getSession(sessionToken);
  }
  async getSession(token) {
    return this.db
      .prepare('SELECT id, owner_user_id, session_token, last_command, created_at, updated_at FROM remote_sessions WHERE session_token = ?')
      .bind(token)
      .first();
  }
  async updateCommand({ token, lastCommand, updatedAt }) {
    await this.db
      .prepare('UPDATE remote_sessions SET last_command = ?, updated_at = ? WHERE session_token = ?')
      .bind(lastCommand, updatedAt, token)
      .run();
    return this.getSession(token);
  }
}

// ── HTTP 工具 ──────────────────────────────────────────────
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function corsPreflight() {
  return new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    },
  });
}

// 验签并取 user_id（复用 P2 verify.js）
async function authUser(initData, env) {
  const v = await verifyInitData(initData, env.BOT_TOKEN);
  if (!v.valid) return { ok: false, status: 401, error: v.reason };
  const userId = getUserIdFromInitData(initData);
  if (!userId) return { ok: false, status: 401, error: 'no_user_id' };
  return { ok: true, userId };
}

// 生成随机的 session_token（Web Crypto；Cloudflare Workers 与 Node 22+ 均原生支持）
function mintToken() {
  return (globalThis.crypto?.randomUUID?.() || 'tok_' + Date.now() + '_' + Math.random().toString(16).slice(2));
}

// ── 路由 ───────────────────────────────────────────────────
async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') return corsPreflight();

  // ── D) 模板库（PUBLIC，无鉴权）──
  if (path === '/templates') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    return json({ templates: TEMPLATES });
  }

  // ── A) 台词云端同步（Pro 权益：未订阅禁止读写，避免非付费占用云存储）──
  if (path === '/scripts') {
    if (request.method === 'GET') {
      const initData = url.searchParams.get('initData') || '';
      const a = await authUser(initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const store = new D1EnhanceStore(env.DB);
      if (!(await store.getProStatus(a.userId))) return json({ error: 'pro_required' }, 403);
      const list = await store.listScripts(a.userId);
      return json({ scripts: list });
    }
    if (request.method === 'POST') {
      const parsed = await readJsonLimited(request, SCRIPT_LIMITS.MAX_BODY_BYTES);
      if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
      const body = parsed.body;
      const a = await authUser(body.initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const { id, title, content } = body;
      if (!title || content == null) return json({ error: 'missing_fields' }, 400);
      // 类型校验必须先于字节校验：非字符串会绕过 utf8Bytes，且会以异常值写入 D1。
      if (typeof title !== 'string' || typeof content !== 'string') {
        return json({ error: 'invalid_fields' }, 400);
      }
      if (utf8Bytes(title) > SCRIPT_LIMITS.MAX_TITLE_BYTES) {
        return json({ error: 'title_too_long' }, 400);
      }
      if (utf8Bytes(content) > SCRIPT_LIMITS.MAX_CONTENT_BYTES) {
        return json({ error: 'content_too_long' }, 400);
      }
      const store = new D1EnhanceStore(env.DB);
      if (!(await store.getProStatus(a.userId))) return json({ error: 'pro_required' }, 403);
      const now = Date.now();
      if (id != null) {
        const existing = await store.getScript(id);
        if (!existing) return json({ error: 'not_found' }, 404);
        if (existing.user_id !== a.userId) return json({ error: 'forbidden' }, 403); // 越权拒删/改
        const updated = await store.updateScript({ id, userId: a.userId, title, content, updatedAt: now });
        return json({ script: updated });
      }
      // 仅新增消耗配额；更新已有讲稿不受篇数上限影响。
      if ((await store.countScripts(a.userId)) >= SCRIPT_LIMITS.MAX_PER_USER) {
        return json({ error: 'script_limit_reached', limit: SCRIPT_LIMITS.MAX_PER_USER }, 409);
      }
      const created = await store.insertScript({ userId: a.userId, title, content, updatedAt: now });
      return json({ script: created });
    }
    if (request.method === 'DELETE') {
      const body = await readJson(request);
      const a = await authUser(body.initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const store = new D1EnhanceStore(env.DB);
      if (!(await store.getProStatus(a.userId))) return json({ error: 'pro_required' }, 403);
      const { id } = body;
      if (id == null) return json({ error: 'missing_id' }, 400);
      const existing = await store.getScript(id);
      if (!existing) return json({ error: 'not_found' }, 404);
      if (existing.user_id !== a.userId) return json({ error: 'forbidden' }, 403); // 所有权校验
      await store.deleteScript({ id, userId: a.userId });
      return json({ ok: true });
    }
    return json({ error: 'method_not_allowed' }, 405);
  }

  // ── B) 双设备远程控制 ──
  if (path === '/remote/create') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    const body = await readJson(request);
    const a = await authUser(body.initData, env);
    if (!a.ok) return json({ error: a.error }, a.status);
    const store = new D1EnhanceStore(env.DB);
    // 双设备遥控是 Pro 权益：仅 Pro 订阅者可创建（托管）遥控会话；控制端凭 token 操作，无需 Pro。
    if (!(await store.getProStatus(a.userId))) return json({ error: 'pro_required' }, 403);
    const now = Date.now();
    const token = mintToken();
    await store.createSession({ ownerUserId: a.userId, sessionToken: token, createdAt: now });
    return json({ sessionToken: token, owner_user_id: a.userId, created_at: now });
  }

  if (path === '/remote/command') {
    if (request.method !== 'POST') return json({ error: 'method_not_post' }, 405);
    const token = url.searchParams.get('token');
    if (!token) return json({ error: 'missing_token' }, 401);
    const store = new D1EnhanceStore(env.DB);
    const session = await store.getSession(token);
    if (!session) return json({ error: 'invalid_token' }, 401);
    const body = await readJson(request);
    const { cmd, value } = body;
    if (!ALLOWED_CMDS.includes(cmd)) return json({ error: 'invalid_cmd' }, 400);
    const now = Date.now();
    const lastCommand = JSON.stringify({ cmd, value: value ?? null, updated_at: now });
    await store.updateCommand({ token, lastCommand, updatedAt: now });
    return json({ ok: true, command: { cmd, value: value ?? null } });
  }

  if (path === '/remote/state') {
    if (request.method !== 'GET') return json({ error: 'method_not_get' }, 405);
    const token = url.searchParams.get('token');
    if (!token) return json({ error: 'missing_token' }, 401);
    const store = new D1EnhanceStore(env.DB);
    const session = await store.getSession(token);
    if (!session) return json({ error: 'invalid_token' }, 401);
    let command = null;
    if (session.last_command) {
      try { command = JSON.parse(session.last_command); } catch { command = null; }
    }
    return json({ token, command, updated_at: session.updated_at });
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env);
  },
};
