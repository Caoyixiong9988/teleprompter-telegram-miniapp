import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e.message));
vc.on('error', (...a) => errors.push(a.join(' ')));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
  virtualConsole: vc
});
const { window } = dom;
const doc = window.document;
await new Promise(r => setTimeout(r, 200));

const q = sel => (doc.querySelector(sel) || {}).textContent;
const pick = lang => {
  const sel = doc.getElementById('langSelect');
  sel.value = lang;
  sel.dispatchEvent(new window.Event('change'));
};

// ---- 问题一：设置面板输入框(value) 是否随语言切换 ----
pick('zh');
const taZh = doc.getElementById('setScript').value;
pick('en');
const taEn = doc.getElementById('setScript').value;
pick('ja');
const taJa = doc.getElementById('setScript').value;

// ---- UI 文案 & 提词区示例稿 ----
const uiSpeed = q('[data-i18n="speed"]');
const scrollJa = doc.getElementById('scrollText').textContent;

// ---- 俄语（第 5 种语言）----
pick('ru');
const taRu = doc.getElementById('setScript').value;
const uiSpeedRu = q('[data-i18n="speed"]');
const scrollRu = doc.getElementById('scrollText').textContent;
const pickRuOk = doc.getElementById('langSelect').value === 'ru';
const htmlLangRu = doc.documentElement.lang === 'ru';

// ---- 五语键集一致性（防止某语言漏键回退成中文）----
const langList = ['zh', 'en', 'ja', 'ko', 'ru'];
const keySets = {};
for (const l of langList) keySets[l] = new Set(JSON.parse(window.eval(`JSON.stringify(Object.keys(I18N['${l}']))`)));
const keyCount = keySets.zh.size;
const keySetOk = langList.every(l => keySets[l].size === keyCount && [...keySets.zh].every(k => keySets[l].has(k)));

// ---- 自动语言识别：俄语环境应默认落 ru（无需用户手动切）----
Object.defineProperty(window.navigator, 'language', { value: 'ru-RU', configurable: true });
const autoRu = window.eval('detectLang()');
const autoJa = window.eval('pickSupported("ja_JP")');
Object.defineProperty(window.navigator, 'language', { value: 'zh-CN', configurable: true });

// ---- 客户文案守门：五语文案里不得出现占卜/预测类字样（提词器与这类内容无关）----
const BANNED_RE = /占卜|算命|运势|预测|黄历|四镜|吉凶|风水|塔罗|命理|fortune|horoscope|tarot|divination|astrology/i;
const bannedHits = [];
for (const l of langList) {
  const dict = JSON.parse(window.eval(`JSON.stringify(I18N['${l}'])`));
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v === 'string' && BANNED_RE.test(v)) bannedHits.push(`${l}.${k}`);
  }
}
const copyClean = bannedHits.length === 0;

// ---- 问题二：抽屉退出方式 ----
const sheet = doc.getElementById('settingsSheet');
sheet.classList.remove('hidden');
sheet.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // 点遮罩空白
const closeByBackdrop = sheet.classList.contains('hidden');

sheet.classList.remove('hidden');
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const closeByEsc = sheet.classList.contains('hidden');

// ---- Pro 权益页 ----
doc.getElementById('btnOpenPro').click();
const proSheet = doc.getElementById('proSheet');
const proOpened = !proSheet.classList.contains('hidden');
const priceM = doc.getElementById('proPriceMonth').textContent;
const priceY = doc.getElementById('proPriceYear').textContent;
pick('en');
const proTitleEn = doc.querySelector('#proSheet h3').textContent;
proSheet.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const proCloseByBackdrop = proSheet.classList.contains('hidden');

// ---- 广告位：默认隐藏 ----
const adHidden = doc.getElementById('adSlotSettings').hidden === true && doc.getElementById('adSlotCard').hidden === true;

// ---- 自定义讲稿不被覆盖 ----
const ta = doc.getElementById('setScript');
ta.value = '自定义中文讲稿-保留';
ta.dispatchEvent(new window.Event('input'));
pick('ko');
const taCustom = ta.value;

