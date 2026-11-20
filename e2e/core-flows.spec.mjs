import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PAGE_URL = pathToFileURL(path.resolve('index.html')).href;

/** B 层：核心业务流程的最小可控环境。
 *  与 A 层同款 Telegram / Share / 下载替身；B 层不需要 canvas 与语音替身。 */
async function boot(page, opts = {}) {
  await page.addInitScript((o) => {
    window.__downloads = [];
    window.__shareCalls = [];
    window.__tgLinks = [];

    window.Telegram = {
      WebApp: {
        initData: o.initData ?? 'test-init-data',
        initDataUnsafe: {
          user: { first_name: 'Tester', last_name: '' },
          start_param: o.startParam ?? '',
        },
        ready() {},
        expand() {},
        setHeaderColor() {},
        setBackgroundColor() {},
        openTelegramLink(u) { window.__tgLinks.push(String(u)); },
        switchInlineQuery() {},
        showConfirm(_msg, cb) { if (typeof cb === 'function') cb(true); },
      },
    };

    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__downloads.push({ download: this.download, href: String(this.href).slice(0, 40) });
        return;
      }
      return origClick.apply(this, arguments);
    };

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async function (data) { window.__shareCalls.push(data); },
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: function () { return true; },
    });
  }, opts);
  // 阻断外部 Telegram SDK（详见 a-layer.spec.mjs 的 boot 注释）：CI 有外网时
  // 真实 SDK 会覆盖注入的替身，导致验签/遥控等依赖 initData 的用例误报。
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.abort());
  await page.goto(PAGE_URL);
}

const txt = (page, key) => page.evaluate((k) => t(k), key);

/* ================= B1. 空稿播放 ================= */

test('B1 空稿播放：不进入播放态，给出明确提示，字数徽标处于低状态', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    setActiveContent('');
    scrollText.textContent = '';
    readTokensDirty = true;
    renderReadCharsBadge();
  });

  await page.click('#btnPlay');

  const r = await page.evaluate(() => ({
    playing,
    toast: document.getElementById('toast').textContent,
    want: t('playEmpty'),
    badge: document.getElementById('readCharsBadge').dataset.state,
  }));
  expect(r.playing, '空稿不应进入播放态').toBe(false);
  expect(r.toast, '应提示去输入/粘贴/导入').toBe(r.want);
  expect(r.badge, '字数徽标应显示未达门槛').toBe('low');
});

/* ================= B2. 有效读完门槛 ================= */

test('B2 有效读完门槛：39字不计次、达到门槛计一次，徽标与计次同口径', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    state.finishCard = false; // 避免 250ms 后弹完成卡干扰本用例
    state.reads = 0;

    setActiveContent('短'.repeat(39));
    renderReadCharsBadge();
    onReadComplete();
    const short = {
      reads: state.reads,
      badge: document.getElementById('readCharsBadge').dataset.state,
      toastOk: document.getElementById('toast').textContent ===
        fmt(t('readTooShort'), { n: 39, m: MIN_CHARS_FOR_READ }),
    };

    setActiveContent('长'.repeat(MIN_CHARS_FOR_READ));
    renderReadCharsBadge();
    onReadComplete();
    const long = {
      reads: state.reads,
      badge: document.getElementById('readCharsBadge').dataset.state,
    };
    return { min: MIN_CHARS_FOR_READ, short, long };
  });

  expect(r.min, '门槛应为 40 字').toBe(40);
  expect(r.short.reads, '39 字不应计次').toBe(0);
  expect(r.short.badge, '39 字徽标应为 low').toBe('low');
  expect(r.short.toastOk, '39 字应给出补足 N 字的提示').toBe(true);
  expect(r.long.reads, '达到门槛应计一次').toBe(1);
  expect(r.long.badge, '达标徽标应为 ok').toBe('ok');
});

/* ================= B3. 七语 UI ================= */

