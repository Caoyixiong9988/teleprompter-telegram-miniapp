/**
 * make-doc-fixture.mjs — 造一个最小但结构真实的 Word 97-2003 (.doc) 二进制样本
 *
 * 为什么需要它：.doc 不是文本文件，而是 OLE2 复合文档（CFB）容器，
 * 正文不在明文里，而在 WordDocument 流的 FIB 之后、由 1Table 流里的分片表（Clx/PlcPcd）索引。
 * 只有真造出这个结构，才能验证 cfbOpen / docTextFromWord 的读取链路是对的。
 *
 * 生成的样本包含两段正文，故意覆盖两条解码分支：
 *   - 压缩分片（fCompressed=1，单字节 ASCII）        → "Hello "
 *   - UTF-16LE 分片（中文）                          → "中文讲"
 * 拼接结果应为 "Hello 中文讲"。
 *
 * 用法：测试里 import { buildWord97Doc } from '../tools/make-doc-fixture.mjs'
 */
const SEC = 512;            // 扇区大小
const END = 0xFFFFFFFE;     // 链结束标记
const FREE = 0xFFFFFFFF;    // 空闲扇区
const FATSECT = 0xFFFFFFFD; // 本扇区是 FAT
const DIFSECT = 0xFFFFFFFE;

function u16(v) { return [v & 255, (v >>> 8) & 255]; }
function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
function put(buf, off, arr) { for (let i = 0; i < arr.length; i++) buf[off + i] = arr[i]; }

/**
 * @param {{ encrypted?: boolean, text?: {ascii?: string, cjk?: string} }} opts
 * @returns {Buffer} 完整 .doc 文件字节
 */
