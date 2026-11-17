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

// --- 1. 布局：6 列网格 + 速度区独占整行，所有控件不重叠不遮挡 ---
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
check('controlBar 改为 6 列网格', /#controlBar\{[^}]*display:grid[^}]*grid-template-columns:repeat\(6/.test(css));
check('速度区独占整行（grid-column:1 / -1）', /#speedWrap\{[^}]*grid-column:1 \/ -1/.test(css));
check('像素数值强制单行且不压缩', /#speedBarLabel\{[^}]*white-space:nowrap[^}]*min-width:76px/.test(css));
check('按钮等宽、不再被 flex 压缩', /#controlBar > \.btn\{width:100%; min-width:0;/.test(css));
check('极窄屏降为 3 列仍可完整点按', /@media \(max-width:360px\)\{[\s\S]*?repeat\(3/.test(css));
check('速度区 DOM 排在 6 个按钮之后', [...doc.getElementById('controlBar').children].map(e => e.id).indexOf('speedWrap') === 6);
check('底部安全区 padding', /calc\(10px \+ env\(safe-area-inset-bottom\)\)/.test(css));
check('六个控制按钮都在 DOM', ['btnPlay','btnReset','btnSettings','btnCard','btnRemote','btnVoice'].every(id => !!doc.getElementById(id)));

// --- 2. 七语新键（含新增 de / fr）---
const LANGS = ['zh','en','de','fr','ja','ko','ru'];
const sizes = LANGS.map(l => ev(`Object.keys(I18N.${l}).length`));
check('七语各 219 键且一致', sizes.every(n => n === 219), JSON.stringify(sizes));
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
ev('offset=0; setPlaying(true); lastTs=0;');
let _t = 0; for (let i = 0; i < 60; i++) { _t += 1000/60; ev('loop(' + _t + ')'); }
check('推进 1 秒位移恰好 20px（20px/s 真实生效）', Math.abs(ev('offset') - 20) < 0.001, 'offset=' + ev('offset'));
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

  // 匀速：推进 1 秒，锚点与 offset 必须同步 += 速度
  ev('state.speedUnit="px"; state.speedPx=90; remoteSpeedMul=1; voiceFollowing=false;');
  ev('offset=200; readHeadContentY=230; setPlaying(true); lastTs=0;');
  inject();
  const a0 = ev('readHeadContentY'), o0 = ev('offset');
  let _t17 = 0; for (let i=0;i<60;i++){ _t17 += 1000/60; ev('loop(' + _t17 + ')'); }
  const a1 = ev('readHeadContentY'), o1 = ev('offset');
  check('播放中锚点与文稿同步前进（匀速保持）', Math.abs((o1-o0)-(a1-a0)) < 0.01,
    'offsetΔ=' + (o1-o0).toFixed(1) + ' anchorΔ=' + (a1-a0).toFixed(1));
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
  check('文稿位移钳在 max 不露底部空白', /offset = Math\.min\(offset \+ step, max\)/.test(html));

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
  check('loop 使用空白带快进步长（offset 与锚点共用同一 step）',
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

check('页面脚本无运行时错误', errors.length === 0, errors.join('; '));
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
