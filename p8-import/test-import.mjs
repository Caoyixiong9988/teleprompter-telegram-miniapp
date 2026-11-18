/**
 * test-import.mjs — 文件导入（免费功能）+ 悬赏下线的回归测试
 *
 * 运行：npm test（已加入测试列表），或单独 node --test p8-import/test-import.mjs
 * 思路：用 jsdom 真实加载单文件 index.html，通过 window.eval 调用内联纯函数，
 *       数据以数组字面量传入，避免跨 realm 的 TypedArray 兼容问题。
 *       ZIP 覆盖 STORED（method 0）与真实的 deflate（method 8，Word 默认）两种条目。
 *       jsdom 没有 DecompressionStream，这里注入一个模拟 Chrome 背压的替身：
 *       writer.write() 必须等 reader.read() 才兑现。旧实现「先 await write 再 read」
 *       会在此永久卡死（正是用户实测「导入后讲稿空白」的根因），用 test timeout 抓住。
 *       旧版 .doc 由 tools/make-doc-fixture.mjs 现造合法的 OLE2 复合文档（CFB + FIB + 分片表），
 *       二进制用 base64 传入，避免把上万字节拼成数字字面量。
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { buildWord97Doc, buildWord97DocMini } from '../tools/make-doc-fixture.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workerSrc = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const schemaSrc = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

// 模拟 Chrome 的 DecompressionStream：可读端 highWaterMark=0 带来的背压，
// 即 write() 的 Promise 只有 reader.read() 之后才 resolve。
class BackpressureDecompressionStream {
  constructor(format) {
    if (format !== 'deflate-raw') throw new Error('unsupported format: ' + format);
    this._out = [];
    this._release = null;
  }
  get writable() {
    const self = this;
    return { getWriter() { return {
      async write(data) {
        self._out = [new Uint8Array(inflateRawSync(Buffer.from(data)))];
        await new Promise(res => { self._release = res; }); // 不读就不放行
      },
      async close() {}
    }; } };
  }
  get readable() {
    const self = this;
    return { getReader() {
      let i = 0;
      return { async read() {
        if (self._release) { const r = self._release; self._release = null; r(); }
        return i < self._out.length ? { done: false, value: self._out[i++] } : { done: true };
      } };
    } };
  }
}

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
    win.DecompressionStream = BackpressureDecompressionStream;
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

// 与上面同结构，但条目用 method 8（deflate）——真实 Word 保存的 .docx 就是这个布局。
function makeDeflateZip(name, data) {
  const nameBytes = Array.from(Buffer.from(name, 'utf8'));
  const raw = Buffer.from(data, 'utf8');
  const dataBytes = Array.from(deflateRawSync(raw));
  const method = 8;
  const u16 = v => [v & 255, (v >>> 8) & 255];
  const u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const local = [
    0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0, 0, ...u16(method), 0, 0, 0, 0, 0, 0, 0, 0,
    ...u32(dataBytes.length), ...u32(raw.length),
    ...u16(nameBytes.length), ...u16(0), ...nameBytes, ...dataBytes
  ];
  const central = [
    0x50, 0x4B, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00, 0, 0, ...u16(method), 0, 0, 0, 0, 0, 0, 0, 0,
    ...u32(dataBytes.length), ...u32(raw.length),
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
  assert.equal(ev('handleImportFile.toString().includes("writeImportIntoActiveScript")'), true, '导入应写入当前选中讲稿（不新建，故不占额度）');
  assert.equal(ev('handleImportFile.toString().includes("importTextAsNewScript")'), false, '导入入口不得隐式新建讲稿');
  assert.equal(ev('typeof writeImportIntoActiveScript'), 'function', '写入当前讲稿的助手应存在');
  assert.equal(ev('state.isPro'), false, '默认应为免费用户');
});

test('七语新增 12 个导入键齐全，投稿提示已清除', () => {
  const keys = ['importBtn','importHint','importFormats','importOk','importInserted','importFailType',
    'importFailSize','importFailParse','importFailLocked','importFailBig','importFailUnsupported','importFailEmpty'];
  for (const lang of ['zh','en','de','fr','ja','ko','ru']) {
    for (const k of keys) assert.ok(ev(`I18N.${lang}[${JSON.stringify(k)}]`), `${lang} 缺 ${k}`);
    assert.equal(ev(`"submitNotice" in I18N.${lang}`), false, `${lang} 仍残留 submitNotice`);
  }
  assert.equal(ev('Object.keys(I18N.zh).length'), 246);
});

test('文件输入不藏在设置面板里，且接受 .doc / .rtf', () => {
  const input = w.document.getElementById('importFile');
  const accept = input.getAttribute('accept') || '';
  for (const ext of ['.txt', '.doc', '.dot', '.docx', '.rtf']) {
    assert.ok(accept.includes(ext), 'accept 缺少 ' + ext);
  }
  assert.equal(input.closest('.sheet'), null, 'input 不应位于 display:none 的设置面板内');
  assert.equal(input.parentElement, w.document.body, 'input 应挂在 body 级');
  assert.ok(w.document.getElementById('btnQuickImport'), '编辑条也要有导入入口');
});

// ── 2. 格式白名单 ────────────────────────────────────────────────────
test('支持纯文本 / 打包文档 / 旧版 .doc / RTF，仍明确拒绝 PDF 与可执行文件', () => {
  for (const ext of ['txt','text','md','markdown','csv','srt','vtt','log','docx','odt','xlsx','doc','dot','rtf']) {
    assert.equal(ev(`importIsSupported(${JSON.stringify(ext)})`), true, ext);
  }
  for (const ext of ['pdf','pages','wps','exe','png','', 'DOCX1']) {
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
// 二进制样本（.doc）走 base64，避免把上万字节拼成 JS 数字字面量
function parseB64(name, buf) {
  const b64 = Buffer.from(buf).toString('base64');
  return ev(`(async () => {
    const bin = atob(${JSON.stringify(b64)});
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const file = { name: ${JSON.stringify(name)}, size: a.length, arrayBuffer: async () => a.buffer };
    return await parseImportFile(file);
  })()`);
}
function parseFailB64(name, buf) {
  const b64 = Buffer.from(buf).toString('base64');
  return ev(`(async () => {
    const bin = atob(${JSON.stringify(b64)});
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
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

// 回归：真实 Word 保存的 .docx 全部是 deflate（method 8）。Chrome 的
// DecompressionStream 写端必须等读端，旧代码先 await write 再 read 会死锁。
// 这里的替身复刻该背压，8 秒超时即判失败（死锁时 node:test 会报超时）。
test('DOCX 端到端：deflate 压缩 + Chrome 式背压不再死锁', { timeout: 8000 }, async () => {
  const r = await parse('4.docx', makeDeflateZip('word/document.xml', DOCX_XML));
  assert.equal(r.text, '第一段讲稿\n第二段讲稿');
  assert.equal(r.title, '4');
});

test('deflate 数据损坏时明确报解析失败，不静默留空', { timeout: 8000 }, async () => {
  const bad = makeDeflateZip('word/document.xml', DOCX_XML);
  // 把压缩载荷前 40 字节打乱，保持 ZIP 结构完好
  for (let i = 30; i < 70; i++) bad[i] ^= 0xFF;
  assert.equal(await parseFail('损坏.docx', bad), 'parse');
});

// ── 5b. 旧版 .doc（Word 97-2003 二进制）──────────────────────────────
test('.doc 端到端：CFB 容器 + 分片表，压缩 ASCII 与 UTF-16 中文都能读出', async () => {
  const r = await parseB64('讲话稿.doc', buildWord97Doc());
  assert.equal(r.text, 'Hello 中文讲');
  assert.equal(r.title, '讲话稿');
});

test('.doc 里的 Word 控制符：段落/单元格翻译正确，域代码被丢弃', async () => {
  const s = '前\u0013 PAGE \u00141\u0015后\u000D第二段\u0007单元格';
  assert.equal(ev(`docCleanWordControl(${JSON.stringify(s)})`), '前1后\n第二段\t单元格');
  const r = await parseB64('分行.doc', buildWord97Doc({ text: { ascii: 'A\rB\r', cjk: '末段' } }));
  assert.equal(r.text, 'A\nB\n末段');
});

test('设了打开密码的 .doc 明确报 locked，不静默失败', async () => {
  assert.equal(await parseFailB64('锁定.doc', buildWord97Doc({ encrypted: true })), 'locked');
});

test('小文档走 mini stream（流 < 4096 时的真实布局），并跳过 Clx 前的 Prc 属性块', async () => {
  // 真实 Word 保存的短稿：WordDocument / 1Table 都在根存储的 mini stream 里
  const r = await parseB64('短稿.doc', buildWord97DocMini());
  assert.equal(r.text, 'Short 短稿');
  const r2 = await parseB64('多段短稿.doc', buildWord97DocMini({ text: { ascii: 'Opening\r', cjk: '正文结束' } }));
  assert.equal(r2.text, 'Opening\n正文结束');
});

test('不是 Word 的 OLE 容器（找不到 WordDocument 流）报 parse', async () => {
  const b = buildWord97Doc();
  // 目录第 2 项是 WordDocument（offset 1024 + 128），把首字母 W 改成 X
  b[1152] = 0x58;
  assert.equal(await parseFailB64('别的东西.doc', b), 'parse');
});

test('扩展名只是提示：.doc 里其实是 docx / RTF / HTML 也能导入', async () => {
  const asDocx = await parse('名字带doc其实是docx.doc', makeStoredZip('word/document.xml', DOCX_XML));
  assert.equal(asDocx.text, '第一段讲稿\n第二段讲稿');
  const asDoc = await parse('旧稿.docx', buildWord97Doc());   // 反向：docx 后缀 + .doc 内容
  assert.equal(asDoc.text, 'Hello 中文讲');
});

test('纯文本内容的 .doc（有些系统导出的「Word」其实是纯文本）照常导入', async () => {
  const r = await parse('直接是文字.doc', Array.from(Buffer.from('第一行\n第二行', 'utf8')));
  assert.equal(r.text, '第一行\n第二行');
});

// ── 5c. RTF 与伪装成 .doc 的 HTML ────────────────────────────────────
const RTF_SAMPLE =
  '{\\rtf1\\ansi\\ansicpg936\\deff0{\\fonttbl{\\f0\\fnil\\fcharset134 \\\'cb\\\'ce\\\'cc\\\'e5;}}' +
  '{\\*\\generator Riched20 10.0;}\\pard ' +
  '\\\'b5\\\'da\\\'d2\\\'bb\\\'b6\\\'ce\\par \\\'b5\\\'da\\\'b6\\\'fe\\\'b6\\\'ce}';

test('RTF 按 ansicpg936 解码中文，字体表与生成器信息不进正文', async () => {
  const bytes = Array.from(Buffer.from(RTF_SAMPLE, 'latin1'));
  const r = await parse('讲稿.rtf', bytes);
  assert.equal(r.text, '第一段\n第二段');
  const disguised = await parse('伪装成doc.doc', bytes);
  assert.equal(disguised.text, '第一段\n第二段', '后缀写成 .doc 的 RTF 也要能导入');
});

test('RTF 的 \\uN 转义与段落控制字', () => {
  const rtf = '{\\rtf1\\ansi \\u20013?\\u25991?\\u35762?\\par 第二行}';
  assert.equal(ev(`rtfExtractText(${JSON.stringify(rtf)})`).trim(), '中文讲\n第二行');
});

test('伪装成 .doc 的 HTML 去标签取文字，样式与脚本不混进讲稿', async () => {
  const html = '<html><head><meta charset="utf-8"><style>p{color:red}</style></head>' +
    '<body><p>第一段</p><p>第二段&nbsp;结束</p><script>alert(1)</script></body></html>';
  const r = await parse('导出稿.doc', Array.from(Buffer.from(html, 'utf8')));
  assert.equal(r.text, '第一段\n第二段 结束');
});

test('仍不支持的格式 / 二进制乱码 / 大文件 / 空文件 / 超长正文都被明确拒绝', async () => {
  assert.equal(await parseFail('a.pdf', [1, 2, 3]), 'type');
  assert.equal(await parseFail('a.wps', [1, 2, 3]), 'type');
  // .doc / .rtf 是支持的扩展名，但内容既非容器也非文本 → 报解析失败而不是灌乱码
  assert.equal(await parseFail('old.doc', [1, 2, 3]), 'parse');
  assert.equal(await parseFail('a.rtf', [1, 2, 3]), 'parse');
  assert.equal(await parseFail('empty.txt', []), 'empty');
  assert.equal(await parseFail('broken.docx', [0x50, 0x4B, 0x03, 0x04, 1, 2]), 'parse');
  assert.equal(await parseFail('坏掉的.doc', [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0]), 'parse', 'CFB 头截断应报解析失败');
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

// ── 6. 底层助手：程序化新建讲稿并写入（导入按钮本身已不走此路径）────
test('importTextAsNewScript 助手：新建讲稿，原有稿件内容不变', () => {
  const before = ev('state.scripts.length');
  const original = ev('state.scripts[0] ? state.scripts[0].content : ""');
  const r = ev(`(() => { const s = importTextAsNewScript("导入稿", "新的内容"); return { id: s.id, scripts: state.scripts.length, active: state.activeScriptId }; })()`);
  assert.equal(r.scripts, before + 1);
  assert.equal(r.active, r.id);
  assert.equal(ev('state.scripts[0].content'), original, '原稿不得被覆盖');
  assert.equal(ev('getActiveContent()'), '新的内容');
  assert.equal(ev('state.isPro'), false, '全程无需 Pro');
});

// ── 6b. 真实交互链路：选文件 → change → 写入当前选中的讲稿 ───────────
test('模拟用户选一个 .doc：change 事件写入当前讲稿，不新建、不改选中', async () => {
  // 选中第 2 篇作为目标，验证「导入目标 = 选中讲稿」而非列表末尾/新建
  ev("state.scripts = [{ id: 'a', title: '第一篇', titleKind: 'custom', content: '原文A', updatedAt: 0 }, { id: 'b', title: '选中稿', titleKind: 'custom', content: '原文B', updatedAt: 0 }]; state.activeScriptId = 'b'; importCaretRange = null; loadActiveIntoEditor();");
  const input = w.document.getElementById('importFile');
  const file = new w.File([buildWord97Doc()], '会议纪要.doc', { type: 'application/msword' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  const before = ev('state.scripts.length');
  input.dispatchEvent(new w.Event('change'));
  await new Promise(r => setTimeout(r, 300));
  assert.equal(ev('state.scripts.length'), before, '不得新增讲稿');
  assert.equal(ev('state.activeScriptId'), 'b', '选中状态不得改变');
  assert.equal(ev("state.scripts.find(s => s.id === 'b').content"), 'Hello 中文讲', '内容写入选中稿');
  assert.equal(ev("state.scripts.find(s => s.id === 'b').title"), '选中稿', '标题保持选中稿标题');
  assert.equal(ev("state.scripts.find(s => s.id === 'a').content"), '原文A', '其他讲稿不受影响');
  assert.equal(ev('getActiveContent()'), 'Hello 中文讲');
  assert.equal(input.value, '', 'change 后应清空 input，允许连续选同一个文件');
});

// ── 6c. 有光标时导入 = 插入，不再清空已输入内容 ──────────────────────
test('光标在第三个 A 后导入：六个 A 保留，内容插在中间且可连续插入', () => {
  const st = w.document.getElementById('scrollText');
  st.textContent = 'AAAAAA';
  const sel = w.getSelection();
  const r = w.document.createRange();
  r.setStart(st.firstChild, 3); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
  ev('captureImportCaret()');

  const beforeCount = ev('state.scripts.length');
  assert.equal(ev('insertImportedTextAtCaret("【文件内容】")'), true, '有效光标应插入成功');
  assert.equal(st.textContent, 'AAA【文件内容】AAA');
  assert.equal(ev('getActiveContent()'), 'AAA【文件内容】AAA', '数据模型要同步');
  assert.equal(ev('state.scripts.length'), beforeCount, '插入不应新建讲稿');

  // 连续导入应接在上一份之后，仍然不覆盖原稿
  assert.equal(ev('insertImportedTextAtCaret("第二份")'), true);
  assert.equal(st.textContent, 'AAA【文件内容】第二份AAA');
  assert.equal(ev('getActiveContent()'), 'AAA【文件内容】第二份AAA');
  sel.removeAllRanges();
});

test('光标失效（讲稿已切换/选区被清空）时退回新建，不误插', () => {
  const st = w.document.getElementById('scrollText');
  st.textContent = '旧稿';
  // 模拟 loadActiveIntoEditor 换了 DOM 节点：旧 Range 指向已被移出文档的节点
  ev(`importCaretRange = (function () {
    const r = document.createRange();
    const detached = document.createElement('div');
    r.selectNodeContents(detached);
    return r;
  })()`);
  const before = ev('state.scripts.length');
  assert.equal(ev('insertImportedTextAtCaret("不应插入")'), false);
  assert.equal(st.textContent, '旧稿', '失效光标不得改动内容');
  assert.equal(ev('state.scripts.length'), before);
});

// ── 6d. 逐词跟随高亮 ────────────────────────────────────────────────
test('逐词高亮：覆盖层与七语文案齐备，无定位 API 时安全降级', () => {
  assert.ok(w.document.getElementById('readMark'), '缺少 #readMark 覆盖层');
  assert.ok(w.document.getElementById('setReadMark'), '缺少设置开关');
  for (const lang of ['zh','en','de','fr','ja','ko','ru']) {
    assert.ok(ev(`I18N.${lang}.readMarkLabel`), `${lang} 缺 readMarkLabel`);
    assert.ok(ev(`I18N.${lang}.readMarkHint`), `${lang} 缺 readMarkHint`);
  }
  assert.equal(ev('state.readMark'), true, '默认开启');
  assert.doesNotThrow(() => ev('updateReadMark(true)'));
  assert.equal(w.document.getElementById('readMark').style.display, 'none', '环境不支持时应隐藏');
});

test('updateReadMark 不引用未定义标识符 clamp（曾导致高亮被 catch 吞掉永久隐藏）', () => {
  const start = html.indexOf('function updateReadMark');
  const end = html.indexOf('\nfunction ', start + 10);
  const body = html.slice(start, end > 0 ? end : start + 2000);
  assert.ok(body.length > 0, '应能提取 updateReadMark 函数体');
  assert.ok(!/\bclamp\s*\(/.test(body), 'clamp 未定义，须用 Math.max/min 或 clampOffset');
});

test('tokenizeForRead：英文按整词、中文按单字、忽略空白，按阅读顺序', () => {
  const got = ev(`(function () {
    const st = document.getElementById('scrollText');
    st.textContent = 'hello 世界 abc';
    return tokenizeForRead().map(function (t) {
      return String(t.node.nodeValue).slice(t.start, t.end);
    }).join('|');
  })()`);
  assert.equal(got, 'hello|世|界|abc');
});

test('逐词高亮按滚动进度线性映射到词序（每行逐词、行尾换行）', () => {
  // 纯映射逻辑：p=offset/maxOffset → 词索引。验证它单调推进、首尾不越界，
  // 且同一行内会依次落到相邻词（而不是旧实现那样固定屏幕列只亮一个）。
  const seq = ev(`(function () {
    const N = 20, max = 1000, out = [];
    for (let off = 0; off <= max; off += 50) {
      const p = Math.max(0, Math.min(1, off / max));
      let idx = Math.floor(p * N);
      if (idx >= N) idx = N - 1;
      if (idx < 0) idx = 0;
      out.push(idx);
    }
    return out.join(',');
  })()`);
  const arr = seq.split(',').map(Number);
  assert.equal(arr.length, 21);
  assert.equal(arr[0], 0, '开头高亮第一个词');
  assert.equal(arr[arr.length - 1], 19, '结尾停在最后一个词，不越界');
  for (let i = 1; i < arr.length; i++) assert.ok(arr[i] >= arr[i - 1], '词序单调不回退');
  assert.ok(new Set(arr).size >= 18, '滚动全程覆盖绝大多数词（逐词推进，不是每行只亮一个）');
});

test('字号调节：主屏快捷按钮存在，changeFontSize 夹紧范围并同步滑块', () => {
  assert.ok(w.document.getElementById('btnFontDown'), '缺少 A− 按钮');
  assert.ok(w.document.getElementById('btnFontUp'), '缺少 A+ 按钮');
  const r = ev(`(function () {
    changeFontSize(10);  const lo = state.fontSize;
    changeFontSize(999); const hi = state.fontSize;
    changeFontSize(50);  const mid = state.fontSize;
    return [lo, hi, mid, document.getElementById('setFontSize').value].join(',');
  })()`);
  assert.equal(r, '24,96,50,50', '字号夹紧到 24-96 且滑块同步');
  const ff = ev(`getComputedStyle(document.getElementById('scrollText')).fontFamily ||
                  document.getElementById('scrollText').style.fontFamily`);
  assert.ok(/sans-serif/.test(ff), '提词区使用统一无衬线字体栈');
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
