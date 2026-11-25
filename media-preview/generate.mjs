/**
 * ScriptDeck Telegram Mini App — 官方媒体预览素材生成器
 *
 * 产出（全部取自真实 index.html 渲染，非示意图）：
 *   screens/<lang>/01-main.png        主界面：讲稿+字数徽标
 *   screens/<lang>/02-highlight.png   播放态：逐词黄块高亮+进度条
 *   screens/<lang>/03-library.png     讲稿库面板
 *   screens/<lang>/04-settings.png    设置面板
 *   screens/<lang>/05-card.png        成片卡弹层
 *   screens/<lang>/06-finish.png      完成卡弹层
 *   video/<lang>.mp4                  操作演示（H.264 / yuv420p / 无音轨 / 竖屏）
 *
 * 运行：node media-preview/generate.mjs
 * 依赖：playwright（项目已有） + output/tools/node_modules/ffmpeg-static（npm install --prefix output/tools ffmpeg-static）
 */
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(OUT, '..');
const PAGE_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const require = createRequire(import.meta.url);
const FFMPEG = require(path.join(ROOT, 'output/tools/node_modules/ffmpeg-static'));

// 七语示例稿：真实产品文案（自我认知工具定位，无预测/占卜表述）
const DEMOS = {
  en: {
    title: 'Keynote Rehearsal',
    text: "Good morning. Today I want to share one simple idea: focus is a skill, not a gift. When you trust your script, you can look up, breathe, and actually connect with your audience. ScriptDeck keeps your place and moves at your pace, so the words stay with you, not in your way. Let's begin."
  },
  zh: {
    title: '演讲稿示例',
    text: '大家早上好。今天我想分享一个简单的观点：专注是一种可以练习的能力，而不是天赋。当你信任自己的讲稿，就可以抬头、呼吸，真正和听众建立连接。ScriptDeck 会替你记住位置，按你的节奏前进，让文字帮你，而不是挡住你。我们开始吧。'
  },
  de: {
    title: 'Redeprobe',
    text: 'Guten Morgen. Heute möchte ich eine einfache Idee teilen: Konzentration ist eine Fähigkeit, kein Geschenk. Wenn du deinem Text vertraust, kannst du aufschauen, durchatmen und wirklich Kontakt zu deinem Publikum aufnehmen. ScriptDeck behält deine Position und folgt deinem Tempo.'
  },
  fr: {
    title: 'Répétition de discours',
    text: "Bonjour. Aujourd'hui, je veux partager une idée simple : la concentration est une compétence, pas un don. Quand vous faites confiance à votre texte, vous pouvez lever les yeux, respirer et vraiment entrer en contact avec votre public. ScriptDeck garde votre place et suit votre rythme."
  },
  ja: {
    title: 'スピーチ練習',
    text: 'おはようございます。今日はシンプルな考えを共有したいと思います。集中力は生まれつきの才能ではなく、練習できるスキルです。原稿を信じれば、顔を上げて呼吸をし、聴衆とつながることができます。ScriptDeck が位置を覚えて、あなたのペースで進みます。'
  },
  ko: {
    title: '연설 연습',
    text: '안녕하세요. 오늘은 간단한 아이디어를 나누고 싶습니다. 집중은 타고난 재능이 아니라 연습할 수 있는 기술입니다. 원고를 믿으면 고개를 들고 숨을 쉬며 청중과 진짜로 연결될 수 있습니다. ScriptDeck가 위치를 기억하고 당신의 속도로 따라갑니다.'
  },
  ru: {
    title: 'Репетиция речи',
    text: 'Доброе утро. Сегодня я хочу поделиться простой идеей: внимание — это навык, а не подарок. Когда вы доверяете своему тексту, можно поднять глаза, вдохнуть и по-настоящему соединиться с аудиторией. ScriptDeck запоминает вашу позицию и движется в вашем темпе.'
  }
};

const SHOT_LANGS = Object.keys(DEMOS);
const VIDEO_LANGS = ['en', 'zh'];
const DISPLAY_NAMES = { en: 'Alex', zh: '小明', de: 'Alex', fr: 'Alex', ja: 'アレックス', ko: '알렉스', ru: 'Алекс' };

async function boot(page) {
  await page.addInitScript(() => {
    window.__downloads = [];
    window.__shareCalls = [];
    window.__tgLinks = [];
    window.Telegram = {
      WebApp: {
        initData: 'preview-init-data',
        initDataUnsafe: { user: { first_name: 'Alex', last_name: '' }, start_param: '' },
        ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {},
        openTelegramLink(u) { window.__tgLinks.push(String(u)); },
        switchInlineQuery() {},
        showConfirm(_m, cb) { if (typeof cb === 'function') cb(true); }
      }
    };
  });
  await page.route('https://telegram.org/js/telegram-web-app.js', r => r.abort());
}