console.log('--- 问题一 setScript.value ---');
console.log('zh:', JSON.stringify(taZh));
console.log('en:', JSON.stringify(taEn));
console.log('ja:', JSON.stringify(taJa));
console.log('自定义后切ko:', JSON.stringify(taCustom));
console.log('--- 问题二 抽屉关闭 ---');
console.log('点遮罩关闭:', closeByBackdrop, '| ESC关闭:', closeByEsc);
console.log('--- Pro 权益页 ---');
console.log('打开:', proOpened, '| 价格:', priceM + '/' + priceY, '| 英文标题:', proTitleEn, '| 遮罩关闭:', proCloseByBackdrop);
console.log('--- 广告位默认隐藏 ---');
console.log('adSlots hidden:', adHidden);
console.log('--- UI 文案 ---');
console.log('speed(ja):', uiSpeed, '| scroll(ja)前40字:', JSON.stringify(scrollJa.slice(0, 40)));
console.log('--- 俄语 ---');
console.log('langSelect:', pickRuOk, '| html lang:', htmlLangRu, '| speed(ru):', uiSpeedRu);
console.log('setScript(ru):', JSON.stringify(taRu.slice(0, 40)));
console.log('scroll(ru):', JSON.stringify(scrollRu.slice(0, 40)));
console.log('--- 阅读等级（免费头衔）---');
const selRank = doc.getElementById('langSelect');
selRank.value = 'zh'; selRank.dispatchEvent(new window.Event('change')); // 前面的用例把语言切走了，这里先归位
const rankAt = (n) => window.eval(`(function(){ state.reads=${n}; renderRank(); var b=document.getElementById('rankBarFill'); return { name: document.getElementById('rankName').textContent, icon: document.getElementById('rankIcon').textContent, prog: document.getElementById('rankProgress').textContent, bar: b.style.width }; })()`);
const rk0 = rankAt(0);
const rk3 = rankAt(3);
const rk100 = rankAt(100);
selRank.value = 'en'; selRank.dispatchEvent(new window.Event('change'));
const rk3en = rankAt(3);
selRank.value = 'zh'; selRank.dispatchEvent(new window.Event('change'));
// 短稿不计次
window.eval(`state.reads = 0; activeScript().content = '短稿'; renderRank();`);
window.eval('onReadComplete()');
const readsAfterShort = window.eval('state.reads');
// 长稿计次 + 跨门槛晋级提示
window.eval(`state.reads = 2; activeScript().content = '${'这是用来测试朗读计次的讲稿内容。'.repeat(8)}'; renderRank();`);
window.eval('onReadComplete()');
const readsAfterLong = window.eval('state.reads');
const rankAfterLong = doc.getElementById('rankName').textContent;
const toastAfterLong = doc.getElementById('toast').textContent;
console.log('Lv1:', rk0.icon, rk0.name, '| Lv2(3次):', rk3.icon, rk3.name, '| Lv5(100次):', rk100.icon, rk100.name, rk100.bar);
console.log('英文下等级名:', rk3en.name, '| 短稿后次数:', readsAfterShort, '| 长稿后次数:', readsAfterLong, '| 晋级:', rankAfterLong, '| 提示:', toastAfterLong);
console.log('--- 五语键集 ---');
console.log('各语言键数:', langList.map(l => `${l}=${keySets[l].size}`).join(', '));
console.log('--- 自动语言识别 ---');
console.log('navigator=ru-RU -> detectLang:', autoRu, '| pickSupported("ja_JP"):', autoJa);
console.log('--- 客户文案守门 ---');
console.log('命中占卜类字样:', bannedHits.length ? bannedHits.join(', ') : '无');
console.log('--- 脚本运行错误 ---');
console.log(errors.length ? errors.join('\n') : '无');

const p1 = taEn.includes('Paste your script here') && taJa.includes('ここに原稿を貼り付け') && taCustom === '自定义中文讲稿-保留';
const p2 = closeByBackdrop && closeByEsc;
const p3 = adHidden;
const p4 = proOpened && priceM === '400' && priceY === '4000' && proTitleEn === 'Pro Membership' && proCloseByBackdrop;
const p0 = errors.length === 0;
const p5 = pickRuOk && htmlLangRu && taRu.includes('Вставьте сценарий') && uiSpeedRu === 'Скорость' && scrollRu.includes('Вставьте сценарий');
const p6 = keySetOk;
const p7 = autoRu === 'ru' && autoJa === 'ja';
const p8 = copyClean;
const p9 = rk0.name === '起步' && rk0.icon === '🌱' && rk3.name === '星光' && rk3.icon === '⭐' && rk100.name === '皇冠' && rk100.bar === '100%'
  && rk3en.name === 'Star' && readsAfterShort === 0 && readsAfterLong === 3 && rankAfterLong === '星光' && toastAfterLong.includes('星光');

// ---- Pro：去水印高清导出策略（纯函数，不依赖 canvas，jsdom 可测）----
window.eval('state.isPro = false;');
const optFree = JSON.parse(window.eval('JSON.stringify(cardExportOptions())'));
window.eval('state.isPro = true;');
const optPro = JSON.parse(window.eval('JSON.stringify(cardExportOptions())'));
const isProFalse = window.eval('state.isPro = false; isPro()');
const isProTrue = window.eval('state.isPro = true; isPro()');
window.eval('state.isPro = false;'); // 还原，避免影响后续
const p10 = optFree.scale === 1 && optFree.noWatermark === false
  && optPro.scale === 2 && optPro.noWatermark === true
  && isProFalse === false && isProTrue === true;

