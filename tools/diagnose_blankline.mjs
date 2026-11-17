// 诊断：空白行对逐词高亮节奏的影响
// 复刻 index.html 里 buildReadTokens 的行分组/钳制 + updateReadMark 的定位公式
// 目标：找出"遇到空行时高亮等待/节奏变慢"的根因

const GAP = 68, WH = 44; // 正常行距 / 文字行高

// 构造：每个词 {line, top, h}。空白行只拉大下一行的 top，不产生词
function makeTokens(lineSpecs) {
  // lineSpecs: [{words:n, blankLines:m}]  words=本行词数, blankLines=本行之后跟几个空行
  const toks = [];
  let top = 0, id = 0;
  for (const s of lineSpecs) {
    for (let w = 0; w < s.words; w++) toks.push({ id: id++, lineTop: top, h: WH });
    top += GAP;
    top += (s.blankLines || 0) * GAP;
  }
  return toks;
}

// 复刻 buildReadTokens 的行分组 + 钳制
function buildLines(toks) {
  const lines = [];
  let lineStart = 0;
  for (let i = 1; i <= toks.length; i++) {
    const boundary = i === toks.length || Math.abs(toks[i].lineTop - toks[lineStart].lineTop) > 3;
    if (boundary) {
      let h = 0;
      for (let k = lineStart; k < i; k++) h = Math.max(h, toks[k].h);
      lines.push({ start: lineStart, end: i - 1, top: toks[lineStart].lineTop, height: h });
      lineStart = i;
    }
  }
  let normalGap = Infinity;
  for (let i = 0; i + 1 < lines.length; i++) {
    const g = lines[i + 1].top - lines[i].top;
    if (g > 0 && g < normalGap) normalGap = g;
  }
  if (!Number.isFinite(normalGap)) normalGap = lines.length ? lines[0].height : 1;
  for (let i = 0; i < lines.length; i++) {
    if (i + 1 < lines.length) {
      const gap = lines[i + 1].top - lines[i].top;
      lines[i].height = Math.max(1, gap > normalGap * 1.6 ? normalGap : gap);
    }
  }
  return { lines, normalGap };
}

// 复刻 updateReadMark 选词
function pick(lines, headY) {
  let li = 0;
  while (li < lines.length - 1 && headY > lines[li].top + lines[li].height) li++;
  const cur = lines[li], n = cur.end - cur.start + 1;
  if (n <= 1) return cur.start;
  const frac = Math.max(0, Math.min(1, (headY - cur.top) / Math.max(1, cur.height)));
  return cur.start + Math.min(n - 1, Math.floor(frac * n));
}

// 模拟：阅读头以 1px/帧匀速推进，记录"当前高亮词"跳变序列与每个词的停留帧数
function simulate(name, lineSpecs) {
  const toks = makeTokens(lineSpecs);
  const { lines, normalGap } = buildLines(toks);
  const last = lines[lines.length - 1];
  const endY = last.top + Math.max(1, last.height);
  let prev = -1, hold = 0;
  const holds = [];
  const transitions = [];
  for (let hy = 0; hy <= endY; hy += 1) {
    const w = pick(lines, hy);
    if (w !== prev) {
      if (prev >= 0) holds.push({ word: prev, frames: hold });
      transitions.push({ hy, word: w });
      prev = w; hold = 0;
    }
    hold++;
  }
  if (prev >= 0) holds.push({ word: prev, frames: hold });
  const maxHold = Math.max(...holds.map(h => h.frames));
  const minHold = Math.min(...holds.map(h => h.frames));
  console.log(`\n===== ${name} =====`);
  console.log('行数:', lines.length, ' normalGap:', normalGap);
  console.log('各行 {top,height}:', lines.map(l => `{${l.top},${l.height}}`).join(' '));
  console.log('词停留帧数 min/max:', minHold, '/', maxHold, '  (正常应≈', Math.round(normalGap / (lineSpecs[0].words)), ')');
  // 找出异常长的停留（=节奏变慢点）
  const stalls = holds.filter(h => h.frames > normalGap / lineSpecs[0].words * 2.2);
  console.log('异常停顿词(词号@停留帧):', stalls.length ? stalls.map(h => `${h.word}@${h.frames}`).join(' ') : '无');
}

// 场景1：无空行基准
simulate('场景1 全连续（基准）', [
  { words: 8 }, { words: 8 }, { words: 8 },
]);
// 场景2：第1行后夹2个空行（用户典型场景）
simulate('场景2 第1行后夹2空行', [
  { words: 8, blankLines: 2 }, { words: 8 }, { words: 8 },
]);
// 场景3：夹在中间，两行都各有空行
simulate('场景3 每行后夹空行', [
  { words: 8, blankLines: 2 }, { words: 8, blankLines: 2 }, { words: 8 },
]);
// 场景4：空行在最后一行之前
simulate('场景4 末行前夹3空行', [
  { words: 8 }, { words: 8, blankLines: 3 }, { words: 8 },
]);
