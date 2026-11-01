/**
 * enhance-worker.js — P6 增强模块（Cloudflare Worker, Modules 格式 + D1）
 *
 * 复用：
 *   - p2-credits/verify.js ：initData HMAC 验签（/scripts、/remote/create 门禁）
 *   （P6 不依赖积分/账本，故 ledger-core 无需引入；也绝不重造验签或账本逻辑。）
 *
 * 三大路由合入本 Worker（D1 bind = env.DB；BOT_TOKEN / ADMIN_SECRET 来自 env）：
 *   A) 台词云端同步 /scripts        （initData 验签：list / save 即 upsert / delete owner-only）
 *   B) 双设备远程控制 /remote/*      （Telegram 中转的共享 token；create 需验签，command/state 凭 token）
 *   D) 台词模板库 /templates         （PUBLIC，无鉴权；返回中性口播框架，绝不含算命/预测文案）
 *
 * 合规铁律（凌驾一切，美国 App Store）：
 *   - 模板库只放"中性口播框架"，绝不含算命/运势/预测/吉凶/卦/风水/占卜等内容
 *   - 远程控制只是设备间播放指令中转，绝不涉及 P2P 转账 / 赌博 / 预测
 *   - secret（BOT_TOKEN / ADMIN_SECRET）保持占位，部署时由 wrangler secret put 注入
 */

import { verifyInitData, getUserIdFromInitData } from '../p2-credits/verify.js';
import { TEMPLATES } from './templates.js';

const ALLOWED_CMDS = ['play', 'pause', 'speed'];

// ── D1 Store 适配器（实现 P6 所需的 scripts / remote_sessions 读写）──
class D1EnhanceStore {
  constructor(db) {
    this.db = db;
  }

  // ── scripts ──
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

// 生成不可预测的 session_token（Web Crypto；Cloudflare Workers 与 Node 22+ 均原生支持）
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

  // ── A) 台词云端同步 ──
  if (path === '/scripts') {
    if (request.method === 'GET') {
      const initData = url.searchParams.get('initData') || '';
      const a = await authUser(initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const store = new D1EnhanceStore(env.DB);
      const list = await store.listScripts(a.userId);
      return json({ scripts: list });
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      const a = await authUser(body.initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const { id, title, content } = body;
      if (!title || content == null) return json({ error: 'missing_fields' }, 400);
      const store = new D1EnhanceStore(env.DB);
      const now = Date.now();
      if (id != null) {
        const existing = await store.getScript(id);
        if (!existing) return json({ error: 'not_found' }, 404);
        if (existing.user_id !== a.userId) return json({ error: 'forbidden' }, 403); // 越权拒删/改
        const updated = await store.updateScript({ id, userId: a.userId, title, content, updatedAt: now });
        return json({ script: updated });
      }
      const created = await store.insertScript({ userId: a.userId, title, content, updatedAt: now });
      return json({ script: created });
    }
    if (request.method === 'DELETE') {
      const body = await readJson(request);
      const a = await authUser(body.initData, env);
      if (!a.ok) return json({ error: a.error }, a.status);
      const { id } = body;
      if (id == null) return json({ error: 'missing_id' }, 400);
      const store = new D1EnhanceStore(env.DB);
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
