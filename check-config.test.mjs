/**
 * check-config.test.mjs — 四处配置一致性门禁（node --test）
 *
 * 防止「改一处漏三处」：wrangler.toml / wrangler.dev.toml / schema.sql /
 * worker.js 路由 / index.html CONFIG 之间的关键字段对账。
 *
 * 直接回应项目历史踩过的坑：
 *   - /admin 曾漏挂到单体路由，导致对账台 404；
 *   - P4 bounty 已下线，运行时不能再 import / 挂载；
 *   - 生产 D1 ID 误写进 dev 配置会连到云端；
 *   - 前端 API_BASE 若散落硬编码 URL 会漂移。
 *
 * 不联网、不启动服务，纯文本校验，可直接挂进 pre-push。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const prodToml = read('wrangler.toml');
const devToml = read('wrangler.dev.toml');
const schema = read('schema.sql');
const worker = read('worker.js');
const html = read('index.html');

function tomlValue(src, key) {
  const m = src.match(new RegExp('^\\s*' + key + '\\s*=\\s*"([^"]*)"', 'm'));
  return m ? m[1] : null;
}

// ════════════════════════════════════════════════════════
test('C1) 两份 wrangler 的 main / binding / database_name 一致', () => {
  for (const key of ['main', 'name']) {
    // name 允许 -dev 后缀，其余必须一致
    if (key === 'name') continue;
    assert.equal(tomlValue(prodToml, key), tomlValue(devToml, key), `${key} 两份配置不一致`);
  }
  assert.equal(tomlValue(prodToml, 'main'), 'worker.js');
  assert.equal(tomlValue(devToml, 'main'), 'worker.js');
  const bindingRe = /^binding\s*=\s*"([^"]+)"/m;
  assert.equal(prodToml.match(bindingRe)[1], devToml.match(bindingRe)[1], 'D1 binding 不一致');
  assert.equal(tomlValue(prodToml, 'database_name'), tomlValue(devToml, 'database_name'), 'D1 database_name 不一致');
  assert.equal(tomlValue(prodToml, 'database_name'), 'teleprompter-credits');
});

test('C2) 生产 D1 是真 UUID，dev 是假 UUID（防连错库）', () => {
  const prodId = tomlValue(prodToml, 'database_id');
  const devId = tomlValue(devToml, 'database_id');
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.match(prodId, uuidRe);
  assert.notEqual(prodId, '00000000-0000-0000-0000-000000000000');
  assert.equal(devId, '00000000-0000-0000-0000-000000000000', 'dev 必须用假 UUID');
});

test('C3) 单体路由挂载全部必需前缀（防 /admin 漏挂重演）', () => {
  const required = ['/credits', '/payments', '/admin', '/growth', '/scripts', '/remote', '/templates', '/compliance'];
  for (const p of required) {
    assert.ok(worker.includes("['" + p + "'"), `worker.js 漏挂路由 ${p}`);
  }
});

test('C4) 已下线的 P4 bounty 不再挂载 / 不再 import', () => {
  assert.ok(!worker.includes("['/bounty'"), 'worker.js 仍挂 /bounty');
  assert.ok(!/from\s+['"]\.\/p4-bounty\//.test(worker), 'worker.js 仍 import p4-bounty');
});

test('C5) schema.sql 建齐各模块依赖的核心表', () => {
  const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map((m) => m[1]);
  const required = [
    'users_credits', 'credits_ledger', 'payments_stars', 'users_pro', 'refunds',
    'users_referral', 'group_stats', 'gift_log', 'scripts', 'remote_sessions', 'reports',
  ];
  for (const t of required) {
    assert.ok(tables.includes(t), `schema.sql 缺表 ${t}`);
  }
});

test('C6) 前端 CONFIG 单一后端根地址，无散落硬编码 URL', () => {
  assert.ok(/API_BASE\s*:\s*''/.test(html), 'CONFIG.API_BASE 应为空占位（部署时统一填）');
  assert.ok(/function apiUrl\s*\(path\)/.test(html), '缺 apiUrl() 单一派生入口');
  assert.ok(!/[a-z0-9-]+\.workers\.dev/.test(html), 'index.html 出现硬编码 workers.dev URL，会漂移');
  // BOT_USERNAME 允许占位，但必须存在
  assert.ok(/BOT_USERNAME\s*:/.test(html), 'CONFIG 缺 BOT_USERNAME');
});

test('C7) 合规后端语言数与前端七语一致（de/fr 不再回落中文）', () => {
  const complianceI18n = read('p7-compliance/i18n.js');
  const langs = complianceI18n.match(/SUPPORTED_LANGS\s*=\s*\[([^\]]+)\]/)[1];
  for (const l of ['zh', 'en', 'de', 'fr', 'ja', 'ko', 'ru']) {
    assert.ok(langs.includes("'" + l + "'"), `合规后端缺语言 ${l}`);
  }
});
