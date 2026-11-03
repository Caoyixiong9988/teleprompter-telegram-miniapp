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
console.log('--- 脚本运行错误 ---');
console.log(errors.length ? errors.join('\n') : '无');

const p1 = taEn.includes('Paste your script here') && taJa.includes('ここに原稿を貼り付け') && taCustom === '自定义中文讲稿-保留';
const p2 = closeByBackdrop && closeByEsc;
const p3 = adHidden;
const p4 = proOpened && priceM === '400' && priceY === '4000' && proTitleEn === 'Pro Membership' && proCloseByBackdrop;
const p0 = errors.length === 0;

console.log('\n=== 结论 ===');
console.log('0) 脚本无运行时错误:', p0 ? '✅' : '❌ ' + errors.join('; '));
console.log('1) 设置面板输入框随语言切换 & 自定义稿保留:', p1 ? '✅' : '❌');
console.log('2) 点遮罩/ESC 均可退出抽屉:', p2 ? '✅' : '❌');
console.log('3) 广告位默认隐藏:', p3 ? '✅' : '❌');
console.log('4) Pro 权益页(价格/多语/遮罩关闭):', p4 ? '✅' : '❌');
console.log('总体:', (p0 && p1 && p2 && p3 && p4) ? '✅ 全部通过' : '❌ 存在失败项');
process.exit(p0 && p1 && p2 && p3 && p4 ? 0 : 1);