async function prepare(page, lang) {
  await page.goto(PAGE_URL);
  await page.waitForTimeout(120);
  const demo = DEMOS[lang];
  await page.evaluate(({ lang, demo, name }) => {
    setLang(lang);                        // 先切语言（applyI18n 会重写默认稿）
    state.finishCard = true;
    state.displayName = name;
    state.reads = 12;
    state.referralCode = 'preview';

    const s = activeScript();
    if (s) {
      s.id = 'demo-main';
      s.title = demo.title;
      s.titleKind = 'custom';
      s.content = demo.text;
    }
    state.activeScriptId = 'demo-main';
    scrollText.dataset.isDefault = '0';   // 防止后续语言刷新覆盖示例稿
    scrollText.textContent = demo.text;
    readTokensDirty = true;
    renderReadCharsBadge();
    renderScriptList();
    renderQuickLibList();

    // 两篇附加讲稿，让讲稿库演示更真实（免费上限 3 篇）
    const extras = [
      { id: 'demo-2', title: name + ' — 02', titleKind: 'custom', content: demo.text, updatedAt: Date.now(), cloudId: null },
      { id: 'demo-3', title: name + ' — 03', titleKind: 'custom', content: demo.text, updatedAt: Date.now(), cloudId: null }
    ];
    extras.forEach(x => { if (!state.scripts.some(y => y.id === x.id)) state.scripts.push(x); });
    renderScriptList();
    renderQuickLibList();
    refreshCurrentScriptTitle();
    const sti = document.getElementById('setScriptTitle');
    if (sti) sti.value = demo.title;
  }, { lang, demo, name: DISPLAY_NAMES[lang] });
  await page.waitForTimeout(150);
}

async function makeScreens(browser, lang) {
  const dir = path.join(OUT, 'screens', lang);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    locale: lang === 'zh' ? 'zh-CN' : lang
  });
  const page = await ctx.newPage();
  await boot(page);
  await prepare(page, lang);

  const clearToast = () => page.evaluate(() => {
    const el = document.getElementById('toast');
    if (el) { el.textContent = ''; el.classList.remove('show'); }
  });
  const shot = async (name) => {
    await clearToast();
    await page.screenshot({ path: path.join(dir, name) });
  };

  await shot('01-main.png');

  // 播放态：加快速度，保证 1 秒后黄块已经推进到正文中间
  await page.evaluate(() => {
    const sb = document.getElementById('speedBar');
    sb.value = '150';
    sb.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#btnPlay');
  await page.waitForTimeout(1100);
  await shot('02-highlight.png');
  await page.evaluate(() => { if (playing) togglePlay(); });

  await page.evaluate(() => document.getElementById('quickLibSheet').classList.remove('hidden'));
  await page.waitForTimeout(150);
  await shot('03-library.png');
  await page.evaluate(() => document.getElementById('quickLibSheet').classList.add('hidden'));

  await page.click('#btnSettings');
  await page.waitForTimeout(200);
  await shot('04-settings.png');
  await page.evaluate(() => document.getElementById('settingsSheet').classList.add('hidden'));

  await page.click('#btnCard');
  await page.waitForTimeout(350);
  await shot('05-card.png');
  await page.evaluate(() => document.getElementById('cardOverlay').classList.add('hidden'));

  await page.click('#btnSettings');
  await page.waitForTimeout(150);
  await page.click('#btnPreviewFinish');
  await page.waitForTimeout(350);
  await shot('06-finish.png');

  await ctx.close();
  console.log('screens', lang, fs.readdirSync(dir).length);
}

async function makeVideo(browser, lang) {
  const rawDir = path.join(OUT, 'video', '_raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: lang === 'zh' ? 'zh-CN' : lang,
    // 必须与 CSS viewport 一致：Playwright 录屏把视口内容按 CSS 像素放在左上角，
    // size 放大只会留下大片灰底（实测 780x1688 配 390x844 视口 = 3/4 画面是灰的）。
    recordVideo: { dir: rawDir, size: { width: 390, height: 844 } }
  });
  const page = await ctx.newPage();
  await boot(page);
  await prepare(page, lang);

  // 1) 主界面
  await page.waitForTimeout(900);
  // 2) 逐词高亮滚动（约 4 秒）
  await page.evaluate(() => {
    const sb = document.getElementById('speedBar');
    sb.value = '120';
    sb.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#btnPlay');
  await page.waitForTimeout(4000);
  await page.evaluate(() => { if (playing) togglePlay(); });
  // 3) 讲稿库
  await page.evaluate(() => document.getElementById('quickLibSheet').classList.remove('hidden'));
  await page.waitForTimeout(1100);
  await page.evaluate(() => document.getElementById('quickLibSheet').classList.add('hidden'));
  // 4) 完成卡
  await page.click('#btnSettings');
  await page.waitForTimeout(200);
  await page.click('#btnPreviewFinish');
  await page.evaluate(() => {
    const el = document.getElementById('toast');
    if (el) { el.textContent = ''; el.classList.remove('show'); }
  });
  await page.waitForTimeout(1600);

  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  const dest = path.join(OUT, 'video', lang + '.mp4');
  execFileSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', raw,
    '-an',                              // 无音轨：Telegram 预览媒体最稳
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-preset', 'medium', '-crf', '26',
    '-movflags', '+faststart',
    dest
  ]);
  fs.rmSync(raw, { force: true });
  console.log('video', lang, (fs.statSync(dest).size / 1024 / 1024).toFixed(2) + 'MB');
}

const browser = await chromium.launch({ headless: true });
try {
  if (!process.argv.includes('--video-only')) {
    for (const lang of SHOT_LANGS) await makeScreens(browser, lang);
  }
  for (const lang of VIDEO_LANGS) await makeVideo(browser, lang);
} finally {
  await browser.close();
}
console.log('DONE');
