/**
 * smoke-worker.mjs — 真实 Worker 运行时（workerd）+ 真实本地 D1 冒烟测试
 *
 * 运行：npm run smoke:worker
 * 前置：无 Cloudflare 账号、无 Telegram Bot、无网络请求（全部打 127.0.0.1）。
 *
 * 与 `npm test` 的区别：npm test 全是 mock D1；这里跑的是 wrangler dev 里的
 * 真 workerd + 真 SQLite，能验证 SQL 方言、D1 batch、建表字段、路由分发是否真的成立。
 *
 * 脚本会先探测 8787 端口；若没有服务，自动拉起 `wrangler dev --config wrangler.dev.toml`
 * 并在结束时关闭。也可用 SMOKE_URL 指向别处（例如已手动启动的实例）。
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:8787';
const BOT_TOKEN = 'DEV_BOT_TOKEN:local-only-not-a-real-token';
const ADMIN_SECRET = 'dev-admin-secret-local-only';
const WEBHOOK_SECRET = 'dev-webhook-secret-local-only';
// 本地 D1 是持久化的；每次运行换一个全新 user_id，保证脚本可反复执行且状态隔离。
const USER_ID = 420000000 + Math.floor(Date.now() % 100000000);

let passed = 0;
let failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + (extra ? ' -> ' + extra : '')); }
}

async function ping() {
  try {
    const r = await fetch(BASE + '/health', { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

let child = null;
function wranglerBin() {
  const isWin = process.platform === 'win32';
  return path.join(ROOT, 'node_modules', '.bin', isWin ? 'wrangler.cmd' : 'wrangler');
}

// 从零跑通：schema.sql 全是 CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS，可重复执行。
function ensureSchema() {
  const res = spawnSync(wranglerBin(), [
    'd1', 'execute', 'teleprompter-credits', '--local',
    '--config', 'wrangler.dev.toml', '--file=./schema.sql',
    '--persist-to', '.wrangler/state', '-y',
  ], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    throw new Error('本地 D1 建表失败：' + String(res.stderr || res.stdout || '').slice(-1500));
  }
  console.log('  本地 D1 表结构已就绪（幂等建表）');
}

async function ensureServer() {
  if (await ping()) { console.log('  复用已运行的 ' + BASE); return; }
  ensureSchema();
  const bin = wranglerBin();
  child = spawn(bin, [
    'dev', '--config', 'wrangler.dev.toml',
    '--port', '8787', '--persist-to', '.wrangler/state',
    '--show-interactive-dev-session=false',
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  let log = '';
  child.stdout.on('data', (d) => { log += String(d); });
  child.stderr.on('data', (d) => { log += String(d); });
  for (let i = 0; i < 120; i++) {
    if (await ping()) { console.log('  已自动拉起 ' + BASE); return; }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error(log.slice(-4000));
  throw new Error('wrangler dev 启动超时（60s）');
}

function stopServer() {
  if (!child) return;
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* noop */ }
  } else {
    try { child.kill('SIGTERM'); } catch { /* noop */ }
  }
}

async function signInitData(userId) {
  const params = new URLSearchParams();
  params.set('user', JSON.stringify({ id: userId, first_name: 'LocalSmoke' }));
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  const keys = Array.from(params.keys()).sort();
  const dcs = keys.map((k) => k + '=' + params.get(k)).join('\n');
  const enc = (s) => new TextEncoder().encode(s);
  const k1 = await crypto.subtle.importKey('raw', enc('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = new Uint8Array(await crypto.subtle.sign('HMAC', k1, enc(BOT_TOKEN)));
  const k2 = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k2, enc(dcs)));
  params.set('hash', Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join(''));
  return params.toString();
}

