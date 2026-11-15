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

// --- 1. 布局：控制条不压缩、可换行、窄屏速度条另起一行 ---
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
check('controlBar flex-wrap + flex-shrink:0', /#controlBar\{[^}]*flex-wrap:wrap[^}]*flex-shrink:0/.test(css));
check('窄屏 media 把速度条移到第二行', /@media \(max-width:480px\)\{[\s\S]*?#speedWrap\{order:10; flex:1 1 100%;\}/.test(css));
check('controlBar 按钮不被 flex 压缩', /#controlBar > \.btn\{flex:0 0 auto;\}/.test(css));
check('底部安全区 padding', /calc\(10px \+ env\(safe-area-inset-bottom\)\)/.test(css));
check('六个控制按钮都在 DOM', ['btnPlay','btnReset','btnSettings','btnCard','btnRemote','btnVoice'].every(id => !!doc.getElementById(id)));

// --- 2. 五语新键 ---
const sizes = ['zh','en','ja','ko','ru'].map(l => ev(`Object.keys(I18N.${l}).length`));
check('五语各 185 键且一致', sizes.every(n => n === 185), JSON.stringify(sizes));
check('新增 4 键五语齐全', ev(`['zh','en','ja','ko','ru'].every(l=>['editPasteOk','editNoScroll','resetDone','voiceUnavailable'].every(k=>!!I18N[l][k]))`));

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

check('页面脚本无运行时错误', errors.length === 0, errors.join('; '));
console.log(`\n=== ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