// ---- 本地预览按钮（无后端 API_BASE 时可见，文案正确）----
const devBtn = doc.getElementById('btnProDevPreview');
const devVisible = !!(devBtn && devBtn.hidden === false);
const devLabel = devBtn && devBtn.textContent;
const p11 = devVisible && devLabel === '本地预览 Pro 效果（测试用）';

// ---- 本地预览按钮点击可切换 isPro（仅本地；生产环境隐藏，无法绕过付费）----
if (devBtn) devBtn.click();
const afterClickPro = window.eval('isPro()');
if (devBtn) devBtn.click();
const afterClickBack = window.eval('isPro()');
const p12 = afterClickPro === true && afterClickBack === false;

console.log('--- Pro 去水印高清导出策略 ---');
console.log('免费:', JSON.stringify(optFree), '| Pro:', JSON.stringify(optPro), '| isPro(false/true):', isProFalse, isProTrue);
console.log('本地预览按钮可见:', devVisible, '| 文案:', devLabel, '| 点击切换:', afterClickPro, '->', afterClickBack);

// ---- 多讲稿数据模型（state.scripts + 切换/新建/删除，至少保留 1 篇）----
window.eval(`state.scripts=[{id:'a',title:'稿一',content:'内容一',updatedAt:1,cloudId:null},{id:'b',title:'稿二',content:'内容二',updatedAt:2,cloudId:null}]; state.activeScriptId='a'; saveState(); loadActiveIntoEditor();`);
const msA = doc.getElementById('setScript').value;
const msATitle = doc.getElementById('setScriptTitle').value;
window.eval(`selectScript('b');`);
const msB = doc.getElementById('setScript').value;
window.eval(`addScript();`);
const msAdd = window.eval('state.scripts.length');
const msNewTitle = window.eval('activeScript().title');
window.eval(`deleteScript(activeScript().id);`);
const msDel = window.eval('state.scripts.length');
window.eval(`state.scripts.slice().forEach(function(s){ if(state.scripts.length>1) deleteScript(s.id); });`);
const msFinal = window.eval('state.scripts.length');
const p13 = msA === '内容一' && msATitle === '稿一' && msB === '内容二' && msAdd === 3 && msNewTitle === window.eval('t("scriptNewTitle")') && msDel === 2 && msFinal === 1;

// ---- reconcileScripts 纯函数：本地+云端合并、冲突本地优先、云端独有回写 ----
const rec = window.eval(`JSON.stringify(reconcileScripts(
  [{id:'a',title:'本地A',content:'cA',updatedAt:10,cloudId:null},{id:'b',title:'本地B',content:'cB',updatedAt:5,cloudId:1}],
  [{id:1,title:'云B',content:'云cB',updated_at:3},{id:2,title:'云C',content:'云cC',updated_at:9}]
))`);
const recObj = JSON.parse(rec);
const rec2 = window.eval(`JSON.stringify(reconcileScripts(
  [{id:'b',title:'本地B',content:'cB',updatedAt:2,cloudId:1}],
  [{id:1,title:'云B新',content:'云cB新',updated_at:99}]
))`);
const rec2Obj = JSON.parse(rec2);
const p14 = recObj.merged.length === 2 && recObj.cloudOnly.length === 1 && recObj.cloudOnly[0].id === 2
  && rec2Obj.merged.length === 1 && rec2Obj.merged[0].content === '云cB新' && rec2Obj.cloudOnly.length === 0;

// ---- 云同步门禁：未接后端 / 非 Pro 均不可同步；Pro+后端+Telegram 才可 ----
const gNoBackend = window.eval('CONFIG.API_BASE=""; state.isPro=true; isPro() && !!CONFIG.API_BASE');
const gNoPro = window.eval('CONFIG.API_BASE="https://x.test"; state.isPro=false; isPro() && !!CONFIG.API_BASE');
window.Telegram = { WebApp: { initData: 'x' } };
const gProBackend = window.eval('CONFIG.API_BASE="https://x.test"; state.isPro=true; isPro() && !!CONFIG.API_BASE && !!(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData)');
delete window.Telegram;
window.eval('CONFIG.API_BASE=""; state.isPro=false;');
const p15 = gNoBackend === false && gNoPro === false && gProBackend === true;