async function main() {
  await ensureServer();
  const initData = await signInitData(USER_ID);
  const adminHeaders = { 'x-admin-secret': ADMIN_SECRET };

  // 1) 健康检查（单体 worker.js 的公开路由）
  let r = await fetch(BASE + '/health');
  let d = await r.json();
  ok('GET /health → 200 且单体服务在线', r.status === 200 && d.service === 'teleprompter-monolith', JSON.stringify(d));

  // 2) 验签：用本地假 BOT_TOKEN 自签合法 initData
  r = await fetch(BASE + '/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  d = await r.json();
  ok('POST /verify 合法 initData → valid:true', r.status === 200 && d.valid === true, JSON.stringify(d));

  r = await fetch(BASE + '/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: initData + 'X' }),
  });
  d = await r.json();
  ok('POST /verify 篡改 initData → valid:false', d.valid === false, JSON.stringify(d));

  // 3) 管理接口门禁（修复后 /admin 前缀已挂到单体 worker.js）
  r = await fetch(BASE + '/admin/summary');
  ok('GET /admin/summary 无密钥 → 403', r.status === 403);

  r = await fetch(BASE + '/admin/summary', { headers: adminHeaders });
  d = await r.json();
  ok('GET /admin/summary 带密钥 → 200（不再是 404）', r.status === 200 && d.ok === true, JSON.stringify(d));

  r = await fetch(BASE + '/admin?adminSecret=' + encodeURIComponent(ADMIN_SECRET));
  const html = await r.text();
  ok('GET /admin → 退款操作页可访问且说明完整', r.status === 200 && html.includes('refundStarPayment') && html.includes('forceChk'));

  r = await fetch(BASE + '/admin/refunds', { headers: adminHeaders });
  d = await r.json();
  ok('GET /admin/refunds → 14 天窗口与交易列表', r.status === 200 && d.windowDays === 14 && Array.isArray(d.items), JSON.stringify(d).slice(0, 160));

  // 4) 真实 D1 查询：Pro 状态 / 积分 / 云同步门禁
  r = await fetch(BASE + '/payments/pro-status?initData=' + encodeURIComponent(initData));
  d = await r.json();
  ok('GET /payments/pro-status（真 D1 查 users_pro）→ pro:false', r.status === 200 && d.pro === false, JSON.stringify(d));

  r = await fetch(BASE + '/credits/balance', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  d = await r.json();
  ok('POST /credits/balance（真 D1）→ 余额数值', r.status === 200 && typeof d.balance === 'number', JSON.stringify(d));

  r = await fetch(BASE + '/scripts?initData=' + encodeURIComponent(initData));
  ok('GET /scripts 非 Pro → 403 pro_required（真实门禁）', r.status === 403, 'status=' + r.status);

  // 5) 真实 D1 写入：Pro 订阅 SQL（含新增 charge_id 列）必须能在真 SQLite 上执行
  const chargeId = 'charge_smoke_' + Date.now();
  r = await fetch(BASE + '/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
    body: JSON.stringify({
      message: {
        from: { id: USER_ID },
        successful_payment: {
          currency: 'XTR', total_amount: 400,
          telegram_payment_charge_id: chargeId, invoice_payload: 'pro_month',
        },
      },
    }),
  });
  d = await r.json();
  ok('POST /payments/webhook Pro 单 → grantPro 真 D1 写入成功', r.status === 200 && d.pro === true && d.ok === true, JSON.stringify(d));

  r = await fetch(BASE + '/payments/pro-status?initData=' + encodeURIComponent(initData));
  d = await r.json();
  ok('同一用户 pro-status → pro:true（真 D1 读回）', d.pro === true && d.productId === 'pro_month', JSON.stringify(d));

  r = await fetch(BASE + '/admin/refunds', { headers: adminHeaders });
  d = await r.json();
  ok('该笔出现在可退款列表且 refundable:true', d.items.some((x) => x.chargeId === chargeId && x.refundable === true), JSON.stringify(d.items).slice(0, 200));

  r = await fetch(BASE + '/admin?adminSecret=' + encodeURIComponent(ADMIN_SECRET));
  const pageWithData = await r.text();
  ok('GET /admin → 有支付记录时渲染可点退款按钮', r.status === 200 && pageWithData.includes('button class="rf"') && pageWithData.includes('data-charge="' + chargeId + '"'));

  // 6) 退款接口的门禁与参数校验（不真的调 Bot API，用未知 chargeId）
  r = await fetch(BASE + '/admin/refund', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chargeId: 'not-exist' }),
  });
  ok('POST /admin/refund 无密钥 → 403', r.status === 403);

  r = await fetch(BASE + '/admin/refund', {
    method: 'POST', headers: { 'content-type': 'application/json', ...adminHeaders },
    body: JSON.stringify({ chargeId: 'not-exist' }),
  });
  d = await r.json();
  ok('POST /admin/refund 未知支付号 → 404', r.status === 404 && d.error === 'payment_not_found', JSON.stringify(d));

  r = await fetch(BASE + '/admin/refund', { headers: adminHeaders });
  ok('GET /admin/refund → 405（只接受 POST）', r.status === 405, 'status=' + r.status);

  r = await fetch(BASE + '/no-such-route');
  ok('未知路径 → 404 兜底', r.status === 404, 'status=' + r.status);

  console.log('\n  ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exitCode = 1;
}

try {
  await main();
} catch (e) {
  console.error('  ERROR  ' + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
} finally {
  stopServer();
}
