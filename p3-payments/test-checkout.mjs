/**
 * test-checkout.mjs — 前端 Stars 官方收银台接入回归测试
 *
 * 运行：npm test（已加入测试列表），或单独 node --test p3-payments/test-checkout.mjs
 * 思路：jsdom 真实加载单文件 index.html，stub fetch / Telegram.WebApp.openInvoice，
 *       驱动真实 DOM 点击，验证「下单 → 拉起收银台 → 服务端确认权益」整条前端链路。
 *
 * 两条红线：
 *   ① openInvoice 回调报 paid 绝不直接写 state.isPro，Pro 唯一真相是 /payments/pro-status；
 *   ② 「升级 Pro」只能买 pro_month / pro_year，绝不能误买 credits_* 积分包。
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { botApiUrl } from './payments-worker.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
  virtualConsole: vc,
  // 页面有语音检测 setInterval 与滚动 requestAnimationFrame 循环，停掉以免进程不退出。
  beforeParse(win) {
    win.setInterval = () => 0;
    win.clearInterval = () => {};
    win.requestAnimationFrame = () => 0;
    win.cancelAnimationFrame = () => {};
  }
});
const w = dom.window;
w.TextDecoder = TextDecoder;
w.TextEncoder = TextEncoder;
await new Promise(r => setTimeout(r, 200));

const ev = expr => w.eval(expr);
const doc = w.document;
const btn = doc.getElementById('btnProCta');
const toastText = () => doc.getElementById('toast').textContent;
const tick = () => new Promise(r => setTimeout(r, 25));

let calls = [];
let proStatusValue = true;
let invoiceHandler = () => {}; // (link, cb) => void

function mockFetch() {
  w.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/payments/invoice')) {
      return { ok: true, json: async () => ({ invoiceLink: 'https://t.me/invoice/TEST_LINK', productId: 'pro_month', stars: 400 }) };
    }
    if (String(url).includes('/payments/pro-status')) {
      return { ok: true, json: async () => ({ pro: proStatusValue }) };
    }
    return { ok: false, json: async () => ({}) };
  };
}

function setupTelegram() {
  w.Telegram = {
    WebApp: {
      initData: 'fake-init-data',
      openInvoice: (link, cb) => invoiceHandler(link, cb)
    }
  };
}

function reset() {
  calls = [];
  proStatusValue = true;
  invoiceHandler = () => {};
  mockFetch();
  setupTelegram();
  ev(`
    CONFIG.API_BASE = 'https://api.example.com';
    PAY_CONFIRM.delays = [0, 0, 0, 0];
    payInFlight = false;
    state.isPro = false;
    setProPlan('month');
  `);
  btn.disabled = false;
  btn.textContent = ev('t("proCta")');
  doc.getElementById('toast').textContent = '';
  doc.getElementById('proSheet').classList.add('hidden');
}

// ── 1. 静态契约 ──────────────────────────────────────────────────────
test('1) 页面无运行时错误，收银台函数齐备，CTA 不再是「即将上线」占位', () => {
  assert.equal(errors.length, 0, errors.join(' | '));
  for (const f of ['proProductId', 'normalizeInvoiceStatus', 'setProPlan', 'openProCheckout', 'confirmProAfterPay', 'tgWebApp', 'setPayBusy']) {
    assert.equal(ev(`typeof ${f}`), 'function', `缺 ${f}`);
  }
  const src = ev('openProCheckout.toString()');
  assert.ok(src.includes('/payments/invoice'), '未接后端下单接口');
  assert.ok(src.includes('openInvoice'), '未拉起官方收银台');
  assert.ok(src.includes('confirmProAfterPay'), '未做服务端权益确认');
  assert.equal(src.includes('proCtaSoon'), false, 'CTA 不得再只弹「即将上线」');
  assert.equal(src.includes('state.isPro ='), false, '客户端回调不得直接写 Pro 状态');
});

test('2) 七语新增 9 个支付键齐全，键集一致（各 255 键）', () => {
  const keys = ['payNoBackend', 'payNoTg', 'payUnsupported', 'payOpening', 'payCreateFail', 'payCancelled', 'payFailed', 'paySuccess', 'payPending'];
  for (const lang of ['zh', 'en', 'de', 'fr', 'ja', 'ko', 'ru']) {
    for (const k of keys) assert.ok(ev(`I18N.${lang}.${k}`), `${lang} 缺 ${k}`);
  }
  const sizes = ['zh', 'en', 'de', 'fr', 'ja', 'ko', 'ru'].map(l => ev(`Object.keys(I18N.${l}).length`));
  assert.deepEqual(sizes, [255, 255, 255, 255, 255, 255, 255]);
});

// ── 2. 纯函数边界 ────────────────────────────────────────────────────
test('3) 商品白名单：只有 month/year，积分包与原型链键一律拒绝', () => {
  assert.equal(ev(`proProductId('month')`), 'pro_month');
  assert.equal(ev(`proProductId('year')`), 'pro_year');
  for (const bad of ['credits_pro', '__proto__', 'constructor', 'toString', '', 'MONTH']) {
    assert.equal(ev(`proProductId(${JSON.stringify(bad)})`), null, `${bad} 不应通过白名单`);
  }
  assert.equal(ev('proProductId(undefined)'), null);
});

test('4) openInvoice 回调状态归一化（字符串 / 布尔 / 未知）', () => {
  const cases = [['paid', 'paid'], ['cancelled', 'cancelled'], ['failed', 'failed'], ['pending', 'pending'], [true, 'paid'], [false, 'cancelled'], ['weird', 'failed']];
  for (const [input, want] of cases) {
    assert.equal(ev(`normalizeInvoiceStatus(${JSON.stringify(input)})`), want, JSON.stringify(input));
  }
  assert.equal(ev('normalizeInvoiceStatus(undefined)'), 'failed');
});

test('5) 套餐选择：默认月付，点年付切换，非法值不改选择', () => {
  reset();
  assert.equal(ev('selectedProPlan'), 'month');
  const m = doc.getElementById('proPlanMonth');
  const y = doc.getElementById('proPlanYear');
  assert.equal(m.classList.contains('selected'), true);
  y.click();
  assert.equal(ev('selectedProPlan'), 'year');
  assert.equal(y.classList.contains('selected'), true);
  assert.equal(y.getAttribute('aria-pressed'), 'true');
  assert.equal(m.getAttribute('aria-pressed'), 'false');
  ev(`setProPlan('__proto__')`);
  assert.equal(ev('selectedProPlan'), 'year', '非法套餐不得改动选择');
  m.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(ev('selectedProPlan'), 'month', '键盘回车应可选套餐');
});

// ── 3. 前置校验（不得发出任何请求） ──────────────────────────────────
test('6) 无后端 / 不在 Telegram / 无 initData / 旧版客户端：均不下单', async () => {
  reset();
  ev(`CONFIG.API_BASE = ''`);
  btn.click(); await tick();
  assert.equal(calls.length, 0);
  assert.equal(toastText(), ev('t("payNoBackend")'));

  reset();
  w.Telegram = undefined;
  btn.click(); await tick();
  assert.equal(calls.length, 0);
  assert.equal(toastText(), ev('t("payNoTg")'));

  reset();
  w.Telegram = { WebApp: { openInvoice: () => {} } };
  btn.click(); await tick();
  assert.equal(calls.length, 0);
  assert.equal(toastText(), ev('t("payNoTg")'));

  reset();
  w.Telegram = { WebApp: { initData: 'x' } };
  btn.click(); await tick();
  assert.equal(calls.length, 0);
  assert.equal(toastText(), ev('t("payUnsupported")'));
  assert.equal(btn.disabled, false);
});

// ── 4. 成功链路 ──────────────────────────────────────────────────────
test('7) 成功：下单 → openInvoice → 服务端确认 → 关闭面板并恢复按钮', async () => {
  reset();
  let opened = null;
  invoiceHandler = (link, cb) => { opened = link; cb('paid'); };
  doc.getElementById('proSheet').classList.remove('hidden');
  btn.click(); await tick();

  const inv = calls.find(c => c.url.includes('/payments/invoice'));
  assert.ok(inv, '应调用 /payments/invoice');
  assert.equal(inv.url, 'https://api.example.com/payments/invoice');
  const body = JSON.parse(inv.opts.body);
  assert.equal(body.initData, 'fake-init-data', '下单必须带 initData 供后端验签');
  assert.equal(body.productId, 'pro_month');
  assert.equal(opened, 'https://t.me/invoice/TEST_LINK');
  assert.ok(calls.some(c => c.url.includes('/payments/pro-status')), '应向服务端确认权益');
  assert.equal(ev('isPro()'), true);
  assert.equal(toastText(), ev('t("paySuccess")'));
  assert.equal(doc.getElementById('proSheet').classList.contains('hidden'), true);
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, ev('t("proCta")'));
});

test('8) 选中年付时下单商品为 pro_year', async () => {
  reset();
  doc.getElementById('proPlanYear').click();
  invoiceHandler = (link, cb) => cb('paid');
  btn.click(); await tick();
  const inv = calls.find(c => c.url.includes('/payments/invoice'));
  assert.equal(JSON.parse(inv.opts.body).productId, 'pro_year');
});

test('9) 红线：客户端报 paid 但服务端没发货，不得解锁 Pro', async () => {
  reset();
  proStatusValue = false;
  invoiceHandler = (link, cb) => cb('paid');
  btn.click(); await tick();
  assert.equal(ev('isPro()'), false, '不得因 openInvoice 回调直接置 Pro');
  assert.equal(toastText(), ev('t("payPending")'));
  assert.ok(calls.filter(c => c.url.includes('/payments/pro-status')).length >= 2, 'webhook 滞后应重试确认');
});

// ── 5. 各种回调结果 ──────────────────────────────────────────────────
test('10) 取消支付：不查权益、提示取消、按钮恢复', async () => {
  reset();
  invoiceHandler = (link, cb) => cb('cancelled');
  btn.click(); await tick();
  assert.equal(calls.some(c => c.url.includes('/payments/pro-status')), false);
  assert.equal(toastText(), ev('t("payCancelled")'));
  assert.equal(btn.disabled, false);
});

test('11) 支付失败 / 未知状态：提示失败且不查权益', async () => {
  for (const s of ['failed', 'something_weird']) {
    reset();
    invoiceHandler = (link, cb) => cb(s);
    btn.click(); await tick();
    assert.equal(toastText(), ev('t("payFailed")'));
    assert.equal(calls.some(c => c.url.includes('/payments/pro-status')), false);
  }
});

test('12) pending：继续向服务端确认，到账后提示成功', async () => {
  reset();
  invoiceHandler = (link, cb) => cb('pending');
  btn.click(); await tick();
  assert.ok(calls.some(c => c.url.includes('/payments/pro-status')));
  assert.equal(toastText(), ev('t("paySuccess")'));
});

// ── 6. 失败与并发 ────────────────────────────────────────────────────
test('13) 发票创建失败（HTTP 错误 / 断网）：不拉收银台、按钮恢复', async () => {
  reset();
  let opened = false;
  invoiceHandler = () => { opened = true; };
  w.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return { ok: false, json: async () => ({ error: 'invoice_create_failed' }) };
  };
  btn.click(); await tick();
  assert.equal(opened, false);
  assert.equal(toastText(), ev('t("payCreateFail")'));
  assert.equal(btn.disabled, false);

  reset();
  w.fetch = async () => { throw new Error('offline'); };
  btn.click(); await tick();
  assert.equal(toastText(), ev('t("payCreateFail")'));
  assert.equal(btn.disabled, false);
});

test('14) 防重复点击：收银台未回调时只下一单', async () => {
  reset();
  invoiceHandler = () => {}; // 挂起，模拟用户还没在收银台里操作
  btn.click(); await tick();
  btn.click(); await tick();
  assert.equal(calls.filter(c => c.url.includes('/payments/invoice')).length, 1);
  assert.equal(btn.disabled, true);
});

test('15) openInvoice 抛异常：按钮恢复并提示客户端不兼容', async () => {
  reset();
  w.Telegram = {
    WebApp: {
      initData: 'fake-init-data',
      openInvoice: () => { throw new Error('unsupported'); }
    }
  };
  btn.click(); await tick();
  assert.equal(toastText(), ev('t("payUnsupported")'));
  assert.equal(btn.disabled, false);
});

// ── 7. 后端 Bot API 环境（官方测试环境可零成本验真实收银台） ─────────
test('16) Bot API 地址：生产 / 官方测试环境 / 自建 Server 三态可切换', () => {
  const env = { BOT_TOKEN: 'TOKEN' };
  assert.equal(botApiUrl(env, 'createInvoiceLink'), 'https://api.telegram.org/botTOKEN/createInvoiceLink');
  assert.equal(botApiUrl({ ...env, BOT_API_TEST: '1' }, 'createInvoiceLink'), 'https://api.telegram.org/botTOKEN/test/createInvoiceLink');
  assert.equal(botApiUrl({ ...env, BOT_API_TEST: '1' }, 'refundStarPayment'), 'https://api.telegram.org/botTOKEN/test/refundStarPayment');
  assert.equal(botApiUrl({ ...env, BOT_API_BASE: 'http://127.0.0.1:8081/' }, 'getMe'), 'http://127.0.0.1:8081/botTOKEN/getMe');
  assert.equal(botApiUrl({ ...env, BOT_API_TEST: '0' }, 'getMe').includes('/test/'), false);
});

after(() => {
  try { dom.window.close(); } catch (e) { /* 已关闭 */ }
});
