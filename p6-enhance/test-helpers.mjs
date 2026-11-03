/**
 * test-helpers.mjs — P6 本地测试共用工具（无需 Cloudflare）
 * 复用与 P2/P3 一致的 initData 签发算法；提供 mock D1 + 合规关键词表。
 */
import { webcrypto } from 'node:crypto';

const cryptoObj = globalThis.crypto || webcrypto;

export const BOT_TOKEN = 'TEST_BOT_TOKEN:abc';
export const ADMIN_SECRET = 'super-secret';

// ── 签发合法 initData（与 shared/verify.js 同算法）──
export async function signInitData(botToken, userId) {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify({ id: userId, first_name: 'Tester' }));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('query_id', 'test-q');
  const keys = Array.from(params.keys()).sort();
  const dataCheckString = keys.map((k) => k + '=' + params.get(k)).join('\n');
  const enc = (s) => new TextEncoder().encode(s);
  const k1 = await cryptoObj.subtle.importKey('raw', enc('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await cryptoObj.subtle.sign('HMAC', k1, enc(botToken)));
  const k2 = await cryptoObj.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await cryptoObj.subtle.sign('HMAC', k2, enc(dataCheckString)));
  const hash = Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
  params.set('hash', hash);
  return params.toString();
}

// ── mock D1（prepare/bind/run/first/all + autoincrement lastRowId）──
export function makeMockDB() {
  const scripts = [];        // {id,user_id,title,content,updated_at}
  const pro = [];            // {user_id, expires_at}
  const remote = [];         // {id,owner_user_id,session_token,last_command,created_at,updated_at}
  let sid = 0, rid = 0;

  function exec(sql, p) {
    const r = { changes: 0, row: null, results: [], lastRowId: undefined };
    if (sql.includes('INSERT INTO scripts')) {
      const [userId, title, content, updated_at] = p;
      const id = ++sid;
      scripts.push({ id, user_id: userId, title, content, updated_at });
      r.changes = 1; r.lastRowId = id;
    } else if (sql.includes('SELECT id, user_id, title, content, updated_at FROM scripts WHERE user_id')) {
      const [userId] = p;
      r.results = scripts
        .filter((s) => s.user_id === userId)
        .sort((a, b) => b.updated_at - a.updated_at || b.id - a.id);
    } else if (sql.includes('DELETE FROM scripts')) {
      const [id, userId] = p;
      const idx = scripts.findIndex((x) => x.id === id && x.user_id === userId);
      if (idx >= 0) { scripts.splice(idx, 1); r.changes = 1; }
    } else if (sql.includes('FROM scripts WHERE id = ?')) {
      const [id] = p;
      r.row = scripts.find((s) => s.id === id) || null;
    } else if (sql.includes('UPDATE scripts SET')) {
      const [title, content, updated_at, id, userId] = p;
      const s = scripts.find((x) => x.id === id && x.user_id === userId);
      if (s) { s.title = title; s.content = content; s.updated_at = updated_at; r.changes = 1; }
    } else if (sql.includes('INSERT INTO users_pro')) {
      const [userId, expiresAt] = p;
      const existing = pro.find((x) => x.user_id === userId);
      if (existing) { existing.expires_at = expiresAt; }
      else pro.push({ user_id: userId, expires_at: expiresAt });
      r.changes = 1;
    } else if (sql.includes('FROM users_pro WHERE')) {
      const [userId, now] = p;
      const row = pro.find((x) => x.user_id === userId && x.expires_at > now);
      r.row = row || null;
    } else if (sql.includes('INSERT INTO remote_sessions')) {
      const [ownerUserId, token, lastCommand, createdAt, updatedAt] = p;
      const id = ++rid;
      remote.push({ id, owner_user_id: ownerUserId, session_token: token, last_command: lastCommand, created_at: createdAt, updated_at: updatedAt });
      r.changes = 1; r.lastRowId = id;
    } else if (sql.includes('FROM remote_sessions WHERE session_token')) {
      const [token] = p;
      r.row = remote.find((x) => x.session_token === token) || null;
    } else if (sql.includes('UPDATE remote_sessions SET')) {
      const [lastCommand, updatedAt, token] = p;
      const s = remote.find((x) => x.session_token === token);
      if (s) { s.last_command = lastCommand; s.updated_at = updatedAt; r.changes = 1; }
    }
    return r;
  }

  function prepare(sql) {
    return {
      sql,
      _args: [],
      bind(...args) { this._args = args; return this; },
      async run() { const r = exec(this.sql, this._args); return { meta: { changes: r.changes, lastRowId: r.lastRowId } }; },
      async first() { return exec(this.sql, this._args).row ?? null; },
      async all() { return { results: exec(this.sql, this._args).results }; },
    };
  }

  return {
    prepare,
    // 仅供本地测试：为用户授予 Pro（默认 30 天），模拟 payments webhook 写入 users_pro
    grantPro(userId, days = 30) {
      const expiresAt = Date.now() + days * 86400000;
      const existing = pro.find((x) => x.user_id === userId);
      if (existing) existing.expires_at = expiresAt;
      else pro.push({ user_id: userId, expires_at: expiresAt });
    },
  };
}

export function makeEnv() {
  return { DB: makeMockDB(), BOT_TOKEN, ADMIN_SECRET };
}

// ── 质量守门：模板正文不得含绝对化承诺用语（避免用户照读形成不当承诺）──
export const CLAIM_KEYWORDS = [
  '保证', '百分百', '100%', '绝对', '稳赚', '必赚', '根治', '包治', '永不复发',
  'guaranteed', 'risk-free', 'cure',
];

export function containsClaim(text) {
  const t = String(text || '');
  return CLAIM_KEYWORDS.some((k) => t.toLowerCase().includes(k.toLowerCase()));
}

