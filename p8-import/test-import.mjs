/**
 * test-import.mjs — 文件导入（免费功能）+ 悬赏下线的回归测试
 *
 * 运行：npm test（已加入测试列表），或单独 node --test p8-import/test-import.mjs
 * 思路：用 jsdom 真实加载单文件 index.html，通过 window.eval 调用内联纯函数，
 *       数据以数组字面量传入，避免跨 realm 的 TypedArray 兼容问题。
 *       ZIP 用手工构造的 STORED 条目（method 0），因此不需要 DecompressionStream，
 *       可在 jsdom 环境里完整跑通 docx / odt / xlsx 的解析链路。
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workerSrc = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const schemaSrc = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
  virtualConsole: vc,
  // 页面有语音检测 setInterval 与滚动 requestAnimationFrame 循环；
  // 本测试只验导入纯函数，停掉调度器以免 node --test 进程不退出。
  beforeParse(win) {
    win.setInterval = () => 0;
    win.clearInterval = () => {};
    win.requestAnimationFrame = () => 0;
    win.cancelAnimationFrame = () => {};
  }
});
const w = dom.window;
w.TextDecoder = TextDecoder;   // jsdom window 未内置 WHATWG 编码 API，注入 Node 实现
w.TextEncoder = TextEncoder;
await new Promise(r => setTimeout(r, 200));

const ev = expr => w.eval(expr);
const lit = arr => '[' + Array.from(arr).join(',') + ']';

// 手工构造一个只含单个 STORED（未压缩）条目的最小 ZIP。
function makeStoredZip(name, data) {
  const nameBytes = Array.from(Buffer.from(name, 'utf8'));
  const dataBytes = Array.from(Buffer.from(data, 'utf8'));
  const u16 = v => [v & 255, (v >>> 8) & 255];
  const u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const local = [
    0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ...u32(dataBytes.length), ...u32(dataBytes.length),
    ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...dataBytes
  ];
  const central = [
    0x50, 0x4B, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ...u32(dataBytes.length), ...u32(dataBytes.length),
    ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
    ...u32(0), ...u32(0), ...nameBytes
  ];
  const eocd = [
    0x50, 0x4B, 0x05, 0x06, 0, 0, 0, 0, ...u16(1), ...u16(1),
    ...u32(central.length), ...u32(local.length), ...u16(0)
  ];
  return [...local, ...central, ...eocd];
}

const DOCX_XML = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:body><w:p><w:r><w:t>第一段讲稿</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>第二段讲稿</w:t></w:r></w:p></w:body></w:document>';

// ── 1. 页面与免费门禁 ────────────────────────────────────────────────
test('页面无运行时错误，导入入口存在且是免费功能', () => {
  assert.equal(errors.length, 0, errors.join(' | '));
  assert.ok(w.document.getElementById('btnImportFile'), '缺少导入按钮');
  assert.ok(w.document.getElementById('importFile'), '缺少 file input');
  assert.equal(ev('typeof handleImportFile'), 'function');
  assert.equal(ev('parseImportFile.toString().includes("isPro")'), false, '解析层不应有 Pro 门禁');
  assert.equal(ev('handleImportFile.toString().includes("isPro")'), false, '导入入口不应按 Pro 身份拒绝');
  assert.equal(ev('handleImportFile.toString().includes("guardScriptLimit")'), true, '导入入口应受通用讲稿额度约束（不是 Pro 门禁）');
  assert.equal(ev('state.isPro'), false, '默认应为免费用户');
});

test('五语新增 10 个导入键齐全，投稿提示已清除', () => {
  const keys = ['importBtn','importHint','importFormats','importOk','importFailType',
    'importFailSize','importFailParse','importFailBig','importFailUnsupported','importFailEmpty'];
  for (const lang of ['zh','en','ja','ko','ru']) {
    for (const k of keys) assert.ok(ev(`I18N.${lang}[${JSON.stringify(k)}]`), `${lang} 缺 ${k}`);
    assert.equal(ev(`"submitNotice" in I18N.${lang}`), false, `${lang} 仍残留 submitNotice`);
  }
  assert.equal(ev('Object.keys(I18N.zh).length'), 166);
});

// ── 2. 格式白名单 ────────────────────────────────────────────────────
test('支持两档格式，明确拒绝 .doc / .pdf / .rtf 等「别碰」类型', () => {
  for (const ext of ['txt','text','md','markdown','csv','srt','vtt','log','docx','odt','xlsx']) {
    assert.equal(ev(`importIsSupported(${JSON.stringify(ext)})`), true, ext);
  }
  for (const ext of ['doc','pdf','rtf','pages','wps','exe','png','', 'DOCX1']) {
    assert.equal(ev(`importIsSupported(${JSON.stringify(ext)})`), false, ext);
  }
  assert.equal(ev('importExtOf("讲稿.DOCX")'), 'docx');
  assert.equal(ev('importExtOf("noext")'), '');
});

// ── 3. 纯文本解码 ────────────────────────────────────────────────────
test('UTF-8 / UTF-8 BOM / UTF-16LE BOM 解码正确', () => {
  const zh = Array.from(Buffer.from('中文讲稿', 'utf8'));
  assert.equal(ev(`decodeTextBytes(${lit(zh)})`), '中文讲稿');
  assert.equal(ev(`decodeTextBytes(${lit([0xEF, 0xBB, 0xBF, ...zh])})`), '中文讲稿');
  const le = Array.from(Buffer.from('ABC', 'utf16le'));
  assert.equal(ev(`decodeTextBytes(${lit([0xFF, 0xFE, ...le])})`), 'ABC');
});

test('无 BOM 的 GBK 中文自动回退，不出现乱码或抛错', () => {
  assert.equal(ev(`decodeTextBytes(${lit([0xD6, 0xD0, 0xCE, 0xC4])})`), '中文');
});

test('SRT / VTT 去掉序号、时间码与 WEBVTT 头，只留要念的文字', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,200\n第一句话\n\n2\n00:00:03,200 --> 00:00:06,000\n第二句话\n';
  const out = ev(`stripSubtitleMarkup(${JSON.stringify(srt)}, "srt")`);
  assert.equal(out, '第一句话\n\n第二句话');
  const vtt = 'WEBVTT\nKind: captions\n\n00:00:01.000 --> 00:00:02.000\nこんにちは\n';
  assert.equal(ev(`stripSubtitleMarkup(${JSON.stringify(vtt)}, "vtt")`), 'こんにちは');
  assert.equal(ev(`stripSubtitleMarkup(${JSON.stringify(srt)}, "txt")`), srt, '非字幕格式不应被改动');
});

test('清洗 CRLF / NUL / 行尾空格 / 过多空行', () => {
  const dirty = '第一段  \r\n\x00第二段\r\n\r\n\r\n\r\n第三段';
  assert.equal(ev(`importCleanText(${JSON.stringify(dirty)})`), '第一段\n第二段\n\n\n第三段');
});

// ── 4. ZIP + XML 解析 ────────────────────────────────────────────────
test('findZipEntry 能从 central directory 定位 STORED 条目', () => {
  const zip = makeStoredZip('word/document.xml', 'HELLO');
  const r = ev(`(() => { const e = findZipEntry(${lit(zip)}, "word/document.xml"); return e ? { method: e.method, data: Array.from(e.data) } : null; })()`);
  assert.ok(r, '未找到条目');
  assert.equal(r.method, 0);
  assert.equal(Buffer.from(r.data).toString('utf8'), 'HELLO');
  assert.equal(ev(`findZipEntry(${lit(zip)}, "missing.xml")`), null);
});

test('DOCX / ODT / XLSX 只提取纯文本，按段落换行', () => {
  assert.equal(ev(`extractPlainTextFromXml(${JSON.stringify(DOCX_XML)}, "docx")`), '第一段讲稿\n第二段讲稿');
  const odt = '<office:document-content xmlns:office="urn:o" xmlns:text="urn:t"><text:p>第一行</text:p><text:h>标题</text:h></office:document-content>';
  assert.equal(ev(`extractPlainTextFromXml(${JSON.stringify(odt)}, "odt")`), '第一行\n标题');
  const xlsx = '<sst xmlns="urn:s"><si><t>讲稿A</t></si><si><t>讲稿B</t></si></sst>';
  assert.equal(ev(`extractPlainTextFromXml(${JSON.stringify(xlsx)}, "xlsx")`), '讲稿A\n讲稿B');
});

// ── 5. 端到端 parseImportFile ────────────────────────────────────────
async function parse(name, bytes) {
  return ev(`(async () => {
    const a = new Uint8Array(${lit(bytes)});
    const file = { name: ${JSON.stringify(name)}, size: a.length, arrayBuffer: async () => a.buffer };
    return await parseImportFile(file);
  })()`);
}
function parseFail(name, bytes) {
  return ev(`(async () => {
    const a = new Uint8Array(${lit(bytes)});
    const file = { name: ${JSON.stringify(name)}, size: a.length, arrayBuffer: async () => a.buffer };
    try { await parseImportFile(file); return null; } catch (e) { return e && e.code; }
  })()`);
}

test('TXT 端到端：标题取文件名，正文正确', async () => {
  const r = await parse('我的讲稿.txt', Array.from(Buffer.from('这是正文内容', 'utf8')));
  assert.equal(r.title, '我的讲稿');
  assert.equal(r.text, '这是正文内容');
});

test('SRT 端到端：导入后只留台词', async () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,200\n台词一\n\n2\n00:00:04,000 --> 00:00:06,000\n台词二\n';
  const r = await parse('字幕.srt', Array.from(Buffer.from(srt, 'utf8')));
  assert.equal(r.text, '台词一\n\n台词二');
});

test('DOCX 端到端：STORED ZIP 走完解析链路', async () => {
  const r = await parse('稿件.docx', makeStoredZip('word/document.xml', DOCX_XML));
  assert.equal(r.text, '第一段讲稿\n第二段讲稿');
  assert.equal(r.title, '稿件');
});

test('「别碰」格式与大文件/空文件/超长正文都被明确拒绝', async () => {
  assert.equal(await parseFail('old.doc', [1, 2, 3]), 'type');
  assert.equal(await parseFail('a.pdf', [1, 2, 3]), 'type');
  assert.equal(await parseFail('a.rtf', [1, 2, 3]), 'type');
  assert.equal(await parseFail('empty.txt', []), 'empty');
  assert.equal(await parseFail('broken.docx', [0x50, 0x4B, 0x03, 0x04, 1, 2]), 'parse');
  // 大数组在 eval 内构造，避免把 2MB 数字拼成字符串
  const bigCode = ev(`(async () => {
    const a = new Uint8Array(2 * 1024 * 1024 + 1); a.fill(65);
    const file = { name: 'big.txt', size: a.length, arrayBuffer: async () => a.buffer };
    try { await parseImportFile(file); return null; } catch (e) { return e && e.code; }
  })()`);
  assert.equal(await bigCode, 'size');
  const longCode = ev(`(async () => {
    const a = new TextEncoder().encode('中'.repeat(40 * 1024)); // 120 KiB > 90 KiB
    const file = { name: 'long.txt', size: a.length, arrayBuffer: async () => a.buffer };
    try { await parseImportFile(file); return null; } catch (e) { return e && e.code; }
  })()`);
  assert.equal(await longCode, 'big');
});

// ── 6. 导入不覆盖现有讲稿 ────────────────────────────────────────────
test('免费用户导入后新建讲稿，原有稿件内容不变', () => {
  const before = ev('state.scripts.length');
  const original = ev('state.scripts[0] ? state.scripts[0].content : ""');
  const r = ev(`(() => { const s = importTextAsNewScript("导入稿", "新的内容"); return { id: s.id, scripts: state.scripts.length, active: state.activeScriptId }; })()`);
  assert.equal(r.scripts, before + 1);
  assert.equal(r.active, r.id);
  assert.equal(ev('state.scripts[0].content'), original, '原稿不得被覆盖');
  assert.equal(ev('getActiveContent()'), '新的内容');
  assert.equal(ev('state.isPro'), false, '全程无需 Pro');
});

// ── 7. 悬赏运行时已下线 ──────────────────────────────────────────────
test('/bounty 路由、import、健康检查、建表全部移除', () => {
  assert.ok(!workerSrc.includes("['/bounty'"), 'worker.js 仍挂载 /bounty 路由');
  assert.ok(!workerSrc.includes("import bountyHandler"), 'worker.js 仍 import 悬赏 handler');
  assert.ok(!workerSrc.includes("'bounty',"), '健康检查仍列出 bounty');
  assert.ok(!schemaSrc.includes('CREATE TABLE IF NOT EXISTS bounties'), 'schema 仍创建悬赏表');
  assert.ok(!schemaSrc.includes('CREATE TABLE IF NOT EXISTS bounty_submissions'), 'schema 仍创建投稿表');
  assert.ok(!schemaSrc.includes('CREATE TABLE IF NOT EXISTS bounty_awards'), 'schema 仍创建发奖表');
  assert.ok(!schemaSrc.includes('CREATE INDEX IF NOT EXISTS idx_bounties'), 'schema 仍创建悬赏索引');
  assert.ok(!html.includes('submitNotice'), '前端仍残留投稿提示');
});

after(() => {
  try { dom.window.close(); } catch (e) { /* 已关闭 */ }
});
