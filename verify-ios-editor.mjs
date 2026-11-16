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
check('七语各 194 键且一致', sizes.every(n => n === 194), JSON.stringify(sizes));
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
ev('offset=700; playing=false;');
doc.getElementById('btnPlay').click();
check('已滚到底时再点播放会回到开头', ev('offset') === 0 && ev('playing') === true, 'offset=' + ev('offset') + ' playing=' + ev('playing'));
ev('playing=false;');

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

check('页面脚本无运行时错误', errors.length === 0, errors.join('; '));
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