export function buildWord97Doc(opts = {}) {
  const ascii = opts.text && opts.text.ascii != null ? opts.text.ascii : 'Hello ';
  const cjk = opts.text && opts.text.cjk != null ? opts.text.cjk : '中文讲';
  const asciiBytes = Buffer.from(ascii, 'latin1');
  const cjkBytes = Buffer.from(cjk, 'utf16le');

  const FCCLK = 0;                       // 1Table 里 Clx 的偏移
  const WD_SEC_START = 2, TB_SEC_START = 4;
  const ASCII_FC = 0x300;                // 压缩分片在 WordDocument 流里的字节偏移
  const CJK_FC = 0x340;                  // UTF-16 分片的字节偏移

  // ---------- 1Table：Clx = Pcdt(0x02) + lcb + PlcPcd ----------
  const ccpAscii = asciiBytes.length;
  const ccpCjk = cjk.length;
  const ccpText = ccpAscii + ccpCjk;
  const plcLen = 4 + (2 + 1) * 4 + 2 * 8; // 4 + 3 个 CP + 2 个 PCD = 32
  const table = Buffer.alloc(SEC);
  let p = FCCLK;
  table[p++] = 0x02;                      // clxt = Pcdt
  put(table, p, u32(plcLen)); p += 4;
  put(table, p, u32(0)); p += 4;                      // CP[0]
  put(table, p, u32(ccpAscii)); p += 4;               // CP[1]
  put(table, p, u32(ccpText)); p += 4;                // CP[2]
  // PCD0：压缩（bit30），fc 以「字节偏移 × 2」存
  put(table, p, u16(0)); p += 2;
  put(table, p, u32(0x40000000 | (ASCII_FC * 2))); p += 4;
  put(table, p, u16(0)); p += 2;
  // PCD1：UTF-16，fc 是真实字节偏移
  put(table, p, u16(0)); p += 2;
  put(table, p, u32(CJK_FC)); p += 4;
  put(table, p, u16(0)); p += 2;
  const lcbClx = p - FCCLK;               // 5 + plcLen

  // ---------- WordDocument：FIB + 两段正文 ----------
  const wd = Buffer.alloc(SEC * 2);
  put(wd, 0x00, u16(0xA5EC));             // wIdent
  put(wd, 0x02, u16(193));                // nFib = Word 97
  put(wd, 0x0A, u16((opts.encrypted ? 0x0100 : 0) | 0x0200)); // fEncrypted / fWhichTblStm=1Table
  put(wd, 0x18, u32(ASCII_FC));           // fcMin
  put(wd, 0x1C, u32(CJK_FC + cjkBytes.length)); // fcMac
  put(wd, 0x4C, u32(ccpText));            // ccpText：只要正文
  put(wd, 0x1A2, u32(FCCLK));             // fcClx
  put(wd, 0x1A6, u32(lcbClx));            // lcbClx
  asciiBytes.copy(wd, ASCII_FC);
  cjkBytes.copy(wd, CJK_FC);

  // ---------- 目录项（每项 128 字节） ----------
  function dirEntry(name, type, start, size) {
    const e = Buffer.alloc(128);
    const nameBuf = Buffer.from(name, 'utf16le');
    nameBuf.copy(e, 0);
    put(e, 0x40, u16(nameBuf.length + 2));  // 含结尾 NUL
    e[0x42] = type;
    e[0x43] = 1;                            // color = black
    put(e, 0x44, u32(FREE)); put(e, 0x48, u32(FREE)); put(e, 0x4C, u32(FREE)); // left/right/child
    put(e, 0x74, u32(start));
    put(e, 0x78, u32(size));
    return e;
  }
  const dir = Buffer.alloc(SEC);
  dirEntry('Root Entry', 5, END, 0).copy(dir, 0);              // 根存储：无 mini stream
  dirEntry('WordDocument', 2, WD_SEC_START, wd.length).copy(dir, 128);
  dirEntry('1Table', 2, TB_SEC_START, table.length).copy(dir, 256);
  // 第 4 项保持全 0（空项）

  // ---------- FAT ----------
  const fat = Buffer.alloc(SEC, 0xFF);
  const fatVals = new Array(128).fill(FREE);
  fatVals[0] = FATSECT;
  fatVals[1] = DIFSECT;
  fatVals[2] = 3; fatVals[3] = END;                            // WordDocument: 扇区 2→3
  fatVals[4] = 5; fatVals[5] = END;                            // 1Table: 扇区 4→5
  for (let i = 0; i < 128; i++) put(fat, i * 4, u32(fatVals[i]));

  // ---------- 头部（512 字节） ----------
  const header = Buffer.alloc(SEC);
  put(header, 0x00, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
  put(header, 0x18, u16(0x003E));          // minor version
  put(header, 0x1A, u16(0x0003));          // major version 3
  put(header, 0x1C, u16(0xFFFE));          // little endian
  put(header, 0x1E, u16(9));               // 扇区 512
  put(header, 0x20, u16(6));               // mini 扇区 64
  put(header, 0x2C, u32(1));               // FAT 扇区数
  put(header, 0x30, u32(1));               // 目录起始扇区 = 1
  put(header, 0x38, u32(4096));            // mini stream 阈值
  put(header, 0x3C, u32(END));             // 无 MiniFAT
  put(header, 0x40, u32(0));
  put(header, 0x44, u32(END));             // 无 DIFAT 扇区
  put(header, 0x48, u32(0));
  for (let i = 0; i < 109; i++) put(header, 0x4C + i * 4, u32(i === 0 ? 0 : FREE)); // DIFAT[0] 指向扇区 0

  return Buffer.concat([header, fat, dir, wd, table]);
}

/**
 * 第二个样本：流都小于 4096 字节，全部走 mini stream（64 字节 mini 扇区）。
 *
 * 这是真实 Word 保存短稿件时最常见的布局——WordDocument 与 1Table 都塞在根存储的
 * mini stream 里，用 MiniFAT 串起来。只测常规扇区链的话，真实文件会读不出来。
 * 同时在 Clx 前面放一条 Prc（0x01 分片属性）记录，验证解析器会正确跳过它。
 */
export function buildWord97DocMini(opts = {}) {
  const ascii = opts.text && opts.text.ascii != null ? opts.text.ascii : 'Short ';
  const cjk = opts.text && opts.text.cjk != null ? opts.text.cjk : '短稿';
  const asciiBytes = Buffer.from(ascii, 'latin1');
  const cjkBytes = Buffer.from(cjk, 'utf16le');

  const ASCII_FC = 0x200;      // 压缩分片
  const CJK_FC = 0x240;        // UTF-16 分片
  const WD_SIZE = 768;         // < 4096 → 走 mini stream
  const TB_SIZE = 1024;        // < 4096 → 走 mini stream
  const MINI = 64;
  const WD_MINI_START = 0;                 // WordDocument 占 mini 0..11
  const TB_MINI_START = WD_SIZE / MINI;    // 1Table 紧接其后

  const ccpAscii = asciiBytes.length;
  const ccpCjk = cjk.length;
  const ccpText = ccpAscii + ccpCjk;

  // ---------- 1Table：Prc（要被跳过）+ Pcdt ----------
  const table = Buffer.alloc(TB_SIZE);
  let p = 0;
  table[p++] = 0x01;                       // clxt = Prc
  put(table, p, u16(4)); p += 2;           // cbGrpprl
  put(table, p, [0xAA, 0xBB, 0xCC, 0xDD]); p += 4;
  const FCCLK = p;
  table[p++] = 0x02;                       // clxt = Pcdt
  const plcLen = 4 + 3 * 4 + 2 * 8;
  put(table, p, u32(plcLen)); p += 4;
  put(table, p, u32(0)); p += 4;
  put(table, p, u32(ccpAscii)); p += 4;
  put(table, p, u32(ccpText)); p += 4;
  put(table, p, u16(0)); p += 2;
  put(table, p, u32(0x40000000 | (ASCII_FC * 2))); p += 4;
  put(table, p, u16(0)); p += 2;
  put(table, p, u16(0)); p += 2;
  put(table, p, u32(CJK_FC)); p += 4;
  put(table, p, u16(0)); p += 2;
  const lcbClx = p - FCCLK;

  // ---------- WordDocument ----------
  const wd = Buffer.alloc(WD_SIZE);
  put(wd, 0x00, u16(0xA5EC));
  put(wd, 0x02, u16(193));
  put(wd, 0x0A, u16(0x0200));              // fWhichTblStm = 1Table
  put(wd, 0x18, u32(ASCII_FC));
  put(wd, 0x1C, u32(CJK_FC + cjkBytes.length));
  put(wd, 0x4C, u32(ccpText));
  put(wd, 0x1A2, u32(FCCLK));
  put(wd, 0x1A6, u32(lcbClx));
  asciiBytes.copy(wd, ASCII_FC);
  cjkBytes.copy(wd, CJK_FC);

  // ---------- 根存储的 mini stream ----------
  const miniStream = Buffer.alloc(SEC * 4);            // 2048 字节
  wd.copy(miniStream, WD_MINI_START * MINI);
  table.copy(miniStream, TB_MINI_START * MINI);

  // MiniFAT：各流的 mini 扇区链
  const totalMini = miniStream.length / MINI;          // 32
  const miniFat = Buffer.alloc(SEC, 0xFF);
  const miniVals = new Array(SEC / 4).fill(FREE);
  const wdMinis = WD_SIZE / MINI;                      // 12
  const tbMinis = TB_SIZE / MINI;                      // 16
  for (let i = 0; i < wdMinis; i++) miniVals[WD_MINI_START + i] = (i === wdMinis - 1) ? END : WD_MINI_START + i + 1;
  for (let i = 0; i < tbMinis; i++) miniVals[TB_MINI_START + i] = (i === tbMinis - 1) ? END : TB_MINI_START + i + 1;
  for (let i = 0; i < miniVals.length; i++) put(miniFat, i * 4, u32(miniVals[i]));

  // ---------- 目录 ----------
  function dirEntry(name, type, start, size) {
    const e = Buffer.alloc(128);
    Buffer.from(name, 'utf16le').copy(e, 0);
    put(e, 0x40, u16(Buffer.byteLength(name, 'utf16le') + 2));
    e[0x42] = type;
    e[0x43] = 1;
    put(e, 0x44, u32(FREE)); put(e, 0x48, u32(FREE)); put(e, 0x4C, u32(FREE));
    put(e, 0x74, u32(start));
    put(e, 0x78, u32(size));
    return e;
  }
  const dir = Buffer.alloc(SEC);
  dirEntry('Root Entry', 5, 2, miniStream.length).copy(dir, 0);  // 根：mini stream 在扇区 2
  dirEntry('WordDocument', 2, WD_MINI_START, WD_SIZE).copy(dir, 128);
  dirEntry('1Table', 2, TB_MINI_START, TB_SIZE).copy(dir, 256);

  // ---------- FAT：mini stream(2→3→4→5)、MiniFAT(6) ----------
  const fat = Buffer.alloc(SEC, 0xFF);
  const fatVals = new Array(128).fill(FREE);
  fatVals[0] = FATSECT; fatVals[1] = DIFSECT;
  fatVals[2] = 3; fatVals[3] = 4; fatVals[4] = 5; fatVals[5] = END;
  fatVals[6] = END;
  for (let i = 0; i < 128; i++) put(fat, i * 4, u32(fatVals[i]));

  // ---------- 头部 ----------
  const header = Buffer.alloc(SEC);
  put(header, 0x00, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
  put(header, 0x18, u16(0x003E));
  put(header, 0x1A, u16(0x0003));
  put(header, 0x1C, u16(0xFFFE));
  put(header, 0x1E, u16(9));
  put(header, 0x20, u16(6));
  put(header, 0x2C, u32(1));
  put(header, 0x30, u32(1));
  put(header, 0x38, u32(4096));
  put(header, 0x3C, u32(6));               // first mini FAT sector
  put(header, 0x40, u32(1));               // mini FAT 扇区数
  put(header, 0x44, u32(END));
  put(header, 0x48, u32(0));
  for (let i = 0; i < 109; i++) put(header, 0x4C + i * 4, u32(i === 0 ? 0 : FREE));

  return Buffer.concat([header, fat, dir, miniStream, miniFat]);
}
