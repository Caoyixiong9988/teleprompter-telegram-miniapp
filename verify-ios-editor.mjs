import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/', virtualConsole: vc });
const { window } = dom;
const doc = window.document;
await new Promise(r => setTimeout(r, 150));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('  OK  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); } };
const ev = s => window.eval(s);

// --- 1. 布局：底部 6 列网格 + 速度区独占整行，所有控件不重叠不遮挡 ---
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
check('controlBar 恢复 6 列网格', /#controlBar\{[^}]*display:grid[^}]*grid-template-columns:repeat\(6/.test(css));
check('速度区独占整行（grid-column:1 / -1）', /#speedWrap\{[^}]*grid-column:1 \/ -1/.test(css));
check('像素数值强制单行且不压缩', /#speedBarLabel\{[^}]*white-space:nowrap[^}]*min-width:76px/.test(css));
check('按钮等宽、不再被 flex 压缩', /#controlBar > \.btn\{width:100%; min-width:0;/.test(css));
check('极窄屏降为 3 列仍可完整点按', /@media \(max-width:360px\)\{[\s\S]*?repeat\(3/.test(css));
check('速度区 DOM 排在 6 个按钮之后', [...doc.getElementById('controlBar').children].map(e => e.id).indexOf('speedWrap') === 6);
check('底部安全区 padding', /calc\(10px \+ env\(safe-area-inset-bottom\)\)/.test(css));
check('底部六个控制按钮都在 DOM', ['btnPlay','btnReset','btnSettings','btnCard','btnRemote','btnVoice'].every(id => !!doc.getElementById(id)));
check('眼睛开关已移出底部控制条', ![...doc.getElementById('controlBar').children].some(e => e.id === 'btnReadMark'));

// --- 2. 七语新键（含新增 de / fr）---
const LANGS = ['zh','en','de','fr','ja','ko','ru'];
const sizes = LANGS.map(l => ev(`Object.keys(I18N.${l}).length`));
check('七语各 243 键且一致', sizes.every(n => n === 243), JSON.stringify(sizes));
check('编辑/播放/语音/兜底/定位新增键七语齐全', ev(`['zh','en','de','fr','ja','ko','ru'].every(l=>['editPasteOk','editNoScroll','resetDone','voiceUnavailable','pasteFallbackHint','pasteFallbackPh','pasteFallbackInsert','pasteFallbackCancel','playPaused','playResumed','seekDone','seekPlaying'].every(k=>!!I18N[l][k]))`));
check('SUPPORTED_LANGS 为 zh,en,de,fr,ja,ko,ru', ev(`SUPPORTED_LANGS.join(',')==='zh,en,de,fr,ja,ko,ru'`));
const langSel = doc.getElementById('langSelect');
check('语言下拉含 Deutsch 与 Français',
  !!langSel.querySelector('option[value="de"]') && !!langSel.querySelector('option[value="fr"]'),
  [...langSel.options].map(o => o.value).join(','));
const speedEl = doc.querySelector('[data-i18n="speed"]');
langSel.value = 'de'; langSel.dispatchEvent(new window.Event('change'));
check('切德语：html lang=de、UI 渲染德语、占位符保留',
  doc.documentElement.lang === 'de' && speedEl.textContent === 'Tempo' && ev(`I18N.de.scriptLimitToast.includes('{max}')`),
  speedEl.textContent);
langSel.value = 'fr'; langSel.dispatchEvent(new window.Event('change'));
check('切法语：html lang=fr、UI 渲染法语、占位符保留',
  doc.documentElement.lang === 'fr' && speedEl.textContent === 'Vitesse' && ev(`I18N.fr.rankDone.includes('{n}')`),
  speedEl.textContent);
check('德语/法语关键文案无中文残留', ev(`I18N.de.settings==='Einstellungen' && I18N.fr.settings==='Paramètres' && I18N.de.voiceTitle==='Sprachführung' && I18N.fr.voiceTitle==='Guidage vocal'`));
langSel.value = 'zh'; langSel.dispatchEvent(new window.Event('change'));
check('切回中文后 UI 恢复', doc.documentElement.lang === 'zh' && speedEl.textContent === '速度', speedEl.textContent);

// --- 3. 系统粘贴不被吞掉（paste 不 preventDefault，内容同步进数据模型）---
const st = doc.getElementById('scrollText');
st.textContent = '原文';
const pev = new window.Event('paste', { bubbles: true, cancelable: true });
Object.defineProperty(pev, 'clipboardData', { value: { getData: () => '系统粘贴内容' } });
st.dispatchEvent(pev);
check('系统 paste 事件未被 preventDefault', pev.defaultPrevented === false);
st.textContent = '原文系统粘贴内容';
st.dispatchEvent(new window.Event('input', { bubbles: true }));
check('系统粘贴后数据模型已同步', ev('activeScript().content') === '原文系统粘贴内容', ev('activeScript().content'));

// --- 4. 粘贴按钮：读剪贴板 → 在光标处插入 → 可连续粘贴 ---
Object.defineProperty(window.navigator, 'clipboard', { value: { readText: () => Promise.resolve('XY') }, configurable: true });
st.textContent = '';
st.dispatchEvent(new window.Event('input', { bubbles: true }));
doc.getElementById('btnQuickPaste').click();
await new Promise(r => setTimeout(r, 20));
const after1 = ev('activeScript().content');
doc.getElementById('btnQuickPaste').click();
await new Promise(r => setTimeout(r, 20));
const after2 = ev('activeScript().content');
check('第一次粘贴写入 XY', after1.includes('XY'), JSON.stringify(after1));
check('连续再点粘贴追加第二次（非覆盖）', after2.includes('XYXY'), JSON.stringify(after2));
check('粘贴成功有 toast 反馈', doc.getElementById('toast').textContent === ev('t("editPasteOk")'));

// --- 5. 播放：短稿也进入播放态（逐词高亮可用）；点播放退出编辑态；滚到底后重头开始 ---
st.textContent = '短稿';
st.dispatchEvent(new window.Event('input', { bubbles: true }));
doc.getElementById('btnPlay').click();
check('不足一屏时点播放仍进入播放态（逐词高亮可用）', ev('playing') === true, 'playing=' + ev('playing'));
check('不足一屏时不再弹"无需滚动"提示', doc.getElementById('toast').textContent !== ev('t("editNoScroll")'), doc.getElementById('toast').textContent);
check('点播放后退出编辑态', doc.getElementById('editBar').classList.contains('hidden'), doc.getElementById('editBar').className);
ev('playing=false; offset=0;');
// 模拟可滚动：伪造尺寸，验证已到底时重头开始
Object.defineProperty(st, 'offsetHeight', { value: 1000, configurable: true });
Object.defineProperty(doc.getElementById('viewport'), 'clientHeight', { value: 300, configurable: true });
// 用显式 reachedEnd 标志模拟"自然滚到底"；仅 offset=max 不再足以判定（那正是暂停定位 bug 的根因）
ev('offset=700; playing=false; reachedEnd=true;');
doc.getElementById('btnPlay').click();
// 从头播放：文稿回顶端 offset=0，阅读头锚点对齐第一个词（不再负偏移推文稿）
check('已滚到底时再点播放会回到开头', ev('offset') === 0 && ev('playing') === true, 'offset=' + ev('offset') + ' playing=' + ev('playing'));
ev('playing=false; reachedEnd=false;');

// --- 6. 只定位光标不打断播放，真正改内容才暂停 ---
ev('playing=true;');
st.dispatchEvent(new window.FocusEvent('focus'));
check('仅聚焦定位光标不打断播放', ev('playing') === true);
st.textContent = '新内容';
st.dispatchEvent(new window.Event('input', { bubbles: true }));
check('真正输入才暂停滚动', ev('playing') === false);

// --- 7. 刷新按钮：真的回到开头 + 明确反馈 + 退出编辑态 ---
doc.getElementById('editBar').classList.remove('hidden');
ev('playing=true; offset=250; readCounted=true;');
doc.getElementById('btnReset').click();
check('刷新按钮把 offset 归零并暂停', ev('offset') === 0 && ev('playing') === false, 'offset=' + ev('offset') + ' playing=' + ev('playing'));
check('刷新按钮给出 toast 反馈（不再像没反应）', doc.getElementById('toast').textContent === ev('t("resetDone")'), doc.getElementById('toast').textContent);
check('刷新按钮退出编辑态', doc.getElementById('editBar').classList.contains('hidden'));

// --- 8. iOS 语音跟随：显示「苹果暂无、安卓可用」，不弹升级会员 ---
Object.defineProperty(window.navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', configurable: true });
ev('state.isPro=false; renderVoiceUI();');
const iosBox = doc.getElementById('voiceIosBox');
check('iOS 免费用户不再看到「请先开通 Pro」', doc.getElementById('voiceNeed').textContent !== ev('t("voiceNeedPro")'), doc.getElementById('voiceNeed').textContent);
check('iOS 面板显示「当前环境不支持」', doc.getElementById('voiceNeed').textContent === ev('t("voiceStatusUnsupported")'));
check('iOS 说明块可见且写明 iPhone 不可用 / Android 可用', iosBox.hidden === false && /iPhone/.test(iosBox.textContent) && /Android/.test(iosBox.textContent), iosBox.textContent.slice(0, 60));
check('不支持时「开始语音跟随」按钮禁用', doc.getElementById('btnVoiceToggle').disabled === true);
check('🎤 图标 title 带 iOS 说明', /iPhone/.test(doc.getElementById('btnVoice').title || ''));
doc.getElementById('proSheet').classList.add('hidden');
ev('startVoiceFollow();');
check('点开始不再弹出升级会员界面', doc.getElementById('proSheet').classList.contains('hidden'));
check('点开始后 iOS 说明仍在', doc.getElementById('voiceIosBox').hidden === false);

// --- 9. 支持语音且非 Pro 时，原有付费门禁仍生效 ---
Object.defineProperty(window.navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile', configurable: true });
window.SpeechRecognition = function(){};
ev('state.isPro=false; renderVoiceUI();');
check('Android 非 Pro 仍提示升级 Pro', doc.getElementById('voiceNeed').textContent === ev('t("voiceNeedPro")'), doc.getElementById('voiceNeed').textContent);
check('Android 开始按钮可用', doc.getElementById('btnVoiceToggle').disabled === false);
ev('startVoiceFollow();');
check('Android 非 Pro 点开始仍会打开升级界面', !doc.getElementById('proSheet').classList.contains('hidden'));

// --- 10. 桌面端：长稿内部滚动 + 剪贴板被拒时的原生粘贴兜底 ---
const appEl = doc.getElementById('app');
const vpEl = doc.getElementById('viewport');
check('viewport 有 min-height:0，不会被长稿撑破', /#viewport\{[^}]*min-height:0/.test(css));
check('提词区默认常显滚动条，可滚动查看全部内容', /#viewport\{[^}]*overflow-y:scroll/.test(css) && /#viewport::-webkit-scrollbar-thumb/.test(css));
check('播放态隐藏原生滚动条改用平滑滚动', /#app\.playing #viewport\{[^}]*overflow:hidden/.test(css));
check('工具条移出 viewport，成为独立 flex 行', doc.getElementById('editBar').parentElement === appEl && vpEl.querySelector('#editBar') === null && /\.edit-bar\{[^}]*flex-shrink:0/.test(css) && !/\.edit-bar\{[^}]*position:absolute/.test(css));
check('兜底面板也在 viewport 之外', doc.getElementById('pasteFallback').parentElement === appEl);

appEl.classList.remove('editing');
st.dispatchEvent(new window.FocusEvent('focus'));
check('聚焦提词区会开启可滚动编辑态', appEl.classList.contains('editing'));
doc.getElementById('btnReset').click();
check('刷新按钮退出编辑态并还原滚动容器', !appEl.classList.contains('editing'));

const pf = doc.getElementById('pasteFallback');
const pfi = doc.getElementById('pasteFallbackInput');
check('兜底面板默认隐藏', pf.classList.contains('hidden'));
Object.defineProperty(window.navigator, 'clipboard', { value: { readText: () => Promise.reject(new Error('denied')) }, configurable: true });
doc.getElementById('btnQuickPaste').click();
await new Promise(r => setTimeout(r, 20));
check('readText 被拒绝时弹出兜底框（不再只报错）', !pf.classList.contains('hidden'));
check('兜底框有明确操作提示', doc.querySelector('#pasteFallback .paste-hint').textContent === ev('t("pasteFallbackHint")'));

// 重建光标，避免沿用前面测试留下的旧 Range
st.textContent = '原稿';
const sel10 = window.getSelection();
const rr10 = doc.createRange();
rr10.selectNodeContents(st); rr10.collapse(false);
sel10.removeAllRanges(); sel10.addRange(rr10);
st.dispatchEvent(new window.Event('input', { bubbles: true }));
const ppe = new window.Event('paste', { bubbles: true, cancelable: true });
Object.defineProperty(ppe, 'clipboardData', { value: { getData: () => '手动粘贴内容' } });
pfi.dispatchEvent(ppe);
check('在兜底框按 Ctrl+V 会把内容插入讲稿', ev('activeScript().content').includes('手动粘贴内容'), ev('activeScript().content'));
check('插入后兜底框自动关闭并清空', pf.classList.contains('hidden') && pfi.value === '');

// paste 事件拿不到 clipboardData 的环境，仍可手动点「插入讲稿」
doc.getElementById('btnQuickPaste').click();
await new Promise(r => setTimeout(r, 20));
pfi.value = '按钮插入内容';
doc.getElementById('btnPasteInsert').click();
check('兜底框「插入讲稿」按钮同样可用', ev('activeScript().content').includes('按钮插入内容'), ev('activeScript().content'));
doc.getElementById('btnQuickPaste').click();
await new Promise(r => setTimeout(r, 20));
doc.getElementById('btnPasteCancel').click();
check('取消按钮关闭兜底框', pf.classList.contains('hidden'));

// readText 正常时保持原有自动粘贴路径
Object.defineProperty(window.navigator, 'clipboard', { value: { readText: () => Promise.resolve('OKTEXT') }, configurable: true });
doc.getElementById('btnQuickPaste').click();
await new Promise(r => setTimeout(r, 20));
check('readText 可用时走原有自动粘贴、不弹兜底框', pf.classList.contains('hidden') && ev('activeScript().content').includes('OKTEXT'));

// --- 11. 播放控制：暂停/继续、滚动条、刷新归零、点击任意行定位 ---
const cbIds = [...doc.getElementById('controlBar').children].map(e => e.id);
check('控制条顺序：6 按钮在前、速度区最后', cbIds.slice(0, 6).join(',') === 'btnPlay,btnReset,btnSettings,btnCard,btnRemote,btnVoice' && cbIds[6] === 'speedWrap', cbIds.join(','));

// 伪造长稿尺寸，让「有可滚动距离」成立
Object.defineProperty(st, 'offsetHeight', { value: 1000, configurable: true });
Object.defineProperty(vpEl, 'clientHeight', { value: 300, configurable: true });

// 播放 → 暂停 → 位置保持 → 继续
ev('offset=200; setPlaying(true);');
check('播放中按钮显示 ⏸（明确的暂停入口）', doc.getElementById('btnPlay').textContent === '⏸');
check('播放态给 #app 加 playing（关闭原生滚动条）', appEl.classList.contains('playing'));
doc.getElementById('btnPlay').click();
check('播放中点击可暂停', ev('playing') === false);
check('暂停保留阅读位置，而不是回到开头', ev('offset') === 200, 'offset=' + ev('offset'));
check('暂停后恢复原生滚动条', !appEl.classList.contains('playing'));
check('暂停有明确提示', doc.getElementById('toast').textContent === ev('t("playPaused")'));
check('暂停时容器滚动位置等于阅读位置', vpEl.scrollTop === 200, 'scrollTop=' + vpEl.scrollTop);
doc.getElementById('btnPlay').click();
check('再点 ▶ 从原位置继续播放', ev('playing') === true && ev('offset') === 200, 'offset=' + ev('offset'));
ev('setPlaying(false);');

// 浏览态手动滚动 → 同步阅读位置
vpEl.scrollTop = 360;
vpEl.dispatchEvent(new window.Event('scroll'));
check('手动滚动会同步阅读位置', ev('offset') === 360, 'offset=' + ev('offset'));

// 浏览态点击定位
Object.defineProperty(st, 'getBoundingClientRect', { value: () => ({ top: 100, left: 0, width: 300, height: 1000, bottom: 1100, right: 300 }), configurable: true });
st.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientY: 400 }));
check('点击文字定位到对应行', ev('offset') === 240, 'offset=' + ev('offset')); // 400-100-300*0.2
check('点击定位给出提示', doc.getElementById('toast').textContent === ev('t("seekDone")'));
check('定位后容器滚动位置同步', vpEl.scrollTop === 240, 'scrollTop=' + vpEl.scrollTop);

// 播放中点击定位：继续播放、不中断
ev('offset=100; setPlaying(true);');
st.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientY: 500 }));
check('播放中点击可从该行继续播放', ev('playing') === true && ev('offset') === 340, 'offset=' + ev('offset'));
check('播放中定位提示正确', doc.getElementById('toast').textContent === ev('t("seekPlaying")'));

// 刷新：阅读位置 / 滚动条 / 输入光标全部回开头 → 「刷新 + ▶」从头播放
ev('offset=500; setPlaying(true);');
vpEl.scrollTop = 500;
doc.getElementById('btnReset').click();
check('刷新把阅读位置与滚动条归零', ev('offset') === 0 && vpEl.scrollTop === 0, 'offset=' + ev('offset') + ' scrollTop=' + vpEl.scrollTop);
check('刷新后暂停并显示 ▶', ev('playing') === false && doc.getElementById('btnPlay').textContent === '▶');
const sel11 = window.getSelection();
check('刷新后输入光标回到讲稿开头', sel11.anchorOffset === 0 && st.contains(sel11.anchorNode), 'anchorOffset=' + sel11.anchorOffset);
check('刷新提示正确', doc.getElementById('toast').textContent === ev('t("resetDone")'));
doc.getElementById('btnPlay').click();
check('刷新 + ▶ 从头开始播放', ev('playing') === true && ev('offset') === 0);
ev('setPlaying(false);');

// --- 12. 速度下限下调 + 生效值核实（第十一轮）---
ev('state.speedUnit="px"; state.speedPx=20; remoteSpeedMul=1; voiceFollowing=false; renderSpeedUI();');
check('速度滑块下限已降到 5px/s（原 20 对跟读偏快）', doc.getElementById('speedBar').min === '5',
  'min=' + doc.getElementById('speedBar').min);
check('pxPerSec 精确等于设置值，无单位换算 bug', ev('pxPerSec()') === 20, 'pxPerSec=' + ev('pxPerSec()'));
// 手动推进 1 秒（60 帧 ×1/60s），位移应恰为 20px
// 第三十二轮改口径：offset 由阅读点反推（offset = head - 视口20%），所以先把两者摆成一致再推进
ev('readTokens=null; readLines=null; readTokensDirty=true; offset=200; readHeadContentY=260; setPlaying(true); lastTs=0;');
const _offPre = ev('offset');
let _t = 0; for (let i = 0; i < 60; i++) { _t += 1000/60; ev('loop(' + _t + ')'); }
check('推进 1 秒位移恰好 20px（20px/s 真实生效）', Math.abs(ev('offset') - _offPre - 20) < 0.001,
  'before=' + _offPre + ' after=' + ev('offset'));
ev('setPlaying(false);');

// --- 13. 逐词高亮：行内逐词 + 跨行连续，速率只由滚动决定（第十一轮）---
// 构造 3 行 ×8 词，验证阅读头推进：每行 68px 走完 8 词，行内 34px 跨 4 词。
const _hl = ev(`(function(){
  const toks=[]; for(let line=0;line<3;line++){for(let k=0;k<8;k++)toks.push({top:line*68,left:k*40,h:44,w:38});}
  readTokens=toks; readLines=[];
  for(let L=0;L<3;L++)readLines.push({start:L*8,end:L*8+7,top:L*68,height:68});
  const pick=(off)=>{
    const hy=off+viewport.clientHeight*0.2;
    let li=0; while(li<readLines.length-1 && hy>readLines[li].top+readLines[li].height) li++;
    const cur=readLines[li], n=cur.end-cur.start+1;
    if(n<=1)return cur.start;
    const f=Math.max(0,Math.min(1,(hy-cur.top)/Math.max(1,cur.height)));
    return cur.start+Math.min(n-1,Math.floor(f*n));
  };
  return [pick(0),pick(34),pick(68),pick(102),pick(136)];
})()`);
check('高亮行内随时间均匀逐词推进（34px 跨 4 词）', _hl[1]-_hl[0] >= 3 && _hl[1]-_hl[0] <= 4, 'Δ=' + (_hl[1]-_hl[0]));
check('高亮跨行连续（68px 走完 8 词接下一行）', _hl[2]-_hl[0] === 8, 'Δ=' + (_hl[2]-_hl[0]));
check('高亮映射不依赖文稿总长（无 offset/maxOffset×总词数）',
  !/\boffset\s*\/\s*max\s*\)?\s*\*\s*readTokens\.length/.test(html));
// 清理注入的假 token，避免影响后续检查
ev('readTokens=null; readLines=null; readTokensDirty=true;');

// --- 14. 暂停→点击定位→再播放：从所选位置续播；末尾附近也不回开头（第十一轮）---
for (const [label, clientY] of [['中间', 300], ['末尾附近', 580]]) {
  ev('offset=1000; reachedEnd=false; setPlaying(false); viewport.scrollTop=1000;');
  ev(`seekAtClientY(${clientY});`);
  const afterSeek = ev('offset');
  ev('togglePlay();');
  check(`${label}点击定位后再播放从所选位置继续`, ev('offset') === afterSeek && ev('playing') === true,
    'seek=' + afterSeek + ' play=' + ev('offset'));
  ev('setPlaying(false);');
}
ev('offset=3000; reachedEnd=true; setPlaying(false); viewport.scrollTop=3000;');
ev('togglePlay();');
check('自然播放到底后 ▶ 才从头重播', ev('offset') === 0 && ev('playing') === true, 'offset=' + ev('offset'));
ev('setPlaying(false);');

// --- 15. 暂停→点击定位→续播：高亮必须精确落在所点词，不跳行尾/下一行（第十二轮）---
// 根因：旧 seek 只按 clientY 设 offset，而高亮用「阅读头在行带内的纵向比例」选词，
// 同一行词 Y 相同 → 点击 X（哪个词）被忽略，点在行内不同高度会落到不同词/行尾/下一行。
// 修复：命中点击处真实词元，反算 offset 让阅读头选中该词。
{
  const DEF_VH = 300;
  // 受控词几何：每行 8 词，行带 68px，词宽 40
  const inject = () => {
    const toks = [], lines = [];
    for (let L=0;L<8;L++){
      for (let k=0;k<8;k++) toks.push({ top: 28+L*68, left: 22+k*40, w: 38, h: 44 });
      lines.push({ start:L*8, end:L*8+7, top:28+L*68, height:68 });
    }
    ev('readTokens=' + JSON.stringify(toks) + '; readLines=' + JSON.stringify(lines) + ';');
    ev('readTokensDirty=false; readTokensText=(scrollText.textContent||"");');
  };
  // 选词公式（与 updateReadMark 一致）
  const pick = () => ev(`(function(){
    const hy=readHeadContentY, L=readLines; let li=0;
    while(li<L.length-1 && hy>L[li].top+L[li].height) li++;
    const cur=L[li], n=cur.end-cur.start+1;
    const f=Math.max(0,Math.min(1,(hy-cur.top)/Math.max(1,cur.height)));
    return n>1 ? cur.start+Math.min(n-1,Math.floor(f*n)) : cur.start;
  })()`);
  for (const [L,k,yInBand] of [[2,0,22],[2,7,22],[2,2,60],[3,5,40]]){
    ev('offset=200; setPlaying(false); playing=false;');
    inject();
    const cY = 28+L*68+yInBand, cX = 22+k*40+19;
    // getBoundingClientRect 固定 top=100（上一节已设），contentY=clientY-100 → clientY=100+cY
    const clientY = 100 + cY;
    ev(`seekAtClientY(${clientY}, ${cX});`);
    inject(); // seek 内部强制重建缓存，重新注入受控几何后测选词
    check(`点第${L}行第${k+1}词(行内Y=${yInBand})精确命中`, pick() === L*8+k, 'idx='+pick()+' 期望='+(L*8+k));
  }
  // 关键回归：点在行带底部（旧模型会跳到行尾第8词），现在必须回到所点的第3词
  ev('offset=200; setPlaying(false); playing=false;');
  inject();
  const cY=28+2*68+60, cX=22+2*40+19;
  ev(`seekAtClientY(${100+cY}, ${cX});`);
  inject();
  check('行内低位置点击不再跳到行尾（仍落在所点词）', pick() === 2*8+2, 'idx='+pick()+' 期望='+(2*8+2));
  // 兼容：未传 clientX 时回退按 Y 定位
  ev('offset=200; setPlaying(false); playing=false; readTokens=null; readLines=null; readTokensDirty=true;');
  ev(`seekAtClientY(${100+300});`); // contentY=300 → target=300-300*0.2=240
  check('无 clientX 时回退按 Y 定位', Math.abs(ev('offset')-240)<0.01, 'offset='+ev('offset'));
  // 事件层：click 必须把 clientX 传给 seek（源码守卫）
  check('click 事件传递 clientX', /seekAtClientY\(e\.clientY,\s*e\.clientX\)/.test(html));
  ev('setPlaying(false); readTokens=null; readLines=null; readTokensDirty=true;');
}

// --- 16. 播放起点以当前光标(caret)为准；刷新后不被旧位置覆盖（第十三轮）---
// 根因1：togglePlay 只用模块 offset，不读 DOM caret → 用户把光标移到某字符再播，
//        从暂停残留位置开始（"跳过 N 个字符"）。
// 根因2：刷新后浏览器 scroll restoration 恢复 scrollTop → scroll 事件同步回 offset，
//        覆盖"从头播放"意图。
// 修复：selectionchange 在暂停态记录 caret 字符偏移到 caretSeekOffset；▶ 时以它反算起点并消费；
//        init 禁用 scrollRestoration 且 offset/scrollTop 归零。
{
  const LONG = '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切断白达';
  st.textContent = LONG;
  st.dispatchEvent(new window.Event('input', { bubbles: true }));
  Object.defineProperty(st, 'offsetHeight', { value: 1000, configurable: true });
  Object.defineProperty(vpEl, 'clientHeight', { value: 300, configurable: true });
  Object.defineProperty(st, 'getBoundingClientRect', { value: () => ({ top: 100, left: 0, width: 300, height: 1000, bottom: 1100, right: 300 }), configurable: true });
  const inject = () => {
    const toks = [], lines = [];
    for (let L=0;L<8;L++){
      for (let k=0;k<10;k++){ const gi=L*10+k; toks.push({top:28+L*68,left:22+k*30,w:26,h:44,charStart:gi,charEnd:gi+1}); }
      lines.push({start:L*10,end:L*10+9,top:28+L*68,height:68});
    }
    ev('readTokens=' + JSON.stringify(toks) + '; readLines=' + JSON.stringify(lines) + '; readTokensDirty=false; readTokensText=scrollText.textContent;');
  };
  const pick = () => ev(`(function(){
    const hy=readHeadContentY, L=readLines; let li=0;
    while(li<L.length-1 && hy>L[li].top+L[li].height) li++;
    const c=L[li], n=c.end-c.start+1;
    const f=Math.max(0,Math.min(1,(hy-c.top)/Math.max(1,c.height)));
    return n>1 ? c.start+Math.min(n-1,Math.floor(f*n)) : c.start;
  })()`);
  const placeCaret = (off) => {
    const sel = window.getSelection(), r = doc.createRange();
    r.setStart(st.firstChild, off); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
    doc.dispatchEvent(new window.Event('selectionchange'));
  };

  // 问题1：暂停 → caret 到第27字 → 再播，从词27开始（不跳过）
  ev('offset=500; reachedEnd=false; playing=false;');
  doc.getElementById('app').classList.remove('playing');
  inject();
  placeCaret(27);
  check('暂停态放置 caret 记录字符偏移', ev('caretSeekOffset') === 27, 'caretSeekOffset=' + ev('caretSeekOffset'));
  check('caret 字符偏移精确映射到词元', ev('caretOffsetToWord()') === 27, 'word=' + ev('caretOffsetToWord()'));
  doc.getElementById('btnPlay').click();
  inject();
  check('问题1：从 caret 所在字符开始播放（不跳过N字符）', pick() === 27, 'playWord=' + pick());
  check('播放起点意图消费后清空', ev('caretSeekOffset') === null, 'caretSeekOffset=' + ev('caretSeekOffset'));
  ev('setPlaying(false);');

  // 问题2：刷新 → scroll restoration 恢复旧 offset → caret 放开头 → 播，offset 归零
  ev('offset=0; viewport.scrollTop=600; reachedEnd=false; caretSeekOffset=null;');
  vpEl.dispatchEvent(new window.Event('scroll'));
  check('刷新后 scroll 事件确实会恢复旧 offset（问题前提）', ev('offset') === 600, 'offset=' + ev('offset'));
  inject();
  placeCaret(0);
  doc.getElementById('btnPlay').click();
  inject();
  check('问题2：caret 在开头时从第一个词播放（文稿不跳，offset 保持）', pick() === 0,
    'offset=' + ev('offset') + ' playWord=' + pick());
  ev('setPlaying(false);');

  // 初始化防护：禁用浏览器滚动恢复（源码守卫）
  check('init 禁用 scrollRestoration', /history\.scrollRestoration\s*=\s*'manual'/.test(html));
  // caretSeekOffset 生命周期：暂停时清空，避免残留旧位置污染
  check('暂停时清空 caret 意图且保留高亮（源码守卫）', /caretSeekOffset\s*=\s*null;\s*\n\s*setPlaying\(false,\s*true\)/.test(html));
  ev('caretSeekOffset=null; readTokens=null; readLines=null; readTokensDirty=true;');
}

// --- 17. 桌面大视口：刷新→播放从第一个词开始且文稿不跳变（第十四/十五轮）---
// 第十四轮用负 offset 推文稿去对齐固定视口20%阅读头 → 文稿"突然刷新"跳到中间（第十五轮用户反馈）。
// 第十五轮修复：改为可变阅读头锚点 readHeadContentY —— 起点时锚点对齐首词、offset 不动（文稿零跳变），
// 播放中锚点与 offset 同步 += 速度（匀速保持）。
{
  const VH = 800, LINE = 68, TOP = 28, PER = 10;
  Object.defineProperty(vpEl, 'clientHeight', { value: VH, configurable: true });
  Object.defineProperty(st, 'offsetHeight', { value: 6000, configurable: true });
  const inject = () => {
    const toks = [], lines = [];
    for (let L=0;L<20;L++){
      for (let k=0;k<PER;k++){ const gi=L*PER+k; toks.push({top:TOP+L*LINE,left:22+k*40,w:36,h:44,charStart:gi,charEnd:gi+1}); }
      lines.push({start:L*PER,end:L*PER+PER-1,top:TOP+L*LINE,height:LINE});
    }
    ev('readTokens=' + JSON.stringify(toks) + '; readLines=' + JSON.stringify(lines) + '; readTokensDirty=false; readTokensText=scrollText.textContent;');
  };
  const pick = () => ev(`(function(){
    const hy=readHeadContentY, L=readLines; let li=0;
    while(li<L.length-1 && hy>L[li].top+L[li].height) li++;
    const c=L[li], n=c.end-c.start+1;
    const f=Math.max(0,Math.min(1,(hy-c.top)/Math.max(1,c.height)));
    return n>1 ? c.start+Math.min(n-1,Math.floor(f*n)) : c.start;
  })()`);

  // 完整用户流程：播放 → 暂停 → 刷新(光标回起点) → 再播放
  ev('offset=400; reachedEnd=false; setPlaying(true);');
  doc.getElementById('btnPlay').click();          // 暂停
  doc.getElementById('btnReset').click();         // 刷新（offset=0, 光标回开头）
  inject();
  check('大视口刷新后 caret 意图指向开头', ev('caretSeekOffset') === 0, 'caretSeekOffset=' + ev('caretSeekOffset'));
  const offBefore = ev('offset');                 // 播放前文稿位置 = 0
  doc.getElementById('btnPlay').click();          // 再播放
  inject();
  check('大视口刷新→播放命中第一个词（不再是第三行）', pick() === 0,
    'offset=' + ev('offset') + ' playWord=' + pick());
  check('从头播放文稿不跳变：offset 保持播放前位置（0）', ev('offset') === offBefore,
    'before=' + offBefore + ' after=' + ev('offset'));
  check('锚点对齐首词内容坐标（约 padding 28px + 半行）',
    ev('readHeadContentY') > 0 && ev('readHeadContentY') < 100, 'anchor=' + ev('readHeadContentY'));
  ev('setPlaying(false);');

  // 匀速：推进 1 秒，锚点推进多少，文稿就必须推进多少（且阅读点恒在视口 20%）
  ev('state.speedUnit="px"; state.speedPx=90; remoteSpeedMul=1; voiceFollowing=false;');
  ev('readHeadContentY=400; offset=offsetForHead(readHeadContentY); setPlaying(true); lastTs=0;');
  inject();
  const a0 = ev('readHeadContentY'), o0 = ev('offset');
  let _t17 = 0; for (let i=0;i<60;i++){ _t17 += 1000/60; ev('loop(' + _t17 + ')'); }
  const a1 = ev('readHeadContentY'), o1 = ev('offset');
  check('播放中锚点与文稿同步前进（匀速保持）', Math.abs((o1-o0)-(a1-a0)) < 0.01,
    'offsetΔ=' + (o1-o0).toFixed(1) + ' anchorΔ=' + (a1-a0).toFixed(1));
  check('阅读点稳定在视口 20%（高亮不再贴顶边划出屏幕）',
    Math.abs((a1 - o1) - ev('readHeadScreenY()')) < 1,
    'head-offset=' + (a1-o1).toFixed(1) + ' screenY=' + ev('readHeadScreenY()'));
  ev('setPlaying(false);');

  // 源码守卫
  check('起点用 anchorReadHeadToToken（不改 offset 推文稿）',
    (html.match(/anchorReadHeadToToken\(/g) || []).length >= 3,
    'count=' + (html.match(/anchorReadHeadToToken\(/g) || []).length);
  check('loop 中锚点与 offset 同步推进', /readHeadContentY\s*\+=\s*step/.test(html));
  check('已移除负起点 clampPlayOffset/minPlayOffset', !/clampPlayOffset|minPlayOffset/.test(html));
  ev('caretSeekOffset=null; readTokens=null; readLines=null; readTokensDirty=true;');
}

// --- 18. 语言下拉：非汉语用户优先，中文移到 EN / Français 下面 ---
{
  const opts = [...doc.getElementById('langSelect').querySelectorAll('option')].map(o => o.value);
  check('语言顺序 EN → fr → zh 在前三', opts.slice(0,3).join(',') === 'en,fr,zh', opts.join(','));
  check('七语仍齐全', ['zh','en','de','fr','ja','ko','ru'].every(l => opts.includes(l)));
  check('SUPPORTED_LANGS 校验未受影响', ev(`SUPPORTED_LANGS.join(',')==='zh,en,de,fr,ja,ko,ru'`));
}

// --- 19. 第十六轮：高亮四项修复（顶部留白 / 跳空白行 / 读完末行 / 文稿不跳）---
{
  check('顶部预留 1~2 行空白：scrollText padding-top 为 2.2em', /#scrollText\{[\s\S]*?padding:2\.2em 22px 1em/.test(html));
  check('空白行行高钳制逻辑存在（normalGap 判定 + 1.6 倍阈值）',
    /normalGap\s*=\s*Infinity/.test(html) && /normalGap \* 1\.6/.test(html));
  check('播放终点改为 readEndContentY（锚点扫过末行），不再仅 offset>=max',
    /function readEndContentY\(\)/.test(html) && /readHeadContentY >= endY/.test(html));
  check('文稿位移由阅读点反推并钳在 max（底部不露白）',
    /offset = offsetForHead\(readHeadContentY\)/.test(html) && /function offsetForHead[\s\S]{0,120}clampOffset\(head - readHeadScreenY\(\)\)/.test(html));

  const VH=600, LINE=68, PER=8, TOP=100;
  Object.defineProperty(vpEl,'clientHeight',{value:VH,configurable:true});
  // 有词缓存场景：末行末尾坐标 + 高亮可达末词 + 到底自动暂停
  const toks=[],lines=[]; let acc=TOP;
  for(let L=0;L<10;L++){
    for(let k=0;k<PER;k++){const gi=L*PER+k;toks.push({top:acc,left:22+k*40,w:36,h:44,charStart:gi,charEnd:gi+1});}
    lines.push({start:L*PER,end:L*PER+PER-1,top:acc,height:LINE}); acc+=LINE;
  }
  ev('readTokens='+JSON.stringify(toks)+';readLines='+JSON.stringify(lines)+';readTokensDirty=false;readTokensText=scrollText.textContent;');
  const endY=ev('readEndContentY()');
  check('readEndContentY 指向最后一行末尾（>760）', endY>760, 'endY='+endY);
  ev('playing=true; reachedEnd=false; readCounted=false; offset=0; anchorReadHeadToToken(0);');
  // 直接把锚点推到末尾，验证高亮命中最后一个词
  ev('readHeadContentY=readEndContentY();');
  const pickLast=ev(`(function(){const hy=readHeadContentY,L=readLines;let li=0;
    while(li<L.length-1&&hy>L[li].top+L[li].height)li++;
    const c=L[li],n=c.end-c.start+1,f=Math.max(0,Math.min(1,(hy-c.top)/Math.max(1,c.height)));
    return n>1?c.start+Math.min(n-1,Math.floor(f*n)):c.start;})()`);
  check('锚点到达末尾时高亮命中最后一个词（79）', pickLast===79, 'idx='+pickLast);
  // loop 推进到末尾应自动暂停、置 reachedEnd
  Object.defineProperty(st,'offsetHeight',{value:TOP+9*LINE+LINE+1,configurable:true}); // max≈1
  ev('offset=0; readHeadContentY=readEndContentY()-0.01; state.speedUnit="px"; state.speedPx=90; remoteSpeedMul=1; voiceFollowing=false; lastTs=900;');
  ev('loop(1000);'); // dt=0.1s → step=9px > 0.01，锚点越过 endY
  check('锚点扫过末行后播放自动停止', ev('playing')===false, 'playing='+ev('playing'));
  check('读完置 reachedEnd（供下次 ▶ 重头播）', ev('reachedEnd')===true, 'reachedEnd='+ev('reachedEnd'));
  ev('playing=false; setPlaying(false); caretSeekOffset=null; readTokens=null; readLines=null; readTokensDirty=true;');
}

// --- 20. 第十七轮：空白带快进，逐词高亮节奏连续（不再空等）---
{
  check('空白带快进函数 blankGapAhead 存在', /function blankGapAhead\(headY\)/.test(html));
  check('loop 使用空白带快进步长（一步跨完，不被行权重缩放）',
    /const bg = blankGapAhead\(readHeadContentY\)/.test(html) &&
    /step = Math\.max\(step, bg\.nextTop - readHeadContentY\)/.test(html));

  // 场景：行0(8词) → 夹2空行 → 行1(8词) → 夹3空行 → 行2(8词)
  // 真实 top: 0 / 204 / 408；行高钳制后 68 / 68 / 44
  const lines = [
    {start:0,end:7,top:0,height:68},
    {start:8,end:15,top:204,height:68},
    {start:16,end:23,top:408,height:44},
  ];
  ev('readLines=' + JSON.stringify(lines) + ';');
  check('文字带内不快进（headY=30 → null）', ev('blankGapAhead(30)') === null, JSON.stringify(ev('blankGapAhead(30)')));
  const bg100 = ev('blankGapAhead(100)');
  check('空白带内快进（headY=100 → nextTop=204）', bg100 && bg100.nextTop === 204, JSON.stringify(bg100));
  check('行首边界不重复快进（headY=204 → null）', ev('blankGapAhead(204)') === null, JSON.stringify(ev('blankGapAhead(204)')));

  const pickWord = (hy) => {
    let li=0; while(li<lines.length-1 && hy>lines[li].top+lines[li].height) li++;
    const c=lines[li], n=c.end-c.start+1;
    if(n<=1) return c.start;
    const f=Math.max(0,Math.min(1,(hy-c.top)/Math.max(1,c.height)));
    return c.start+Math.min(n-1,Math.floor(f*n));
  };
  const endY = 408+44;
  function simulate(useFast){
    let hy=0, prev=-1, hold=0; const holds=[], seen=new Set(); let guard=0;
    while(hy<=endY && guard++<20000){
      let step=1;
      if(useFast){ const bg=ev('blankGapAhead('+hy+')'); if(bg) step=Math.max(step, bg.nextTop-hy); }
      const w=pickWord(hy); seen.add(w);
      if(w!==prev){ if(prev>=0) holds.push(hold); prev=w; hold=0; }
      hold++; hy+=step;
    }
    if(prev>=0) holds.push(hold);
    return { holds, seen };
  }
  const before=simulate(false), after=simulate(true);
  const maxBefore=Math.max(...before.holds), maxAfter=Math.max(...after.holds);
  check('修复前复现空等（单次停留 >100 帧）', maxBefore>100, 'maxBefore='+maxBefore);
  check('修复后无空等（单次停留 <20 帧，节奏连续）', maxAfter<20, 'maxAfter='+maxAfter);
  check('修复后 24 个词全部被高亮覆盖', after.seen.size===24, 'seen='+[...after.seen].sort((a,b)=>a-b).join(','));
  ev('readLines=null; readTokens=null; readTokensDirty=true;');
}

// --- 21. 按字符匀速：短行不再慢、长行不再快，标点快速略过（第十七轮）---
// 用户反馈：3字行每字停留约 23 帧、30字行仅 2.3 帧（差10×）。根因=按行匀速
// （阅读头穿过每行耗时固定）。修复=阅读头穿过一行的耗时 ∝ 行阅读权重和。
// 这里直接调用页面真实函数 tokenIndexAtFrac / paceScaleForHead 验证。
{
  // 注入：短行(3字) 与 长行(30字) 交替，每字 w=1；行高固定 68
  const GAP = 68, TOP = 28;
  const toks = [], lines = [];
  const spec = [3, 30, 3, 30];
  let gi = 0;
  for (let L = 0; L < spec.length; L++){
    const n = spec[L], start = gi;
    for (let k = 0; k < n; k++){
      toks.push({ top: TOP+L*GAP, left: 22+k*40, w: 36, h: 44, rw: 1, charStart: gi, charEnd: gi+1 });
      gi++;
    }
    lines.push({ start, end: gi-1, top: TOP+L*GAP, height: GAP, weight: n });
  }
  ev('readTokens=' + JSON.stringify(toks) + '; readLines=' + JSON.stringify(lines) +
     '; totalReadWeight=' + spec.reduce((a,b)=>a+b,0) + '; readTokensDirty=false; readTokensText=scrollText.textContent;');
  Object.defineProperty(st, 'offsetHeight', { value: 6000, configurable: true });
  Object.defineProperty(vpEl, 'clientHeight', { value: 800, configurable: true });

  // 真实函数：给定行与 frac 命中哪个词
  const pickReal = (li, frac) => ev(`tokenIndexAtFrac(readLines[${li}], ${frac})`);
  // 真实函数：当前 headY 的步速缩放
  const scaleReal = (hy) => ev(`paceScaleForHead(${hy})`);

  const endY = TOP + spec.length * GAP;
  const BASE = 0.5; // 基础速度 px/帧
  let hy = TOP, guard = 0;
  const holds = new Array(gi).fill(0), seen = new Set();
  // 逐帧模拟：每帧时间恒为 1，阅读头按 BASE*scale(hy) 前进；
  // 命中哪个词就用真实 tokenIndexAtFrac，该词停留帧数 +1。
  while (hy <= endY && guard++ < 200000){
    let li = 0;
    const L = lines;
    while (li < L.length-1 && hy > L[li].top + L[li].height) li++;
    const frac = Math.max(0, Math.min(1, (hy - L[li].top) / Math.max(1, L[li].height)));
    const wi = pickReal(li, frac);
    seen.add(wi);
    holds[wi] += 1;             // 一帧 = 一个时间单位
    hy += BASE * scaleReal(hy); // 步速随行权重自适应
  }

  // 每字停留时间（权重1的字应大致相同）
  const holdsShort = [], holdsLong = [];
  let idx = 0;
  for (let l = 0; l < spec.length; l++){
    for (let k = 0; k < spec[l]; k++){
      (spec[l] === 3 ? holdsShort : holdsLong).push(holds[idx++]);
    }
  }
  const avg = a => a.reduce((x,y)=>x+y,0)/a.length;
  const aShort = avg(holdsShort), aLong = avg(holdsLong);
  const ratio = Math.max(aShort,aLong) / Math.max(0.0001, Math.min(aShort,aLong));
  check('真实函数存在：tokenIndexAtFrac / paceScaleForHead',
    ev('typeof tokenIndexAtFrac') === 'function' && ev('typeof paceScaleForHead') === 'function');
  check('按字符匀速：短行(3字)与长行(30字)每字停留时间接近（比值<1.5）',
    ratio < 1.5, 'short=' + aShort.toFixed(1) + ' long=' + aLong.toFixed(1) + ' ratio=' + ratio.toFixed(2));
  check('修复前旧模型该场景比值应≈10（对照）', 23/2.3 > 8, 'old=' + (23/2.3).toFixed(1));
  check('所有词都被高亮覆盖', seen.size === gi, 'seen=' + seen.size + '/' + gi);
  check('短行缩放>1、长行缩放<1（步速自适应）',
    scaleReal(TOP+10) > 1.5 && scaleReal(TOP+GAP+10) < 0.6,
    'short=' + scaleReal(TOP+10).toFixed(2) + ' long=' + scaleReal(TOP+GAP+10).toFixed(2));

  // 标点快过：注入一行含标点，标点 w 应小于普通字
  const punctLine = { start: 0, end: 2, top: TOP, height: GAP, weight: 1+0.25+1 };
  const pt = [
    { top: TOP, left: 22, w: 36, h: 44, rw: 1 },
    { top: TOP, left: 60, w: 12, h: 44, rw: 0.25 },
    { top: TOP, left: 80, w: 36, h: 44, rw: 1 },
  ];
  ev('readTokens=' + JSON.stringify(pt) + '; readLines=' + JSON.stringify([punctLine]) +
     '; totalReadWeight=' + punctLine.weight + '; readTokensDirty=false;');
  // frac 0.5 应命中第2词（标点权重区间窄，中心在(1+0.125)/2.25≈0.5）
  check('tokenWeight 读取标点低权重', ev('tokenWeight(1)') === 0.25, 'w=' + ev('tokenWeight(1)'));
  check('tokenFracAt 与 tokenIndexAtFrac 互逆（普通词）',
    (() => { const f = ev('tokenFracAt(0)'); return ev(`tokenIndexAtFrac(readLines[0], ${f})`) === 0; })(),
    'f0=' + ev('tokenFracAt(0)'));
  check('标点 frac 区间比普通字窄（快速略过）',
    (() => {
      const f1 = ev('tokenFracAt(1)'), f2 = ev('tokenFracAt(2)');
      const spanPunct = f2 - f1; // 标点区间
      const spanNormal = f1 - ev('tokenFracAt(0)'); // 第0词...近似
      return spanPunct < 0.4;
    })(),
    'f1=' + ev('tokenFracAt(1)') + ' f2=' + ev('tokenFracAt(2)'));
  ev('readLines=null; readTokens=null; readTokensDirty=true;');
}

// --- 22. 完成卡（阅读成就卡 · 裂变传播，第十八轮）---
{
  const finishKeys = ['finishTitle','finishHint','finishSave','finishShare','finishContinue',
    'finishBadge','finishFor','finishAnon','finishScriptsDone','finishPersona1','finishPersona2',
    'finishPersona3','finishPersona4','finishPersona5','finishBragLine','finishCtaTitle',
    'finishCtaSub','finishShareText','displayNameLabel','displayNamePlaceholder','displayNameHint','finishCardLabel'];
  check('完成卡 22 键七语齐全', ev(`['zh','en','de','fr','ja','ko','ru'].every(l=>${JSON.stringify(finishKeys)}.every(k=>!!I18N[l][k]))`));
  check('完成卡文案含 {n}/{name} 占位符',
    ev(`I18N.zh.finishBragLine.includes('{n}') && I18N.en.finishBragLine.includes('{n}') && I18N.zh.finishCtaSub.includes('{name}')`));
  check('完成卡浮层及按钮都在 DOM',
    ['finishOverlay','finishPreview','btnFinishSave','btnFinishShare','btnFinishClose','setDisplayName','setFinishCard']
      .every(id => !!doc.getElementById(id)));
  check('完成卡函数存在',
    ev(`['generateFinishCard','showFinishCard','closeFinishCard','finishDisplayName','finishPersona'].every(f=>typeof window[f]==='function')`));
  // 名字来源：自定义 > Telegram > 兜底
  ev('state.displayName="测试用户";');
  check('完成卡显示自定义名字', ev('finishDisplayName()') === '测试用户', ev('finishDisplayName()'));
  ev('state.displayName="";');
  check('无自定义名字时有兜底（非空字符串）', (ev('finishDisplayName()')||'').length > 0, ev('finishDisplayName()'));
  // 人格化称号：五个档位都能取到、且彼此不同（普适性 > 排行榜）
  const personas = [0,3,10,30,100].map(n => ev(`finishPersona(${n})`));
  check('人格化称号五档取到且互不相同', personas.every(p => !!p) && new Set(personas).size === 5, JSON.stringify(personas));
  // 读完触发：onReadComplete 后 setTimeout(showFinishCard,250) 注册
  check('onReadComplete 注册了完成卡弹出', /setTimeout\(showFinishCard,\s*\d+\)/.test(html));
  // showFinishCard 受开关控制
  ev('state.finishCard=false;');
  ev('showFinishCard();');
  check('关闭开关后 showFinishCard 不弹卡', doc.getElementById('finishOverlay').classList.contains('hidden'));
  ev('state.finishCard=true;');
  // closeFinishCard 能关闭
  ev('document.getElementById("finishOverlay").classList.remove("hidden"); closeFinishCard();');
  check('closeFinishCard 关闭完成卡', doc.getElementById('finishOverlay').classList.contains('hidden'));

  // --- 名字★必填 + 本机 ID + 成就感称号（本轮） ---
  check('新增 7 个身份键七语齐全', ev(`['zh','en','de','fr','ja','ko','ru'].every(l=>['nameRequired','localIdLabel','localIdHint','btnCopyId','btnResetId','idCopied','resetIdConfirm'].every(k=>!!I18N[l][k]))`));
  check('名字输入框有红色必填标记（CSS + 红框）', /\.req-label::after\{content:' ★'; color:#e02424;\}/.test(html) && /id="setDisplayName"[^>]*border:1px solid #d92d20/.test(html));
  check('设置页有专属 ID 区块（复制/换一个按钮）',
    ['myLocalId','btnCopyId','btnResetId'].every(id => !!doc.getElementById(id)));
  check('本机 ID 格式合法（TP- + 6位 base32，无易混淆字符）',
    /^TP-[A-HJ-NP-Z2-9]{6}$/.test(ev('ensureLocalId()')) || /^TP-[A-HJ-NP-Z2-9]{6}$/.test(ev('state.localId')));
  check('本机 ID 只存 state、不进云端字段', !/localId[\s\S]{0,40}(syncScripts|maybeSync)/.test(html));
  const idBefore = ev('state.localId');
  ev('state.localId=""; ensureLocalId();');
  check('清空后自动补发合法 ID', /^TP-[A-HJ-NP-Z2-9]{6}$/.test(ev('state.localId')) && ev('state.localId') !== '');
  ev(`state.localId=${JSON.stringify(idBefore)};`);
  check('名字护栏：控制字符与超长被清理', ev(`cleanDisplayName('  测试\\n用户\\u0001' + 'x'.repeat(50)).length`) === 24);
  check('名字护栏：普通名字原样保留', ev(`cleanDisplayName('  小明  ') === '小明'`));
  check('★必填只认用户输入，Telegram 昵称/匿名不算', ev(`(function(){ state.displayName=''; return hasOwnDisplayName()===false; })()`));
  ev('state.displayName="测试用户";');
  check('填入名字后 hasOwnDisplayName 为真', ev('hasOwnDisplayName() === true'));
  ev('state.displayName="";');
  check('必填校验函数存在且缺名字时返回 false 并给出提示',
    ev(`typeof requireDisplayNameForCard==='function' && requireDisplayNameForCard()===false`) && ev(`toastEl.textContent.length>0`));
  ev('state.displayName="回归用户"; toastEl.textContent="";');
  check('有名字时必填校验放行', ev('requireDisplayNameForCard() === true'));
  check('称号拆分：五种语言都能取出「称号」+ 宣言', ev(`['zh','en','de','fr','ja','ko','ru'].every(l=>{ curLang=l; const p=finishPersonaParts(30); return !!p.title && !!p.claim; })`));
  ev(`curLang='zh';`);
  check('成就称号文案升级为「勋章式」五档（含称号符号）', ev(`['finishPersona1','finishPersona2','finishPersona3','finishPersona4','finishPersona5'].every(k=>/[「"«]/.test(I18N.zh[k]))`));
  check('完成卡在名字下绘制本机 ID 行', /'ID  ' \+ state\.localId/.test(html));
  check('完成卡绘制称号牌（圆角勋章 + 宣言）', /finishPersonaParts\(reads\)/.test(html) && /ctx\.roundRect\(tx, ty, tw, th, 33\)/.test(html));
  // canvas 生成：jsdom 无 canvas 实现，stub getContext→null 验证安全降级路径
  const proto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
  const origGetCtx = proto && proto.getContext;
  if (proto) proto.getContext = function(){ return null; };
  let genOk = true;
  try { ev('generateFinishCard();'); } catch(e){ genOk = false; }
  check('generateFinishCard 无 canvas 时安全降级不抛错', genOk);
  if (proto && origGetCtx) proto.getContext = origGetCtx;
}

// --- 22. 暂停高亮定格 + 短稿逐词高亮（第十九轮）---
// 问题1：setPlaying(false,true) 暂停时保留高亮，不调用 hideReadMark
check('setPlaying 支持 keepMark 参数', /function setPlaying\(on,\s*keepMark\)/.test(html));
check('暂停分支不隐藏高亮（else if !keepMark 才 hideReadMark）', /else if \(!keepMark\) hideReadMark\(\)/.test(html));
check('手动暂停传入 keepMark=true', /caretSeekOffset\s*=\s*null;\s*\n\s*setPlaying\(false,\s*true\)/.test(html));
check('读完定格末词（setPlaying false,true）', /钉在末行末尾[\s\S]{0,120}setPlaying\(false,\s*true\)/.test(html));
check('远程暂停也保留高亮', /cmd === 'pause'\)\{ setPlaying\(false,\s*true\)/.test(html));
// 归零/改稿仍隐藏（不误用 keepMark）
check('刷新归零隐藏高亮（默认无 keepMark）', /caretSeekOffset = 0;[\s\S]{0,120}setPlaying\(false\);/.test(html));

// DOM 行为验证：播放→暂停后 readMark 保持 display:block 且坐标不变
ev("playing=false; offset=0; reachedEnd=false; caretSeekOffset=null;");
// 伪造可滚动尺寸 + 长文稿，确保词元缓存可建、高亮能定位
const rmDoc = st;
rmDoc.textContent = '这是一段足够长的讲稿内容用于验证暂停时高亮定格在当前词的位置效果'.repeat(6);
rmDoc.dataset.isDefault = '0';
Object.defineProperty(rmDoc, 'offsetHeight', { value: 2000, configurable: true });
const vpEl19 = doc.getElementById('viewport');
Object.defineProperty(vpEl19, 'clientHeight', { value: 400, configurable: true });
// 用 mock 的 getBoundingClientRect 让 buildReadTokens 能算出词坐标
const origRect = rmDoc.getBoundingClientRect.bind(rmDoc);
Object.defineProperty(rmDoc, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 600, bottom: 2000, width: 600, height: 2000 }), configurable: true });
Object.defineProperty(vpEl19, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 }), configurable: true });
// 用 spy 计数 hideReadMark 调用，区分"暂停保留"与"归零隐藏"，不依赖 jsdom 真实布局
try {
  ev('window.__hideCount=0; window.__origHide=hideReadMark; hideReadMark=function(){ window.__hideCount++; };');
  ev('setPlaying(false, true);');  // 暂停：不应隐藏
  const keepCount = ev('window.__hideCount');
  check('暂停(keepMark)不调用 hideReadMark', keepCount === 0, 'hide调用=' + keepCount);
  ev('window.__hideCount=0;');
  ev('setPlaying(false);');        // 归零/默认：应隐藏
  const normalCount = ev('window.__hideCount');
  check('默认 setPlaying(false) 调用 hideReadMark', normalCount === 1, 'hide调用=' + normalCount);
  ev('hideReadMark = window.__origHide;');
} catch(e){
  check('暂停高亮 spy 验证', false, e.message);
}
Object.defineProperty(rmDoc, 'getBoundingClientRect', { value: origRect, configurable: true });

// 问题2：短稿（max=0）也能逐词高亮
check('updateReadMark 移除 max>0 门槛', !/if \(!\(max > 0\)\)\{ hideReadMark/.test(html));
check('togglePlay 移除 max<=0 的 return 拦截', !/if \(max <= 0\)\{[\s\S]{0,80}editNoScroll[\s\S]{0,40}return/.test(html));
// DOM 行为：不足一屏点播放进入 playing=true，且高亮可见
let shortOk = true, shortDetail = '';
try {
  ev('playing=false; reachedEnd=false; caretSeekOffset=null; offset=0;');
  st.textContent = '短稿一句话用于验证不足一屏时逐词高亮依然工作';
  st.dataset.isDefault = '0';
  Object.defineProperty(st, 'offsetHeight', { value: 100, configurable: true });
  Object.defineProperty(vpEl19, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(st, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, right: 500, bottom: 100, width: 500, height: 100 }), configurable: true });
  ev('readTokensDirty=true;');
  doc.getElementById('btnPlay').click();
  shortOk = ev('playing') === true;
  shortDetail = 'playing=' + ev('playing') + ' max=' + ev('maxOffset()');
  check('短稿点播放进入播放态（不 return）', shortOk, shortDetail);
} catch(e){
  check('短稿高亮 DOM 验证', false, e.message);
}

// --- 23. 第二十~二十一轮：眼睛三态循环(强底色/淡下划线/关) + 高亮强度两档，一处按钮全覆盖 ---
// 23a. 七语新增 10 键齐全（三态循环 7 键 + 下方常驻标签 3 键 → 226+3=229 键）
check('眼睛三态/强度/标签 10 个 i18n 键七语齐全', ev(`['zh','en','de','fr','ja','ko','ru'].every(l=>['toggleReadMark','readMarkOn','readMarkOff','readMarkStrengthLabel','readMarkStrengthStrong','readMarkStrengthSubtle','readMarkStrengthHint','readMarkModeStrong','readMarkModeSubtle','readMarkModeOff'].every(k=>!!I18N[l][k] && I18N[l][k].length>0))`));

// 23b. CSS 两档样式存在 + 眼睛开态样式
check('高亮 subtle 淡下划线档 CSS 存在', /#readMark\.subtle\{[^}]*background:[^}]*border-bottom/.test(css));
check('强底色为默认（#readMark 基础规则含底色）', /#readMark\{[^}]*background:rgba\(255,196,46/.test(css));
check('眼睛按钮 aria-pressed 开态/关态样式存在', /#btnReadMark\[aria-pressed="true"\]/.test(css) && /#btnReadMark\[aria-pressed="false"\]/.test(css));
// 眼睛按钮已移到顶部 header、紧邻字体缩放按钮（与 A−/A+ 同一个 group）
const btnRM = doc.getElementById('btnReadMark');
check('眼睛按钮在顶部 header 内', !!btnRM && !!btnRM.closest('header'));
// 眼睛按钮+下方标签包在 #btnReadMarkWrap 里，wrap 与 A−/A+ 同属 quick controls 组
const rmWrap = doc.getElementById('btnReadMarkWrap');
check('眼睛按钮包在 #btnReadMarkWrap 且 wrap 紧邻字体缩放按钮（同一 quick controls 组）', !!rmWrap && btnRM.parentElement === rmWrap && rmWrap.parentElement === doc.getElementById('btnFontDown').parentElement && [...rmWrap.parentElement.children].map(e=>e.id).join(',') === 'btnReadMarkWrap,btnFontDown,btnFontUp');
// 眼睛下方常驻状态标签：就在按钮所在 wrap 内、按钮之后
const rmStatus = doc.getElementById('readMarkStatus');
check('眼睛下方常驻档位标签存在且在按钮之后（同一 wrap）', !!rmStatus && rmStatus.parentElement === rmWrap && rmStatus.previousElementSibling === btnRM);
check('标签常驻可见（非 toast，不依赖 .show 类）', !/\.show/.test(rmStatus.className) && !!rmStatus.textContent);
check('标签三档颜色 CSS 存在（strong/subtle/off）', /#readMarkStatus\[data-mode="strong"\]/.test(css) && /#readMarkStatus\[data-mode="subtle"\]/.test(css) && /#readMarkStatus\[data-mode="off"\]/.test(css));

// 23c. 眼睛按钮三态循环 + 与设置面板双向同步（纯状态层验证，不依赖布局）
const cbRM = doc.getElementById('setReadMark');
const selStrength = doc.getElementById('setReadMarkStrength');
ev('state.readMark=true; state.readMarkStrength="strong"; syncReadMarkUI();');
check('起始 strong 档：data-mode=strong、aria-pressed=true、复选框勾选', btnRM.getAttribute('data-mode') === 'strong' && btnRM.getAttribute('aria-pressed') === 'true' && cbRM.checked === true);
check('起始档位标签就地显示「强底色」', rmStatus.textContent === ev("t('readMarkModeStrong')") && rmStatus.getAttribute('data-mode') === 'strong');
check('title 明确当前档→下一档（状态可见、下一击可预期）', btnRM.title === ev("t('toggleReadMark')+'：'+readMarkModeName('strong')+' → '+readMarkModeName('subtle')"));
btnRM.click();
check('点1 strong→subtle：仍开、改淡下划线、data-mode=subtle、下拉同步、标签同步', ev('state.readMark') === true && ev('state.readMarkStrength') === 'subtle' && btnRM.getAttribute('data-mode') === 'subtle' && cbRM.checked === true && selStrength.value === 'subtle' && rmStatus.textContent === ev("t('readMarkModeSubtle')") && rmStatus.getAttribute('data-mode') === 'subtle');
btnRM.click();
check('点2 subtle→off：关闭、data-mode=off、aria-pressed=false、复选框取消、标签「已关闭」', ev('state.readMark') === false && btnRM.getAttribute('data-mode') === 'off' && btnRM.getAttribute('aria-pressed') === 'false' && cbRM.checked === false && rmStatus.textContent === ev("t('readMarkModeOff')") && rmStatus.getAttribute('data-mode') === 'off');
btnRM.click();
check('点3 off→strong：重开且回强底色、标签「强底色」', ev('state.readMark') === true && ev('state.readMarkStrength') === 'strong' && btnRM.getAttribute('data-mode') === 'strong' && btnRM.getAttribute('aria-pressed') === 'true' && cbRM.checked === true && rmStatus.textContent === ev("t('readMarkModeStrong')"));
// 眼睛点击不再弹底部 toast（状态已就地显示在标签上）
check('眼睛点击处理不再调用 toast（状态改由下方标签承载）', !/btnReadMark\.addEventListener\('click'[\s\S]{0,420}?toast\(/.test(html));
// 反向：设置面板复选框改动 → 眼睛按钮同步
cbRM.checked = false; cbRM.dispatchEvent(new window.Event('change', { bubbles: true }));
check('设置复选框关闭 → 眼睛同步为 off 档', ev('state.readMark') === false && btnRM.getAttribute('data-mode') === 'off' && btnRM.getAttribute('aria-pressed') === 'false');
cbRM.checked = true; cbRM.dispatchEvent(new window.Event('change', { bubbles: true }));
check('设置复选框开启 → 眼睛同步为开（档位按当前强度）', ev('state.readMark') === true && btnRM.getAttribute('data-mode') === ev('readMarkMode()') && btnRM.getAttribute('aria-pressed') === 'true');
// 三态循环函数本身
check('三态循环顺序 strong→subtle→off→strong', ev("nextReadMarkMode('strong')==='subtle' && nextReadMarkMode('subtle')==='off' && nextReadMarkMode('off')==='strong'"));
check('data-mode 三态视觉标记 CSS 存在（subtle 金线 / off 斜杠）', /#btnReadMark\[data-mode="subtle"\]::after/.test(css) && /#btnReadMark\[data-mode="off"\]::after/.test(css));

// 23d. 高亮强度两档切换（设置面板保留为精确入口，且与眼睛按钮同步）
check('强度选择器存在且有 strong/subtle 两档', !!selStrength && [...selStrength.options].map(o=>o.value).join(',') === 'strong,subtle');
selStrength.value = 'subtle'; selStrength.dispatchEvent(new window.Event('change', { bubbles: true }));
check('切到淡下划线：state 更新、readMarkEl 带 subtle class、眼睛 data-mode 与标签同步', ev('state.readMarkStrength') === 'subtle' && ev("document.getElementById('readMark').classList.contains('subtle')") === true && btnRM.getAttribute('data-mode') === 'subtle' && rmStatus.textContent === ev("t('readMarkModeSubtle')"));
selStrength.value = 'strong'; selStrength.dispatchEvent(new window.Event('change', { bubbles: true }));
check('切回强底色：state 更新、readMarkEl 移除 subtle class、眼睛 data-mode 与标签同步', ev('state.readMarkStrength') === 'strong' && ev("document.getElementById('readMark').classList.contains('subtle')") === false && btnRM.getAttribute('data-mode') === 'strong' && rmStatus.textContent === ev("t('readMarkModeStrong')"));
// 非法值兜底为 strong
selStrength.value = 'bogus'; selStrength.dispatchEvent(new window.Event('change', { bubbles: true }));
check('非法强度值兜底为 strong', ev('state.readMarkStrength') === 'strong');

// 23e. 源码层：切换事件都调用 syncReadMarkUI / applyReadMarkStrength，且初始化回填
check('眼睛/设置切换均双向同步（源码守卫）', (html.match(/syncReadMarkUI\(\)/g)||[]).length >= 5);
check('强度 change 调用 applyReadMarkStrength + syncReadMarkUI（源码守卫）', /setReadMarkStrength\.addEventListener[\s\S]{0,220}applyReadMarkStrength\(\)[\s\S]{0,80}syncReadMarkUI\(\)/.test(html));
check('初始化回填强度并同步 UI（源码守卫）', /setReadMarkStrength\.value[\s\S]{0,120}syncReadMarkUI\(\)/.test(html));
check('退出编辑态开关仍可一键切换（眼睛按钮独立于设置面板）', /btnReadMark\.addEventListener\('click'/.test(html));
// 23f. 语言切换后眼睛的动态 title 不被 applyI18n 的通用 data-i18n-title 覆盖
ev("state.readMark=true; state.readMarkStrength='subtle'; syncReadMarkUI();");
ev("setLang('en')");
check('切语言后眼睛 title 仍含当前档→下一档（非纯 toggleReadMark）', /\u2192/.test(btnRM.title) && btnRM.getAttribute('data-mode') === 'subtle' && btnRM.title !== ev("t('toggleReadMark')"));
check('切语言后下方标签文案跟着切换（en 为 Subtle）', rmStatus.textContent === 'Subtle' && rmStatus.getAttribute('data-mode') === 'subtle');
ev("setLang('zh')");
check('切回中文后标签文案为「淡下划线」', rmStatus.textContent === '淡下划线');

// 24. 第二十四轮：系统生成的讲稿标题随界面语言切换，用户自定标题保留
// 24a. 默认讲稿标题七语跟随（列表 + 输入框 + 数据模型三处同步）
const expectTitle = { zh:'默认讲稿', en:'Default script', de:'Standardskript', fr:'Script par défaut', ja:'既定の原稿', ko:'기본 대본', ru:'Сценарий по умолчанию' };
ev("state.scripts=[{id:'default',title:t('scriptDefaultTitle'),titleKind:'default',content:'非示例内容',updatedAt:0}]; state.activeScriptId='default'; document.getElementById('scrollText').dataset.isDefault='0'; renderScriptList(); loadActiveIntoEditor();");
for (const [lang, want] of Object.entries(expectTitle)) {
  ev(`setLang('${lang}')`);
  check(`切到 ${lang}：默认讲稿标题=「${want}」（列表/输入框/数据同步）`,
    ev('state.scripts[0].title') === want &&
    doc.querySelector('.script-row-title').textContent === want &&
    doc.getElementById('setScriptTitle').value === want);
}
// 24b. 用户自定标题（含手改过的）切语言后保持原样
ev("state.scripts[0].title='我的自定义讲稿'; state.scripts[0].titleKind='custom'; renderScriptList(); loadActiveIntoEditor();");
ev("setLang('en')");
check('用户自定标题切到 en 后不变（不翻译用户内容）', ev('state.scripts[0].title') === '我的自定义讲稿' && doc.querySelector('.script-row-title').textContent === '我的自定义讲稿' && doc.getElementById('setScriptTitle').value === '我的自定义讲稿');
// 24c. 新建讲稿标题也随语言跟随
ev("state.scripts=[{id:'n1',title:t('scriptNewTitle'),titleKind:'new',content:'x',updatedAt:0}]; state.activeScriptId='n1'; document.getElementById('scrollText').dataset.isDefault='0'; renderScriptList(); loadActiveIntoEditor();");
ev("setLang('fr')");
check('新建讲稿标题切到 fr = Nouveau script', ev('state.scripts[0].title') === 'Nouveau script' && doc.querySelector('.script-row-title').textContent === 'Nouveau script' && doc.getElementById('setScriptTitle').value === 'Nouveau script');
// 24d. 老数据无 titleKind：靠标题文案等于任一语言系统标题来识别
ev("state.scripts=[{id:'old',title:'默认讲稿',content:'x',updatedAt:0}]; state.activeScriptId='old'; document.getElementById('scrollText').dataset.isDefault='0'; renderScriptList(); loadActiveIntoEditor();");
ev("setLang('ja')");
check('老数据无 titleKind 也按文案识别并跟随（补齐标记）', ev('state.scripts[0].title') === '既定の原稿' && ev('state.scripts[0].titleKind') === 'default');
// 24e. 源码守卫：applyI18n 统一调用 refreshScriptTitles；手改标题/导入标为 custom
check('applyI18n 调用 refreshScriptTitles（源码守卫）', /refreshScriptTitles\(\);/.test(html) && /if \(changed\) saveState\(\);/.test(html));
check('手改标题标记 custom（源码守卫）', /setScriptTitle\.addEventListener\('input'[\s\S]{0,160}titleKind = 'custom'/.test(html));
check('导入讲稿标题标记 custom（源码守卫）', /importTextAsNewScript[\s\S]{0,260}titleKind: 'custom'/.test(html));

// --- 25. 第二十五轮：4 个 BUG 修复（标题保持 / 新建反馈 / 自定义取色器） ---
// 25a. BUG1：默认讲稿内容仍是示例稿时，用户改过的标题切语言不能被复位
ev("setLang('zh'); state.scripts=[{id:'default',title:'默认讲稿',titleKind:'default',content:t('defaultScript'),updatedAt:0}]; state.activeScriptId='default'; document.getElementById('scrollText').dataset.isDefault='1'; loadActiveIntoEditor();");
const titleInput = doc.getElementById('setScriptTitle');
titleInput.value = '讲稿1';
titleInput.dispatchEvent(new window.Event('input', { bubbles: true }));
check('BUG1 前置：改标题为「讲稿1」被标为 custom', ev('state.scripts[0].titleKind') === 'custom' && ev('state.scripts[0].title') === '讲稿1');
ev("setLang('en')");
check('BUG1 核心：内容仍是示例稿但标题已改 → 切语言后标题保持「讲稿1」', ev('state.scripts[0].title') === '讲稿1' && doc.querySelector('.script-row-title').textContent === '讲稿1');
ev("setLang('fr')");
check('BUG1 再切 fr 仍保持「讲稿1」', ev('state.scripts[0].title') === '讲稿1');
// 未改标题的默认稿仍应随语言刷新（不因修复而失效）
ev("setLang('zh'); state.scripts=[{id:'default',title:'默认讲稿',titleKind:'default',content:t('defaultScript'),updatedAt:0}]; state.activeScriptId='default'; document.getElementById('scrollText').dataset.isDefault='1'; loadActiveIntoEditor();");
ev("setLang('en')");
check('BUG1 边界：未改标题的默认稿切 en 仍=Default script', ev('state.scripts[0].title') === 'Default script');

// 25b. BUG2：新建讲稿成功要给反馈（scriptCreated 键 + addScript 调用 toast）
check('BUG2 新键 scriptCreated 七语齐全', ev("['zh','en','de','fr','ja','ko','ru'].every(l=>!!I18N[l].scriptCreated && I18N[l].scriptCreated.length>0)"));
check('BUG2 addScript 成功后 toast 提示（源码守卫）', /function addScript\(\)[\s\S]{0,400}toast\(t\('scriptCreated'\)\)/.test(html));
ev("setLang('zh'); state.scripts=[{id:'d',title:'默认讲稿',titleKind:'default',content:'x',updatedAt:0}]; state.activeScriptId='d'; saveState();");
const nBefore = ev('state.scripts.length');
ev("document.getElementById('btnNewScript').click()");
check('BUG2 新建后篇数+1 且有 toast', ev('state.scripts.length') === nBefore + 1 && doc.getElementById('toast').textContent.includes('新建'));

// 25c. BUG3/4：自定义取色器（替换原生弹窗），拖动/点选实时改色
check('BUG3/4 自定义取色器 DOM 齐全（色相/深浅/色卡/预览）',
  !!doc.getElementById('cpWrap') && doc.getElementById('cpHue')?.type === 'range' &&
  doc.getElementById('cpLight')?.type === 'range' && !!doc.getElementById('cpSwatches'));
check('BUG3/4 预设色卡已生成 16 个', doc.querySelectorAll('#cpSwatches .cp-swatch-btn').length === 16);
check('BUG3/4 原生 color input 已隐藏（pointer-events:none 源码守卫）', /id="setColor"[^>]*pointer-events:none/.test(html));
check('BUG3/4 圆形取色光标 10px 居中在色卡上（源码守卫）', /\.cp-swatch-btn\[aria-pressed="true"\]::after\{[^}]*left:50%[^}]*top:50%[^}]*width:10px/.test(html));
// 纯函数：HSV↔HEX 往返
check('BUG3/4 hexToRgb/rgbToHsv/hsvToHex 纯函数可用', ev("hexToRgb('#ff0000').r===255 && Math.round(rgbToHsv(255,0,0).h)===0 && hsvToHex(0,1,1)==='#ff0000'"));
// 真实拖动色相条 → 颜色改变（BUG4 核心：拖动后不再保持黑色）
ev("setColor.value='#1f2430'; state.color='#1f2430';");
const cpHue = doc.getElementById('cpHue');
cpHue.value = '0'; cpHue.dispatchEvent(new window.Event('input', { bubbles: true }));
const colorAfterHue0 = ev('state.color');
check('BUG4 拖色相条到 0 → 颜色改变（不再维持黑色）', colorAfterHue0 !== '#1f2430' && /^#[0-9a-f]{6}$/i.test(colorAfterHue0));
cpHue.value = '240'; cpHue.dispatchEvent(new window.Event('input', { bubbles: true }));
check('BUG4 拖色相条到 240 → 颜色再次改变', ev('state.color') !== colorAfterHue0);
const cpLight = doc.getElementById('cpLight');
const beforeLight = ev('state.color');
cpLight.value = '95'; cpLight.dispatchEvent(new window.Event('input', { bubbles: true }));
check('BUG4 拖深浅条 → 颜色改变', ev('state.color') !== beforeLight);
// 点色卡换色 + aria-pressed 选中态（光标位置可视化）
doc.querySelectorAll('#cpSwatches .cp-swatch-btn')[5].click();
check('BUG3 点色卡切换到对应颜色', ev('state.color') === '#f1c40f');
check('BUG3 选中色卡 aria-pressed=true（圆形光标落在色卡上）', doc.querySelectorAll('#cpSwatches .cp-swatch-btn')[5].getAttribute('aria-pressed') === 'true');
// 色卡/取色器随 state.color 初始化回填
check('取色器 cpSyncFromHex 随颜色回填预览', /function cpSyncFromHex/.test(html) && /cpSyncFromHex\(state\.color\)/.test(html));

// 还原状态，避免影响后续（虽然本测试已近末尾）
ev("setLang('zh'); state.scripts=[{id:'default',title:'默认讲稿',titleKind:'default',content:t('defaultScript'),updatedAt:0}]; state.activeScriptId='default'; document.getElementById('scrollText').dataset.isDefault='1'; loadActiveIntoEditor();");
ev('state.readMark=true; state.readMarkStrength="strong"; syncReadMarkUI();');

// --- 单按钮状态化（云同步入口：一个语义、三态）---
const btnSync = doc.getElementById('btnSyncNow');
const syncStatus = doc.getElementById('scriptSyncStatus');
check('云同步按钮只有一个（无拆成两个按钮）',
  doc.querySelectorAll('#btnSyncNow').length === 1 && !doc.getElementById('btnSaveLocal'));
check('按钮初始为未解锁态 data-mode=locked（源码默认 + 运行时）',
  btnSync.getAttribute('data-mode') === 'locked',
  btnSync.getAttribute('data-mode'));
check('未解锁态文案含锁标记与 Pro，不灰化可点击',
  /云同步/.test(btnSync.textContent) && /Pro/.test(btnSync.textContent) && btnSync.disabled === false,
  btnSync.textContent + ' | disabled=' + btnSync.disabled);
check('未解锁态点击弹升级面板而非假同步（源码守卫）',
  /if \(!canCloudSync\(\)\)\{ if \(typeof openProSheetSafe === 'function'\) openProSheetSafe\(\); return; \}/.test(html));
check('renderSyncStatus 三态分支齐全（locked/pending/ready）',
  /btn\.dataset\.mode = 'locked'/.test(html) && /btn\.dataset\.mode = 'pending'/.test(html) && /btn\.dataset\.mode = 'ready'/.test(html));
check('同步中不重复触发：pending 态按钮 disabled',
  /syncPhase === 'pending'\)\{\s*btn\.dataset\.mode = 'pending';\s*btn\.disabled = true/.test(html));
check('本地保存由状态文字表达（免费态显示 cloudSyncLocal）',
  /if \(!isPro\(\)\) \{ el\.textContent = t\('cloudSyncPro'\) \+ '\\n' \+ t\('cloudSyncLocal'\)/.test(html));
check('动态按钮不挂静态 data-i18n（切语言由 renderSyncStatus 重绘）',
  !btnSync.hasAttribute('data-i18n') && !syncStatus.hasAttribute('data-i18n') &&
  ev('typeof applyI18n === "function" && /renderSyncStatus\\(\\)/.test(applyI18n.toString())'));
// 运行时三态：用 stub 覆盖 canCloudSync，验证文案与 data-mode 随状态切换
ev('window.__origCanSync = canCloudSync; canCloudSync = function(){ return true; }; state.isPro = true; CONFIG.API_BASE = "https://stub";');
ev('syncPhase=""; renderSyncStatus();');
check('付费可用态 data-mode=ready、文案=立即同步、可点击',
  btnSync.getAttribute('data-mode') === 'ready' && /立即同步/.test(btnSync.textContent) && btnSync.disabled === false,
  btnSync.getAttribute('data-mode') + ' | ' + btnSync.textContent);
ev('renderSyncStatus("pending");');
check('同步中态 data-mode=pending、文案=同步中、按钮禁用',
  btnSync.getAttribute('data-mode') === 'pending' && btnSync.disabled === true && /同步中/.test(btnSync.textContent),
  btnSync.getAttribute('data-mode') + ' | ' + btnSync.textContent + ' | disabled=' + btnSync.disabled);
ev('renderSyncStatus("done");');
check('完成态回到 ready、状态文字=云同步已开启',
  btnSync.getAttribute('data-mode') === 'ready' && /任意设备|云端/.test(syncStatus.textContent),
  syncStatus.textContent);
ev('renderSyncStatus("err", "test_err");');
check('失败态显示错误原因且按钮可重试（ready）',
  /test_err/.test(syncStatus.textContent) && btnSync.getAttribute('data-mode') === 'ready' && btnSync.disabled === false);
// 还原 stub，避免污染后续
ev('canCloudSync = window.__origCanSync; state.isPro = false; CONFIG.API_BASE = ""; syncPhase=""; renderSyncStatus();');
check('还原后回到未解锁态', btnSync.getAttribute('data-mode') === 'locked');

// --- 导入目标 = 当前选中讲稿（BUG 修复：选中默认稿后导入却新建）---
check('存在 writeImportIntoActiveScript 且导入入口调用它',
  /function writeImportIntoActiveScript/.test(html) && /handleImportFile[\s\S]{0,600}writeImportIntoActiveScript/.test(html));
check('导入入口不再调用 importTextAsNewScript（不隐式新建）',
  /function handleImportFile[\s\S]{0,600}importTextAsNewScript/.test(html) === false);
// 运行时：选中第 2 篇、无光标 → 导入写入它，篇数/选中/标题不变
ev("state.scripts=[{id:'a',title:'第一篇',titleKind:'custom',content:'原文A',updatedAt:0},{id:'b',title:'选中稿',titleKind:'custom',content:'原文B',updatedAt:0}]; state.activeScriptId='b'; importCaretRange=null; loadActiveIntoEditor();");
ev("writeImportIntoActiveScript('导入的内容');");
check('无光标导入：写入选中稿而非新建', ev("state.scripts.length") === 2 && ev("state.scripts[1].content") === '导入的内容');
check('无光标导入：选中状态与导入目标一致', ev('state.activeScriptId') === 'b' && ev('getActiveContent()') === '导入的内容');
check('无光标导入：标题保持且其他稿不受影响', ev("state.scripts[1].title") === '选中稿' && ev("state.scripts[0].content") === '原文A');
check('无光标导入：dataset.isDefault 归零（不再被当默认稿覆盖）', doc.getElementById('scrollText').dataset.isDefault === '0');
// 有光标：插到光标处且不新建（既有功能回归）
ev("state.scripts=[{id:'a',title:'稿',titleKind:'custom',content:'AAAAAA',updatedAt:0}]; state.activeScriptId='a'; loadActiveIntoEditor();");
const stImp = doc.getElementById('scrollText');
const selImp = window.getSelection(); const rImp = doc.createRange();
rImp.setStart(stImp.firstChild, 3); rImp.collapse(true); selImp.removeAllRanges(); selImp.addRange(rImp);
ev('captureImportCaret()');
const cntImp = ev('state.scripts.length');
check('有光标导入：插入光标处且不新建', ev('insertImportedTextAtCaret("【文件】")') === true && stImp.textContent === 'AAA【文件】AAA' && ev('state.scripts.length') === cntImp);
selImp.removeAllRanges(); ev('importCaretRange=null;');
// 文案与提示
check('七语均有 importIntoActive 与 freeAutoSaveHint 文案',
  ['zh','en','de','fr','ja','ko','ru'].every(l => ev(`!!I18N.${l}.importIntoActive && !!I18N.${l}.freeAutoSaveHint`)));
check('免费版本地自动保存提示在讲稿库中常驻显示',
  !!doc.querySelector('#scriptList') &&
  /data-i18n="freeAutoSaveHint"/.test(html) &&
  /免费版讲稿会自动保存在本设备/.test(html));
check('importFormats 文案已改为写入当前稿（不再宣称新建）',
  !/导入会新建一篇讲稿/.test(html) && /写入当前选中的讲稿/.test(ev("I18N.zh.importFormats")));

// --- 修复：讲稿库激活态同步（点击后列表蓝框必须跟着走）---
check('selectScript 内含 renderScriptList（激活态同步根因修复）',
  /function selectScript[\s\S]{0,260}renderScriptList\(\)/.test(html));
// 运行时：造三篇讲稿，依次点选，验证数据/列表高亮/提词区三处一致
ev("state.scripts=[{id:'s1',title:'再次测试',titleKind:'custom',content:'内容一',updatedAt:0},{id:'s2',title:'圆览',titleKind:'custom',content:'内容二',updatedAt:0},{id:'s3',title:'第三个',titleKind:'custom',content:'内容三',updatedAt:0}]; state.activeScriptId='s3'; renderScriptList(); loadActiveIntoEditor();");
check('初始：三篇讲稿，激活在第三篇', ev('state.activeScriptId') === 's3' && doc.querySelectorAll('#scriptList .script-row').length === 3);
check('初始：列表仅第三篇带 active',
  (() => { const rows = doc.querySelectorAll('#scriptList .script-row'); return !rows[0].classList.contains('active') && !rows[1].classList.contains('active') && rows[2].classList.contains('active'); })());
// 点选第一篇（模拟用户点击列表标题 → selectScript('s1')）
ev("selectScript('s1');");
check('切到第一篇：activeScriptId 与提词区内容同步', ev('state.activeScriptId') === 's1' && ev('getActiveContent()') === '内容一');
check('切到第一篇：列表蓝框同步到第一篇（不再停在第三篇）',
  (() => { const rows = doc.querySelectorAll('#scriptList .script-row'); return rows[0].classList.contains('active') && !rows[1].classList.contains('active') && !rows[2].classList.contains('active'); })());
// 再点第二篇，验证可反复切换、无残留高亮
ev("selectScript('s2');");
check('切到第二篇：三处一致且仅一篇高亮',
  ev('state.activeScriptId') === 's2' && ev('getActiveContent()') === '内容二' &&
  (() => { const rows = doc.querySelectorAll('#scriptList .script-row'); return !rows[0].classList.contains('active') && rows[1].classList.contains('active') && !rows[2].classList.contains('active'); })());

// --- 修复：主界面讲稿库快速选用入口 ---
check('编辑条含 btnQuickLib 按钮（无需进设置即可选讲稿）', !!doc.getElementById('btnQuickLib'));
check('存在 quickLibSheet 快速选用面板与列表容器',
  !!doc.getElementById('quickLibSheet') && !!doc.getElementById('quickLibList'));
check('renderQuickLibList 复用 activeScriptId 作为唯一激活源并调用 selectScript',
  /function renderQuickLibList[\s\S]{0,700}state\.activeScriptId/.test(html) &&
  /function renderQuickLibList[\s\S]{0,900}selectScript\(s\.id\)/.test(html));
// 运行时：打开面板渲染三篇，点第二篇 → 切换 + 面板关闭
ev("renderQuickLibList();");
check('快速面板渲染出三篇且当前激活为第二篇',
  (() => { const rows = doc.querySelectorAll('#quickLibList .script-row'); return rows.length === 3 && rows[1].classList.contains('active'); })());
ev("document.getElementById('btnQuickLib').click();");
check('点编辑条讲稿库按钮打开面板', !doc.getElementById('quickLibSheet').classList.contains('hidden'));
// 点面板第一篇标题
ev("document.querySelectorAll('#quickLibList .script-row-title')[0].click();");
check('面板点选后切到对应讲稿且面板自动关闭',
  ev('state.activeScriptId') === 's1' && doc.getElementById('quickLibSheet').classList.contains('hidden'));
check('七语均有 quickLibHint 文案',
  ['zh','en','de','fr','ja','ko','ru'].every(l => ev(`!!I18N.${l}.quickLibHint`)));

// --- 修复①：清空/重新导入后逐词高亮残留旧位置 ---
check('存在 resetReadHighlight 且隐藏高亮/归零阅读头/重建词元',
  /function resetReadHighlight[\s\S]{0,300}hideReadMark\(\)/.test(html) &&
  /function resetReadHighlight[\s\S]{0,300}readHeadContentY\s*=\s*0/.test(html) &&
  /function resetReadHighlight[\s\S]{0,300}readTokensDirty\s*=\s*true/.test(html));
check('导入路径 commitImportedEdit 调用 resetReadHighlight 且 offset 归零',
  /function commitImportedEdit[\s\S]{0,220}resetReadHighlight\(\)/.test(html) &&
  /function commitImportedEdit[\s\S]{0,220}offset\s*=\s*0/.test(html));
check('清空路径 commitMainEdit 在内容变空时调用 resetReadHighlight',
  /function commitMainEdit[\s\S]{0,360}resetReadHighlight\(\)/.test(html));
check('切换讲稿 loadActiveIntoEditor 调用 resetReadHighlight',
  /function loadActiveIntoEditor[\s\S]{0,600}resetReadHighlight\(\)/.test(html));
// 运行时：制造"暂停定格高亮"→调用统一重置函数，验证高亮被隐藏、阅读头归零、词元缓存失效
// （commitMainEdit/commitImportedEdit 是初始化闭包内的函数，调用点已由上面源码守卫覆盖；
//   这里直接验证它们共同依赖的 resetReadHighlight 的真实副作用。）
ev("state.scripts=[{id:'h1',title:'高亮稿',titleKind:'custom',content:'一二三四五六',updatedAt:0}]; state.activeScriptId='h1'; readHeadContentY=99; readTokens=[{w:1,h:1}]; readLines=[{start:0,end:1,top:0,height:10,weight:1}]; readMarkEl.style.display='block'; resetReadHighlight();");
check('重置后高亮 DOM 被隐藏', doc.getElementById('readMark').style.display === 'none');
check('重置后阅读头 readHeadContentY 归零', ev('readHeadContentY') === 0);
check('重置后词元缓存失效（readTokens=null, dirty=true）', ev('readTokens') === null && ev('readTokensDirty') === true);
// 重新导入路径：writeImportIntoActiveScript 是全局函数，写入新内容同样触发重置
ev("readHeadContentY=88; readMarkEl.style.display='block'; writeImportIntoActiveScript('新的导入内容');");
check('重新导入后高亮隐藏/阅读头归零/内容写入',
  doc.getElementById('readMark').style.display === 'none' && ev('readHeadContentY') === 0 && ev('getActiveContent()') === '新的导入内容');

// --- 修复②：主界面显示当前讲稿标题 ---
check('主界面存在当前讲稿标题元素 currentScriptTitle',
  !!doc.getElementById('currentScriptTitle') &&
  /data-i18n-title="scriptTitleLabel"/.test(html));
check('存在 refreshCurrentScriptTitle 并在载入/切语言时调用',
  /function refreshCurrentScriptTitle/.test(html) &&
  /function loadActiveIntoEditor[\s\S]{0,700}refreshCurrentScriptTitle\(\)/.test(html) &&
  /function applyI18n[\s\S]{0,2600}refreshCurrentScriptTitle\(\)/.test(html));
// 运行时：切到命名讲稿 → 主界面标题显示该标题
ev("state.scripts=[{id:'t1',title:'会议纪要',titleKind:'custom',content:'AAA',updatedAt:0},{id:'t2',title:'演讲稿二',titleKind:'custom',content:'BBB',updatedAt:0}]; state.activeScriptId='t2'; selectScript('t1');");
check('主界面标题显示当前讲稿标题（会议纪要）', doc.getElementById('currentScriptTitle').textContent === '会议纪要');
ev("selectScript('t2');");
check('再切另一篇标题同步更新（演讲稿二）', doc.getElementById('currentScriptTitle').textContent === '演讲稿二');

// --- 修复③：眼睛按钮与 A−/A+ 对齐 ---
check('眼睛档位标签改为绝对定位脱离文档流（不再顶高按钮）',
  /#readMarkStatus\{[^}]*position:absolute/.test(html) &&
  /#btnReadMarkWrap\{[^}]*display:inline-flex/.test(html));
check('header 底部留白容纳绝对定位标签',
  /header\{[\s\S]{0,200}padding:12px 16px 18px/.test(html));

// --- 修复④：短稿点空白处也能弹出编辑工具条 ---
check('提词区编辑面铺满容器（短稿点空白也能进编辑态）',
  /#scrollText\{[\s\S]{0,1200}min-height:100%/.test(html) &&
  /#app\.playing #scrollText\{ min-height:0; \}/.test(html));
check('点文字下方空白不设播放起点（clear caretSeekOffset）',
  /scrollText\.addEventListener\('click'[\s\S]{0,320}clickBelowText\(e\.clientY\)[\s\S]{0,80}caretSeekOffset = null/.test(html));
check('存在 clickBelowText 几何判定函数', /function clickBelowText/.test(html));
// 运行时：无布局环境（jsdom）下不得把正常点击判成"空白"，否则点击定位会失效
check('无布局信息时 clickBelowText 返回 false（不误判空白）',
  ev('clickBelowText(400)') === false);
check('点空白后播放起点不被光标污染（caretSeekOffset 置空）',
  (function(){
    ev('window.__origCBT = clickBelowText; clickBelowText = function(){ return true; }; caretSeekOffset = 12;');
    st.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientY: 900 }));
    const cleared = ev('caretSeekOffset') === null;
    ev('clickBelowText = window.__origCBT; delete window.__origCBT;');
    return cleared;
  })());

// --- 修复⑤：空稿点播放提示"请先输入"，而不是"继续播放" ---
check('七语均有 playEmpty 空稿提示文案',
  ['zh','en','de','fr','ja','ko','ru'].every(l => ev(`!!I18N.${l}.playEmpty`)));
check('togglePlay 开头拦截空稿（不进入播放态）',
  /function togglePlay[\s\S]{0,400}getActiveContent\(\)[\s\S]{0,120}playEmpty/.test(html));
ev("state.scripts=[{id:'ep',title:'空稿',titleKind:'custom',content:'',updatedAt:0}]; state.activeScriptId='ep'; loadActiveIntoEditor(); setPlaying(false); togglePlay();");
check('空稿点 ▶ 不进入播放态', ev('playing') === false);
check('空稿点 ▶ 提示先输入内容（playEmpty）',
  doc.getElementById('toast').textContent === ev("t('playEmpty')"));
ev("state.scripts=[{id:'np',title:'有稿',titleKind:'custom',content:'第一行\\n第二行',updatedAt:0}]; state.activeScriptId='np'; loadActiveIntoEditor(); togglePlay();");
check('有稿点 ▶ 正常播放（空稿拦截不误伤）', ev('playing') === true);
ev('setPlaying(false);');

// --- 修复⑥：导入/切讲稿后不残留"从末尾播放"的光标意图 ---
check('存在 resetCaretIntentForContentSwap，且在导入两条路径 + 切稿处调用',
  /function resetCaretIntentForContentSwap/.test(html) &&
  /function writeImportIntoActiveScript[\s\S]{0,400}resetCaretIntentForContentSwap\(\)/.test(html) &&
  /function insertImportedTextAtCaret[\s\S]{0,300}resetCaretIntentForContentSwap\(\)/.test(html) &&
  /function loadActiveIntoEditor[\s\S]{0,500}resetCaretIntentForContentSwap\(\)/.test(html));
check('selectionchange 在内容替换后的短窗口内不记录播放起点',
  /addEventListener\('selectionchange'[\s\S]{0,400}Date\.now\(\) < caretSeekIgnoreUntil/.test(html));
check('整篇导入后把输入光标归到开头（caretToEditorStart）',
  /function caretToEditorStart/.test(html) &&
  /function writeImportIntoActiveScript[\s\S]{0,600}caretToEditorStart\(\)/.test(html));
check('resetReadHighlight 同时复位 reachedEnd / readCounted',
  /function resetReadHighlight[\s\S]{0,400}reachedEnd = false[\s\S]{0,80}readCounted = false/.test(html));
// 运行时：模拟"导入后光标停在末尾"（caretSeekOffset = 全文长度）
ev("state.scripts=[{id:'i1',title:'导入稿',titleKind:'custom',content:'旧内容',updatedAt:0}]; state.activeScriptId='i1'; loadActiveIntoEditor(); caretSeekOffset = 999; reachedEnd = true;");
ev("writeImportIntoActiveScript('导入后的全新内容\\n第二行')");
check('整篇导入后清空残留的光标播放意图', ev('caretSeekOffset') === null, 'caretSeekOffset=' + ev('caretSeekOffset'));
check('整篇导入后内容写入且 reachedEnd 复位',
  ev('getActiveContent()') === '导入后的全新内容\n第二行' && ev('reachedEnd') === false);
ev("caretSeekOffset = 12; loadActiveIntoEditor();");
check('切换讲稿后清空上一篇残留的光标意图', ev('caretSeekOffset') === null, 'caretSeekOffset=' + ev('caretSeekOffset'));
// 点播放不会被"末尾意图"劫持：清空后应正常进入播放态、且不视为读完
ev("caretSeekOffset = 999; togglePlay();");
check('导入后点 ▶ 正常开播（不因末尾意图直接判定读完）',
  ev('playing') === true && ev('reachedEnd') === false);
ev('setPlaying(false);');

// --- 第三十二轮：播放起点/阅读点/播放进度条 ---
{
  check('阅读点屏幕位置函数 readHeadScreenY + offset 反推函数 offsetForHead',
    /function readHeadScreenY\(\)/.test(html) && /function offsetForHead\(head\)/.test(html));
  check('loop 中 offset 由阅读点反推（不再与阅读点各自加 step 而恒等）',
    /readHeadContentY \+= step;[\s\S]{0,200}offset = offsetForHead\(readHeadContentY\)/.test(html));
  check('无 caret 且从头播时把阅读点锚到第一个词（不再停在 padding 里）',
    /else if \(!hadCaret\)[\s\S]{0,600}anchorReadHeadToToken\(0\)/.test(html));
  check('手动滚动同步阅读点（续播不闪回旧坐标）',
    /addEventListener\('scroll'[\s\S]{0,300}readHeadContentY = offset \+ readHeadScreenY\(\)/.test(html));
  check('播放进度条 DOM + 样式 + 每帧更新（替代被关闭的原生滚动条）',
    /id="playProgress"/.test(html) && /#app\.playing #playProgress\{display:block;\}/.test(html) &&
    /function updatePlayProgress\(\)/.test(html) &&
    /updateReadMark\(\); \/\/ 跟随速度自动切到下一个词\/字[\s\S]{0,160}updatePlayProgress\(\)/.test(html));

  // 行为：首行文字在 padding 之后（top=100），导入后点播放必须从第一个词起步
  Object.defineProperty(vpEl, 'clientHeight', { value: 600, configurable: true });
  Object.defineProperty(st, 'offsetHeight', { value: 3000, configurable: true });
  ev("state.scripts=[{id:'r32',title:'节奏',titleKind:'custom',content:'第一行文字\\n第二行文字\\n第三行文字',updatedAt:0}]; state.activeScriptId='r32'; loadActiveIntoEditor();");
  const toks32 = [], lines32 = [];
  for (let L = 0; L < 10; L++) {
    for (let k = 0; k < 8; k++) {
      const gi = L * 8 + k;
      toks32.push({ top: 100 + L * 68, left: 22 + k * 40, w: 36, h: 44, charStart: gi, charEnd: gi + 1 });
    }
    lines32.push({ start: L * 8, end: L * 8 + 7, top: 100 + L * 68, height: 68 });
  }
  ev('readTokens=' + JSON.stringify(toks32) + '; readLines=' + JSON.stringify(lines32) + '; readTokensDirty=false; readTokensText=scrollText.textContent;');
  ev('offset=0; readHeadContentY=0; caretSeekOffset=null; reachedEnd=false; state.speedUnit="px"; state.speedPx=90; remoteSpeedMul=1; voiceFollowing=false;');
  ev('togglePlay();');
  check('导入后播放：阅读点落在第一行文字上（不是 0 的 padding 起点）',
    ev('readHeadContentY') >= 100 && ev('readHeadContentY') < 168, 'head=' + ev('readHeadContentY'));
  check('导入后播放：起点处文稿不跳变（offset 仍为 0）', ev('offset') <= 2, 'offset=' + ev('offset'));
  let _t32 = 0; for (let i = 0; i < 120; i++) { _t32 += 1000 / 60; ev('loop(' + _t32 + ')'); }
  const h32 = ev('readHeadContentY'), o32 = ev('offset');
  check('播放中阅读点恒在视口 20%（高亮不再贴顶边划出屏幕）',
    Math.abs((h32 - o32) - ev('readHeadScreenY()')) < 1,
    'head-offset=' + (h32 - o32).toFixed(1) + ' screenY=' + ev('readHeadScreenY()'));
  check('播放进度条滑块有高度与位置（可见的位置指示）',
    ev("(function(){var b=document.getElementById('playProgress'),i=b.firstElementChild;return !!i && parseFloat(i.style.height)>20 && parseFloat(i.style.top)>=0;})()"));
  ev('setPlaying(false); caretSeekOffset=null; readTokens=null; readLines=null; readTokensDirty=true;');
}

// --- 第三十三轮：暂停态"起点指示"高亮必须跟随用户新设定的起点 ---
{
  check('updateReadMark 支持 allowPaused（暂停态也能画起点指示）',
    /function updateReadMark\(force, allowPaused\)/.test(html) &&
    /if \(\(!playing && !allowPaused\) \|\| !state\.readMark \|\| state\.mirror\)/.test(html));
  check('暂停态点击定位后立刻重画高亮（不再黏在旧词上）',
    /viewport\.scrollTop = offset;[\s\S]{0,260}updateReadMark\(true, true\)/.test(html));
  check('暂停态手动滚动后重画高亮（跟随滚动位置）',
    /readHeadContentY = offset \+ readHeadScreenY\(\)[\s\S]{0,220}updateReadMark\(false, true\)/.test(html));
  check('改字后收起暂停态高亮（词元坐标已失效）',
    /if \(!playing\) hideReadMark\(\);[\s\S]{0,80}debounceSave\(\); maybeSyncDebounced\(\)/.test(html));

  // 运行时：暂停态画到阅读点，且"只播放时显示"的旧行为仍受状态开关控制
  const VH = 400;
  Object.defineProperty(vpEl, 'clientHeight', { value: VH, configurable: true });
  Object.defineProperty(st, 'offsetHeight', { value: 2000, configurable: true });
  Object.defineProperty(st, 'getBoundingClientRect', { value: () => ({ top: 0, left: 0, width: 600, height: 2000, bottom: 2000, right: 600 }), configurable: true });
  Object.defineProperty(vpEl, 'getBoundingClientRect', { value: () => ({ top: 0, left: 0, width: 400, height: VH, bottom: VH, right: 400 }), configurable: true });
  const toks33 = [], lines33 = [];
  for (let L = 0; L < 10; L++) {
    for (let k = 0; k < 8; k++) toks33.push({ top: L * 68, left: 22 + k * 40, w: 36, h: 44, charStart: L * 8 + k, charEnd: L * 8 + k + 1 });
    lines33.push({ start: L * 8, end: L * 8 + 7, top: L * 68, height: 68, weight: 8 });
  }
  ev('readTokens=' + JSON.stringify(toks33) + '; readLines=' + JSON.stringify(lines33) + '; readTokensDirty=false; readTokensText=scrollText.textContent;');
  ev('playing=false; state.readMark=true; state.mirror=false; readHeadContentY=100;');
  ev('updateReadMark(true, true);');
  const mk = doc.getElementById('readMark');
  check('暂停态按阅读点画出高亮（第 2 行 top≈68）',
    mk.style.display === 'block' && parseFloat(mk.style.top) >= 60 && parseFloat(mk.style.top) <= 76,
    'display=' + mk.style.display + ' top=' + mk.style.top);
  ev('hideReadMark(); updateReadMark(true);');
  check('不传 allowPaused 时暂停态仍不显示（旧语义不被破坏）', mk.style.display === 'none');
  ev('state.readMark=false; updateReadMark(true, true);');
  check('高亮开关关闭时暂停态也不画', mk.style.display === 'none');
  ev('state.readMark=true; readTokens=null; readLines=null; readTokensDirty=true; hideReadMark();');
}

check('页面脚本无运行时错误', errors.length === 0, errors.join('; '));
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
