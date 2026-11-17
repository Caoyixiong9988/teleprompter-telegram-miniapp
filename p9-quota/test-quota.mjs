/**
 * test-quota.mjs — 免费版讲稿额度 + Pro 状态修复的回归测试
 *
 * 运行：npm test（已加入测试列表），或单独 node --test p9-quota/test-quota.mjs
 * 思路：jsdom 真实加载单文件 index.html，通过 window.eval 驱动真实函数。
 *       重点验两条红线：① 限额只拦「新增」，绝不删用户已有讲稿；
 *       ② Pro 状态以服务端为唯一真相，退款/降级必须回写 false。
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

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

function resetScripts(n) {
  ev(`state.scripts = Array.from({length:${n}}, (_,i) => ({id:'s'+i,title:'稿'+i,content:'内容'+i,updatedAt:i,cloudId:null}));
       state.activeScriptId = state.scripts[0] ? state.scripts[0].id : null;
       state.isPro = false; saveState(); renderScriptList();`);
}

// ── 1. 页面与契约 ────────────────────────────────────────────────────
test('页面无运行时错误，配额与 Pro 开关函数齐备', () => {
  assert.equal(errors.length, 0, errors.join(' | '));
  assert.equal(ev('FREE_SCRIPT_LIMIT'), 3);
  for (const f of ['canAddScript', 'scriptLimitReached', 'guardScriptLimit', 'devPreviewAllowed']) {
    assert.equal(ev(`typeof ${f}`), 'function', `缺 ${f}`);
  }
  assert.ok(ev('addScript.toString().includes("guardScriptLimit")'), '新建入口未接额度');
  assert.ok(ev('handleImportFile.toString().includes("guardScriptLimit")'), '导入入口未接额度');
  assert.ok(ev('importTextAsNewScript.toString().includes("guardScriptLimit")'), '导入落库未接额度');
});

test('七语新增 2 个额度键齐全，键集一致（各 229 键）', () => {
  for (const lang of ['zh', 'en', 'de', 'fr', 'ja', 'ko', 'ru']) {
    assert.ok(ev(`I18N.${lang}.scriptQuota`), `${lang} 缺 scriptQuota`);
    assert.ok(ev(`I18N.${lang}.scriptLimitToast`), `${lang} 缺 scriptLimitToast`);
    assert.ok(ev(`I18N.${lang}.scriptLimitToast.includes("{max}")`), `${lang} 额度文案缺 {max} 占位`);
  }
  const sizes = ['zh', 'en', 'de', 'fr', 'ja', 'ko', 'ru'].map(l => ev(`Object.keys(I18N.${l}).length`));
  assert.deepEqual(sizes, [229, 229, 229, 229, 229, 229, 229]);
});

// ── 2. 纯函数边界 ────────────────────────────────────────────────────
test('canAddScript 边界：免费 0/1/2 可加，3 起不可加；Pro 任意数量可加', () => {
  assert.equal(ev('canAddScript(false, 0, 3)'), true);
  assert.equal(ev('canAddScript(false, 2, 3)'), true);
  assert.equal(ev('canAddScript(false, 3, 3)'), false);
  assert.equal(ev('canAddScript(false, 99, 3)'), false);
  assert.equal(ev('canAddScript(true, 3, 3)'), true);
  assert.equal(ev('canAddScript(true, 9999, 3)'), true);
  assert.equal(ev('canAddScript(false, 4, 5)'), true, '限额应可配置');
});

// ── 3. 免费版 3 篇上限 ───────────────────────────────────────────────
test('免费用户建满 3 篇后，第 4 篇被拦且不改动任何数据', () => {
  resetScripts(2);
  ev('addScript()');
  assert.equal(ev('state.scripts.length'), 3, '第 3 篇应可新建');

  const before = ev('JSON.stringify(state.scripts)');
  const activeBefore = ev('state.activeScriptId');
  ev('addScript()');
  assert.equal(ev('state.scripts.length'), 3, '第 4 篇不得写入');
  assert.equal(ev('JSON.stringify(state.scripts)'), before, '已有讲稿不得被改动');
  assert.equal(ev('state.activeScriptId'), activeBefore, '不得切走当前讲稿');
  assert.ok(doc.getElementById('toast').textContent.includes('3'), '应给出含额度的明确提示');
  assert.equal(doc.getElementById('proSheet').classList.contains('hidden'), false, '撞墙时应打开 Pro 权益页');
});

test('Pro 用户不受 3 篇限制', () => {
  resetScripts(3);
  ev('state.isPro = true;');
  ev('addScript()');
  assert.equal(ev('state.scripts.length'), 4);
  ev('addScript()');
  assert.equal(ev('state.scripts.length'), 5);
});

// ── 4. 数据安全红线：降级/老用户超额不删稿 ────────────────────────────
test('历史/降级用户已有 7 篇：全部保留、列表可见、仅禁止新增', () => {
  resetScripts(7);
  const before = ev('JSON.stringify(state.scripts)');
  ev('renderScriptList()');
  assert.equal(ev('state.scripts.length'), 7, '不得删除任何已有讲稿');
  assert.equal(ev('JSON.stringify(state.scripts)'), before);
  assert.equal(doc.getElementById('scriptList').children.length, 7, '不得隐藏任何已有讲稿');
  assert.ok(doc.getElementById('scriptCount').textContent.includes('7'), '计数应如实显示 7');
  assert.equal(ev('scriptLimitReached()'), true);
  ev('addScript()');
  assert.equal(ev('state.scripts.length'), 7, '超额时只拦新增');
});

test('删到额度内即可继续新建', () => {
  resetScripts(7);
  ev('while (state.scripts.length > 2) deleteScript(state.scripts[0].id);');
  assert.equal(ev('state.scripts.length'), 2);
  ev('addScript()');
  assert.equal(ev('state.scripts.length'), 3);
});

// ── 5. 导入同样受额度，且是通用额度而非 Pro 身份门禁 ───────────────────
test('满额时导入被拦：不解析文件、不新增、不覆盖', () => {
  resetScripts(3);
  const before = ev('JSON.stringify(state.scripts)');
  const r = ev(`(() => { const x = importTextAsNewScript('导入稿', '新内容'); return x === null; })()`);
  assert.equal(r, true, '导入落库应返回 null');
  assert.equal(ev('JSON.stringify(state.scripts)'), before);
  assert.equal(ev('handleImportFile.toString().includes("isPro")'), false, '不得按 Pro 身份拒绝导入');
});

test('未超额时导入免费可用（无需 Pro）', () => {
  resetScripts(1);
  const r = ev(`(() => { const s = importTextAsNewScript('导入稿', '新内容'); return s ? s.title : null; })()`);
  assert.equal(r, '导入稿');
  assert.equal(ev('state.scripts.length'), 2);
  assert.equal(ev('state.isPro'), false);
});

// ── 6. Pro 状态修复 ──────────────────────────────────────────────────
test('devPreviewAllowed：默认关闭，仅「无后端 + ?dev=1」开放', () => {
  assert.equal(ev(`devPreviewAllowed('', '')`), false);
  assert.equal(ev(`devPreviewAllowed('', '?dev=1')`), true);
  assert.equal(ev(`devPreviewAllowed('', '?x=1&dev=1')`), true);
  assert.equal(ev(`devPreviewAllowed('', '?dev=10')`), false);
  assert.equal(ev(`devPreviewAllowed('https://api.example.com', '?dev=1')`), false);
  assert.equal(doc.getElementById('btnProDevPreview').hidden, true, '默认必须隐藏');
  doc.getElementById('btnProDevPreview').click();
  assert.equal(ev('state.isPro'), false, '隐藏按钮被强行点击也不得解锁 Pro');
});

test('checkProStatus 以服务端为唯一真相：回写 false / 回写 true / 断网保留缓存', async () => {
  ev('CONFIG.API_BASE = "https://api.example.com"; window.Telegram = { WebApp: { initData: "fake" } }; state.isPro = true; saveState();');

  w.fetch = async () => ({ json: async () => ({ pro: false }) });
  const afterRefund = await ev('(async () => { await checkProStatus(); return isPro(); })()');
  assert.equal(afterRefund, false, '退款/降级必须把本地 true 回写成 false');
  assert.equal(ev('state.isPro'), false, '并落盘，刷新后不反弹');

  w.fetch = async () => ({ json: async () => ({ pro: true }) });
  const afterBuy = await ev('(async () => { await checkProStatus(); return isPro(); })()');
  assert.equal(afterBuy, true, '购买成功应回写 true');

  w.fetch = async () => { throw new Error('offline'); };
  const afterOffline = await ev('(async () => { await checkProStatus(); return isPro(); })()');
  assert.equal(afterOffline, true, '临时断网不得把付费用户误降级');

  ev('CONFIG.API_BASE = ""; state.isPro = false; saveState();');
});

after(() => {
  try { dom.window.close(); } catch (e) { /* 已关闭 */ }
});