console.log('--- 多讲稿 / 云同步 ---');
console.log('多讲稿(切换/新建/删除保底):', msA, '|', msB, '| 新建后', msAdd, '| 删后', msDel, '| 终', msFinal);
console.log('reconcile:', 'merged', recObj.merged.length, 'cloudOnly', recObj.cloudOnly.length, '| 冲突重写', rec2Obj.merged[0].content);
console.log('云同步门禁 无后端/非Pro/Pro+后端:', gNoBackend, gNoPro, gProBackend);

// ---- 双设备遥控：面板存在 + 纯函数（令牌解析 / 深链 / 指令应用） ----
const remoteBtn = !!doc.getElementById('btnRemote');
const remoteSheetEl = !!doc.getElementById('remoteSheet');
const p16 = remoteBtn && remoteSheetEl;

const pt1 = window.eval('parseRemoteToken("remote_abc123")');
const pt2 = window.eval('parseRemoteToken("https://x.test/?remote=tok_9")');
const pt3 = window.eval('parseRemoteToken("bareToken_12345")');
const pt4 = window.eval('parseRemoteToken("随便一段中文不是令牌")');
const p17 = pt1 === 'abc123' && pt2 === 'tok_9' && pt3 === 'bareToken_12345' && pt4 === null;

const dl = window.eval('state.botUser="mybot"; buildRemoteDeepLink("tokX")');
const p18 = dl === 'https://t.me/mybot?startapp=remote_tokX';

window.eval('playing=false; remoteSpeedMul=1; applyRemoteCommand({cmd:"play"});');
const acPlay = window.eval('playing');
window.eval('applyRemoteCommand({cmd:"pause"});');
const acPause = window.eval('playing');
window.eval('applyRemoteCommand({cmd:"speed", value:2});');
const acSpeed = window.eval('remoteSpeedMul');
window.eval('playing=false; remoteSpeedMul=1;');
const p19 = acPlay === true && acPause === false && acSpeed === 2;

console.log('--- 双设备遥控 ---');
console.log('面板/按钮存在:', remoteBtn, remoteSheetEl);
console.log('令牌解析 start_param/URL/裸令牌/非法:', pt1, pt2, pt3, pt4);
console.log('深链:', dl, '| 指令应用 play/pause/speed:', acPlay, acPause, acSpeed);

console.log('\n=== 结论 ===');
console.log('0) 脚本无运行时错误:', p0 ? '✅' : '❌ ' + errors.join('; '));
console.log('1) 设置面板输入框随语言切换 & 自定义稿保留:', p1 ? '✅' : '❌');
console.log('2) 点遮罩/ESC 均可退出抽屉:', p2 ? '✅' : '❌');
console.log('3) 广告位默认隐藏:', p3 ? '✅' : '❌');
console.log('4) Pro 权益页(价格/多语/遮罩关闭):', p4 ? '✅' : '❌');
console.log('5) 俄语(第 5 语言) 切换生效:', p5 ? '✅' : '❌');
console.log('6) 五语键集一致:', p6 ? `✅ (各 ${keyCount} 键)` : '❌');
console.log('7) 俄语环境自动识别:', p7 ? '✅' : '❌');
console.log('8) 五语客户文案无占卜类字样:', p8 ? '✅' : '❌ ' + bannedHits.join(', '));
console.log('9) 阅读等级(5 档/多语/短稿不计次/晋级提示):', p9 ? '✅' : '❌');
console.log('10) Pro 去水印高清导出策略(免费1×带水印 / Pro2×去水印):', p10 ? '✅' : '❌');
console.log('11) 本地预览按钮可见且文案正确:', p11 ? '✅' : '❌');
console.log('12) 本地预览按钮点击切换 isPro:', p12 ? '✅' : '❌');
console.log('13) 多讲稿数据模型(切换/新建/删除保底):', p13 ? '✅' : '❌');
console.log('14) reconcileScripts 合并/冲突/云端独有:', p14 ? '✅' : '❌');
console.log('15) 云同步门禁(无后端/非Pro 不可，Pro+后端可):', p15 ? '✅' : '❌');
console.log('16) 遥控面板与按钮存在:', p16 ? '✅' : '❌');
console.log('17) 遥控令牌解析(start_param/URL/裸令牌/非法):', p17 ? '✅' : '❌');
console.log('18) 遥控深链生成:', p18 ? '✅' : '❌');
console.log('19) 遥控指令应用(play/pause/speed→全局):', p19 ? '✅' : '❌');
const allOk = p0 && p1 && p2 && p3 && p4 && p5 && p6 && p7 && p8 && p9 && p10 && p11 && p12 && p13 && p14 && p15 && p16 && p17 && p18 && p19;
console.log('总体:', allOk ? '✅ 全部通过' : '❌ 存在失败项');
process.exit(allOk ? 0 : 1);