test('B3 七语切换：文案/html lang/localStorage 同步，刷新后保持，用户标题不被翻译', async ({ page }) => {
  await boot(page);

  await page.selectOption('#langSelect', 'en');
  const en = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    title: document.getElementById('currentScriptTitle').textContent,
    wantTitle: t('scriptDefaultTitle'),
    playTitle: document.getElementById('btnPlay').title,
    wantPlay: t('playPause'),
    stored: localStorage.getItem('tp_lang'),
  }));
  expect(en.lang).toBe('en');
  expect(en.stored).toBe('en');
  expect(en.title).toBe(en.wantTitle);
  expect(en.playTitle).toBe(en.wantPlay);

  // 走真实用户输入路径：输入框的 input 事件会把 titleKind 标成 custom，
  // 后续切语言才不会把用户标题当系统标题翻译。
  await page.click('#btnSettings');
  await page.fill('#setScriptTitle', '我的自定义稿');
  await page.click('#btnCloseSettings');
  await page.selectOption('#langSelect', 'ja');
  const ja = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    title: document.getElementById('currentScriptTitle').textContent,
    stored: localStorage.getItem('tp_lang'),
  }));
  expect(ja.lang).toBe('ja');
  expect(ja.stored).toBe('ja');
  expect(ja.title, '用户自定标题不应随语言被改回默认').toBe('我的自定义稿');

  await page.reload();
  const afterReload = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    select: document.getElementById('langSelect').value,
  }));
  expect(afterReload.lang).toBe('ja');
  expect(afterReload.select).toBe('ja');
});

/* ================= B4. 讲稿库 ================= */

test('B4 讲稿库：新建/切换后内容、标题、激活态同步，切稿清掉旧高亮', async ({ page }) => {
  await boot(page);

  const ids = await page.evaluate(() => {
    const first = activeScript();
    first.title = '第一篇';
    first.titleKind = 'custom';
    first.content = '这是第一篇讲稿的正文内容';
    first.updatedAt = Date.now();
    loadActiveIntoEditor();
    const firstId = state.activeScriptId;
    const second = importTextAsNewScript('第二篇', '这是第二篇讲稿的正文内容');
    state.readMark = true;
    syncReadMarkUI();
    anchorReadHeadToToken(0);
    updateReadMark(true, true);
    return { firstId, secondId: second.id };
  });
  expect(await page.evaluate(() => state.scripts.length)).toBe(2);

  await page.click('#btnSettings');
  await page.locator('#scriptList .script-row-title').nth(0).click();

  const r = await page.evaluate(() => ({
    active: state.activeScriptId,
    content: getActiveContent(),
    editor: scrollText.textContent,
    title: document.getElementById('currentScriptTitle').textContent,
    activeRow: document.querySelectorAll('#scriptList .script-row')[0].classList.contains('active'),
    head: readHeadContentY,
    mark: readMarkEl.style.display,
    playing,
  }));

  expect(r.active, '应切回第一篇').toBe(ids.firstId);
  expect(r.content, '数据模型应载入第一篇').toContain('第一篇');
  expect(r.editor, '提词区应载入第一篇').toBe(r.content);
  expect(r.title, '主界面标题应同步').toBe('第一篇');
  expect(r.activeRow, '讲稿库蓝色激活态应跟上').toBe(true);
  expect(r.head, '切稿后阅读头必须归零').toBe(0);
  expect(r.mark, '切稿后旧高亮必须隐藏').toBe('none');
  expect(r.playing, '切稿后不应继续播放').toBe(false);
  expect(ids.secondId, '新建讲稿应拿到独立 id').not.toBe(ids.firstId);
});

/* ================= B5. 文件导入 ================= */

test('B5 文件导入：写入当前选中讲稿、不隐式新建、标题保留、光标与徽标同步', async ({ page }) => {
  await boot(page);

  const meta = await page.evaluate(() => {
    setActiveTitle('指定稿');
    refreshCurrentScriptTitle();
    return { id: state.activeScriptId, count: state.scripts.length };
  });

  const text = '导入的讲稿内容'.repeat(8);
  await page.setInputFiles('#importFile', {
    name: '稿子.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(text, 'utf8'),
  });

  await expect.poll(() => page.evaluate(() => getActiveContent())).toBe(text);

  const r = await page.evaluate(() => ({
    active: state.activeScriptId,
    count: state.scripts.length,
    editor: scrollText.textContent,
    title: activeScript().title,
    badge: document.getElementById('readCharsBadge').dataset.state,
    offset,
    playing,
    mark: readMarkEl.style.display,
    toast: document.getElementById('toast').textContent,
    want: t('importIntoActive'),
  }));

  expect(r.active, '导入目标应仍是当前选中稿').toBe(meta.id);
  expect(r.count, '导入不应隐式新建讲稿').toBe(meta.count);
  expect(r.editor, '提词区应显示导入内容').toBe(text);
  expect(r.title, '用户指定标题不应被文件名覆盖').toBe('指定稿');
  expect(r.badge, '字数徽标应同步为达标').toBe('ok');
  expect(r.offset, '导入后应回到开头').toBe(0);
  expect(r.playing, '导入后不应处于播放态').toBe(false);
  expect(r.mark, '导入后旧高亮应清掉').toBe('none');
  expect(r.toast, '应提示写入当前讲稿').toBe(r.want);
});

