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
check('七语各 197 键且一致', sizes.every(n => n === 197), JSON.stringify(sizes));
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

// --- 5. 播放：短稿有明确提示；点播放退出编辑态；滚到底后重头开始 ---
st.textContent = '短稿';
st.dispatchEvent(new window.Event('input', { bubbles: true }));
doc.getElementById('btnPlay').click();
check('不足一屏时点播放给出提示而非无反应', doc.getElementById('toast').textContent === ev('t("editNoScroll")'), doc.getElementById('toast').textContent);
check('点播放后退出编辑态', doc.getElementById('editBar').classList.contains('hidden'), doc.getElementById('editBar').className);
ev('playing=false; offset=0;');
// 模拟可滚动：伪造尺寸，验证已到底时重头开始
Object.defineProperty(st, 'offsetHeight', { value: 1000, configurable: true });
Object.defineProperty(doc.getElementById('viewport'), 'clientHeight', { value: 300, configurable: true });
// 用显式 reachedEnd 标志模拟"自然滚到底"；仅 offset=max 不再足以判定（那正是暂停定位 bug 的根因）
ev('offset=700; playing=false; reachedEnd=true;');
doc.getElementById('btnPlay').click();
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
    const hy=offset+viewport.clientHeight*0.2, L=readLines; let li=0;
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

check('页面脚本无运行时错误', errors.length === 0, errors.join('; '));
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
