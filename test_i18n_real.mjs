import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/'
});
const { window } = dom;
const doc = window.document;

await new Promise(r => setTimeout(r, 200));

const get = id => (doc.getElementById(id) || {}).textContent;
const q = sel => (doc.querySelector(sel) || {}).textContent;

function pick(lang) {
  const sel = doc.getElementById('langSelect');
  sel.value = lang;
  sel.dispatchEvent(new window.Event('change'));
}
function editScript(text) {
  const ta = doc.getElementById('setScript');
  ta.value = text;
  ta.dispatchEvent(new window.Event('input'));
}

// 初始（jsdom 默认 navigator.language=en-US -> 默认英文）。先强制切到中文。
pick('zh');
const zh = { subtitle: q('[data-i18n="appSubtitle"]'), speed: q('[data-i18n="speed"]'), scroll: get('scrollText'), isDefault: doc.getElementById('scrollText').dataset.isDefault };
pick('en');
const en = { subtitle: q('[data-i18n="appSubtitle"]'), speed: q('[data-i18n="speed"]'), scroll: get('scrollText') };
pick('ja');
const ja = { subtitle: q('[data-i18n="appSubtitle"]'), speed: q('[data-i18n="speed"]'), scroll: get('scrollText') };

// 用户自定义讲稿后，切换语言不应覆盖
editScript('这是用户自定义的中文讲稿，不应被语言切换覆盖');
pick('ko');
const custom = { scroll: get('scrollText'), subtitle: q('[data-i18n="appSubtitle"]') };

console.log('--- 切到中文 ---', zh);
console.log('--- 切到英文 ---', en);
console.log('--- 切到日文 ---', ja);
console.log('--- 自定义后切韩文 ---', custom);

const uiSwitchOK = en.subtitle === 'Teleprompter & Cue Cards' && en.speed === 'Speed' && ja.subtitle === 'プロンプター＆キューヶード';
const sampleFollowOK = zh.scroll.includes('在这里粘贴你的讲稿') && en.scroll.includes('Paste your script here') && ja.scroll.includes('ここに原稿を貼り付け');
const customKeptOK = custom.scroll === '这是用户自定义的中文讲稿，不应被语言切换覆盖' && custom.subtitle === '텔레프롬프터 & 큐 카드';

console.log('\n=== 结论 ===');
console.log('1) UI 控件文字随语言切换:', uiSwitchOK ? '✅' : '❌');
console.log('2) 默认示例稿随语言切换:', sampleFollowOK ? '✅' : '❌');
console.log('3) 用户自定义讲稿不被覆盖:', customKeptOK ? '✅' : '❌');
console.log('\n总体:', (uiSwitchOK && sampleFollowOK && customKeptOK) ? '✅ 全部通过' : '❌ 存在失败项');
