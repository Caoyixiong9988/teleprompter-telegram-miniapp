// 诊断：当前"按行匀速"高亮模型导致每字停留时间不均（短行慢/长行快）
// 复刻 index.html 的 buildReadTokens 行分组 + updateReadMark 选词，阅读头按像素匀速推进

const GAP = 68, WH = 44, SPEED = 1; // 阅读头 1px/帧

// lineSpecs: [{words:n}] —— 每行词数
function makeTokens(lineSpecs) {
  const toks = [];
  let top = 0, id = 0;
  for (const s of lineSpecs) {
    for (let w = 0; w < s.words; w++) toks.push({ id: id++, top: top, h: WH });
    top += GAP;
  }
  return toks;
}
function buildLines(toks) {
  const lines = [];
  let lineStart = 0;
  for (let i = 1; i <= toks.length; i++) {
    const boundary = i === toks.length || Math.abs(toks[i].top - toks[lineStart].top) > 3;
    if (boundary) {
      let h = 0;
      for (let k = lineStart; k < i; k++) h = Math.max(h, toks[k].h);
      lines.push({ start: lineStart, end: i - 1, top: toks[lineStart].top, height: h });
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
  return lines;
}
function pick(lines, headY) {
  let li = 0;
  while (li < lines.length - 1 && headY > lines[li].top + lines[li].height) li++;
  const cur = lines[li], n = cur.end - cur.start + 1;
  if (n <= 1) return cur.start;
  const frac = Math.max(0, Math.min(1, (headY - cur.top) / Math.max(1, cur.height)));
  return cur.start + Math.min(n - 1, Math.floor(frac * n));
}
function simulate(name, lineSpecs) {
  const toks = makeTokens(lineSpecs);
  const lines = buildLines(toks);
  const last = lines[lines.length - 1];
  const endY = last.top + Math.max(1, last.height);
  let prev = -1, hold = 0;
  const holds = [];
  for (let hy = 0; hy <= endY; hy += SPEED) {
    const w = pick(lines, hy);
    if (w !== prev) { if (prev >= 0) holds.push({ word: prev, frames: hold }); prev = w; hold = 0; }
    hold++;
  }
  if (prev >= 0) holds.push({ word: prev, frames: hold });
  const perWord = holds.map(h => h.frames);
  const maxHold = Math.max(...perWord);
  const minHold = Math.min(...perWord);
  console.log(`\n===== ${name} =====`);
  console.log('每行词数:', lineSpecs.map(s => s.words).join(','));
  console.log('每词停留帧数 min/max:', minHold, '/', maxHold, ' 极差倍数=', (maxHold / minHold).toFixed(2) + '×');
  let k = 0;
  for (const s of lineSpecs) {
    const lineFrames = holds.slice(k, k + s.words).reduce((a, h) => a + h.frames, 0);
    console.log(`  行(${String(s.words).padStart(2)}字): 整行停留 ${String(lineFrames).padStart(3)}帧, 每字 ${(lineFrames / s.words).toFixed(1)}帧`);
    k += s.words;
  }
}

simulate('场景A 3字短行 / 30字长行 交替（用户描述）', [
  { words: 3 }, { words: 30 }, { words: 3 }, { words: 30 },
]);
simulate('场景B 全短行(每行3字)', [
  { words: 3 }, { words: 3 }, { words: 3 }, { words: 3 },
]);
simulate('场景C 全满行(每行30字)', [
  { words: 30 }, { words: 30 }, { words: 30 },
]);