/* ================= B6. 本机 ID 两步语义 ================= */

test('B6 本机 ID：换一个只换 ID 不改名字，确认后才同步，使用 ID 直接填名', async ({ page }) => {
  await boot(page);
  await page.click('#btnSettings');

  const first = await page.evaluate(() => {
    state.displayName = '原名字';
    state.localId = 'TP-ABC123';
    setDisplayName.value = '原名字';
    renderLocalId();
    return { id: state.localId };
  });

  await page.click('#btnResetId');
  const afterReset = await page.evaluate(() => ({
    id: state.localId,
    name: state.displayName,
    input: setDisplayName.value,
    confirmVisible: btnConfirmId.style.display !== 'none',
    toast: document.getElementById('toast').textContent,
    want: t('idRegenerated'),
  }));
  expect(afterReset.id, '应生成新 ID').not.toBe(first.id);
  expect(afterReset.name, '换 ID 不应擅自改名字').toBe('原名字');
  expect(afterReset.input, '名字输入框也应保持原样').toBe('原名字');
  expect(afterReset.confirmVisible, '应出现「确认换 ID」').toBe(true);
  expect(afterReset.toast, '应提示名字未变').toBe(afterReset.want);

  await page.click('#btnConfirmId');
  const afterConfirm = await page.evaluate(() => ({
    name: state.displayName,
    input: setDisplayName.value,
    id: state.localId,
    confirmHidden: btnConfirmId.style.display === 'none',
    toast: document.getElementById('toast').textContent,
    want: t('idCopied'),
  }));
  expect(afterConfirm.name).toBe(afterConfirm.id);
  expect(afterConfirm.input).toBe(afterConfirm.id);
  expect(afterConfirm.confirmHidden, '确认后应收起按钮').toBe(true);
  expect(afterConfirm.toast).toBe(afterConfirm.want);

  await page.evaluate(() => {
    state.displayName = '另一个名字';
    setDisplayName.value = '另一个名字';
  });
  await page.click('#btnCopyId');
  expect(await page.evaluate(() => state.displayName)).toBe(afterConfirm.id);
});

/* ================= B7. 异常响应 ================= */

test('B7 异常响应：验签接口返回畸形 JSON 时落到错误态，不抛出未捕获异常', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await boot(page);
  await page.evaluate(() => { CONFIG.API_BASE = 'https://fake.test'; });
  await page.route('https://fake.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '<html>not json</html>' }));

  await page.evaluate(() => verifyInitData());
  await expect(page.locator('#verifyStatus2')).toHaveText(await txt(page, 'verifyErr'));
  expect(pageErrors, '畸形响应不应产生未捕获异常').toEqual([]);
});

/* ================= B8. 播放状态机 ================= */

test('B8 播放状态机：暂停保留高亮，重置回到开头意图并隐藏高亮', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    setActiveContent('这是一段足够长的讲稿内容用于验证播放状态机'.repeat(3));
    loadActiveIntoEditor();
    state.readMark = true;
    syncReadMarkUI();
  });

  await page.click('#btnPlay');
  expect(await page.evaluate(() => playing), '应进入播放态').toBe(true);
  expect(await page.evaluate(() => document.getElementById('app').classList.contains('playing'))).toBe(true);

  await page.click('#btnPlay');
  const paused = await page.evaluate(() => ({
    playing,
    mark: readMarkEl.style.display,
    app: document.getElementById('app').classList.contains('playing'),
  }));
  expect(paused.playing, '再次点击应暂停').toBe(false);
  expect(paused.app).toBe(false);
  expect(paused.mark, '手动暂停应保留定格高亮').not.toBe('none');

  await page.click('#btnReset');
  const reset = await page.evaluate(() => ({
    playing,
    offset,
    caretSeekOffset,
    mark: readMarkEl.style.display,
    toast: document.getElementById('toast').textContent,
    want: t('resetDone'),
  }));
  expect(reset.playing).toBe(false);
  expect(reset.offset, '重置后 offset 应为 0').toBe(0);
  expect(reset.caretSeekOffset, '重置后应留下「下次从开头播」的一次性意图').toBe(0);
  expect(reset.mark, '重置后高亮应隐藏').toBe('none');
  expect(reset.toast).toBe(reset.want);
});
