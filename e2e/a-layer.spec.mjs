import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PAGE_URL = pathToFileURL(path.resolve('index.html')).href;

/**
 * 在页面脚本执行前注入可控替身，让真浏览器能覆盖原本只在真机/真后端才跑得到的分支。
 * 页面本身是普通 <script>（非 module），顶层 function/let/const 在 evaluate 中可直接访问。
 */
async function boot(page, opts = {}) {
  await page.addInitScript((o) => {
    window.__shareCalls = [];
    window.__tgLinks = [];
    window.__opened = [];
    window.__downloads = [];
    window.__drawTexts = [];
    window.__canvases = [];
    window.__canShare = true;
    window.__shareReject = null;

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
        showConfirm(msg, cb) { window.__confirmMsg = msg; if (typeof cb === 'function') cb(true); },
      },
    };

    // 下载：记录 <a download> 点击，不真的落盘
    const origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        window.__downloads.push({ download: this.download, href: String(this.href).slice(0, 40) });
        return;
      }
      return origAnchorClick.apply(this, arguments);
    };

    // canvas：记录画布尺寸与 fillText 文案，验证真绘制而非仅按钮存在
    const origCreate = document.createElement.bind(document);
    document.createElement = function (tag, options) {
      const el = origCreate(tag, options);
      if (String(tag).toLowerCase() === 'canvas') window.__canvases.push(el);
      return el;
    };
    if (window.CanvasRenderingContext2D) {
      const proto = window.CanvasRenderingContext2D.prototype;
      const origFill = proto.fillText;
      proto.fillText = function (text, x, y, maxWidth) {
        window.__drawTexts.push(String(text));
        return origFill.call(this, text, x, y, maxWidth);
      };
    }

    // Web Share API 替身（成功 / AbortError / 普通失败由测试切换）
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async function (data) {
        window.__shareCalls.push(data);
        if (window.__shareReject) throw window.__shareReject;
      },
    });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: function () { return window.__canShare !== false; },
    });
    window.open = function (u) { window.__opened.push(String(u)); return null; };

    // 语音识别替身：iOS 用例传 speech:false 模拟无 Web Speech API
    if (o.speech !== false) {
      window.SpeechRecognition = class {
        constructor() { this.calls = { start: 0, stop: 0 }; window.__recog = this; }
        start() { this.calls.start += 1; }
        stop() { this.calls.stop += 1; }
      };
    } else {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    }
  }, opts);
  await page.goto(PAGE_URL);
}

const txt = (page, key) => page.evaluate((k) => t(k), key);
const shareSummary = (page) => page.evaluate(() => ({
  calls: window.__shareCalls.map((c) => ({
    names: (c.files || []).map((f) => f.name),
    text: c.text,
    url: c.url,
  })),
  tgLinks: window.__tgLinks.length,
  opened: window.__opened.length,
  toast: document.getElementById('toast').textContent,
}));

/* ================= A1. 成片卡 canvas ================= */

test('A1 成片卡：点 🎴 真绘制 1080×1350 PNG、含品牌与免费水印', async ({ page }) => {
  await boot(page);
  await page.click('#btnCard');
  await expect(page.locator('#cardOverlay')).not.toHaveClass(/hidden/);

  const r = await page.evaluate(() => ({
    src: document.getElementById('cardPreview').src,
    canvases: window.__canvases.map((c) => [c.width, c.height]),
    texts: window.__drawTexts,
    tag: document.getElementById('cardExportTag').textContent,
    brand: t('cardBrand'),
    watermark: t('cardGeneratedBy'),
    freeTag: t('cardExportFree'),
  }));
  expect(r.src.startsWith('data:image/png;base64,')).toBeTruthy();
  expect(r.src.length).toBeGreaterThan(5000);
  expect(r.canvases.some(([w, h]) => w === 1080 && h === 1350)).toBeTruthy();
  expect(r.texts.includes(r.brand)).toBeTruthy();
  expect(r.texts.includes(r.watermark)).toBeTruthy();
  expect(r.tag).toBe(r.freeTag);
});

test('A1 成片卡：Pro 档 2× 高清、去水印、导出说明切换', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { state.isPro = true; });
  await page.click('#btnCard');

  const r = await page.evaluate(() => ({
    canvases: window.__canvases.map((c) => [c.width, c.height]),
    texts: window.__drawTexts,
    tag: document.getElementById('cardExportTag').textContent,
    watermark: t('cardGeneratedBy'),
    proTag: t('cardExportPro'),
  }));
  expect(r.canvases.some(([w, h]) => w === 2160 && h === 2700)).toBeTruthy();
  expect(r.texts.includes('Pro')).toBeTruthy();
  expect(r.texts.includes(r.watermark)).toBeFalsy();
  expect(r.tag).toBe(r.proTag);
});

/* ================= A2. 保存 / 分享全链路 ================= */

test('A2 成片卡保存到相册：点击触发 scriptdeck-card.png 下载', async ({ page }) => {
  await boot(page);
  await page.click('#btnCard');
  await page.click('#btnDownloadCard');
  expect(await page.evaluate(() => window.__downloads)).toEqual([
    expect.objectContaining({ download: 'scriptdeck-card.png' }),
  ]);
});

test('A2 成片卡分享：Web Share 带 PNG 文件，成功时不降级到 Telegram', async ({ page }) => {
  await boot(page);
  await page.click('#btnCard');
  await page.click('#btnShareCard');
  await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);
  const r = await shareSummary(page);
  expect(r.calls[0].names).toEqual(['scriptdeck-card.png']);
  expect(r.calls[0].url).toMatch(/^https:\/\/t\.me\//);
  expect(r.tgLinks).toBe(0);
  expect(r.opened).toBe(0);
});

test('A2 成片卡分享：用户取消(AbortError)不降级、不弹提示', async ({ page }) => {
  await boot(page);
  await page.click('#btnCard');
  await page.evaluate(() => { window.__shareReject = new DOMException('cancel', 'AbortError'); });
  await page.click('#btnShareCard');
  await page.waitForTimeout(150);
  const r = await shareSummary(page);
  expect(r.tgLinks).toBe(0);
  expect(r.opened).toBe(0);
  expect(r.toast).toBe('');
});

test('A2 成片卡分享：其他失败降级到 Telegram 深链', async ({ page }) => {
  await boot(page);
  await page.click('#btnCard');
  await page.evaluate(() => { window.__shareReject = new Error('permission denied'); });
  await page.click('#btnShareCard');
  // Telegram WebApp 存在时降级走 openTelegramLink；浏览器裸环境才走 window.open
  await expect.poll(() => page.evaluate(() => window.__tgLinks.length)).toBe(1);
  const r = await shareSummary(page);
  expect(r.tgLinks).toBe(1);
  expect(r.calls.length).toBe(1);
});

test('A2 完成卡：填名字可保存 PNG，未填名字被拦截并跳设置', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { state.displayName = '测试用户'; state.reads = 3; });
  await page.click('#btnSettings'); // 预览按钮在设置面板内
  await page.click('#btnPreviewFinish');
  await expect(page.locator('#finishOverlay')).not.toHaveClass(/hidden/);
  await page.click('#btnFinishSave');
  expect(await page.evaluate(() => window.__downloads)).toEqual([
    expect.objectContaining({ download: 'scriptdeck-finish.png' }),
  ]);

  await page.click('#btnFinishClose');
  await page.evaluate(() => { state.displayName = ''; });
  await page.click('#btnPreviewFinish');
  await page.click('#btnFinishShare');
  await expect(page.locator('#settingsSheet')).not.toHaveClass(/hidden/);
  await expect(page.locator('#finishOverlay')).toHaveClass(/hidden/);
  await expect(page.locator('#toast')).toHaveText(await txt(page, 'nameRequired'));
  expect((await shareSummary(page)).opened).toBe(0);
});

test('A2 完成卡分享：有名字时以 PNG 走 Web Share', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { state.displayName = '测试用户'; state.reads = 6; });
  await page.click('#btnSettings');
  await page.click('#btnPreviewFinish');
  await page.click('#btnFinishShare');
  await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);
  const r = await shareSummary(page);
  expect(r.calls[0].names).toEqual(['scriptdeck-finish.png']);
  // 文案模板由 i18n 决定（英文模板不含名字），与页面 fmt 结果严格比对
  expect(r.calls[0].text).toBe(await page.evaluate(
    () => fmt(t('finishShareText'), { n: 6, name: '测试用户' })));
});

/* ================= A3. 镜像 / 对齐 / 速度单位 ================= */

test('A3 镜像与对齐：真改样式并在刷新后保持', async ({ page }) => {
  await boot(page);
  await page.click('#btnSettings');
  await page.check('#setMirror');
  expect(await page.evaluate(() => state.mirror)).toBe(true);
  expect(await page.evaluate(() => document.getElementById('scrollText').style.transform))
    .toContain('scaleX(-1)');

  await page.selectOption('#setAlign', 'right');
  expect(await page.evaluate(() => state.align)).toBe('right');
  expect(await page.evaluate(() => document.getElementById('scrollText').style.textAlign)).toBe('right');

  await page.reload();
  await page.click('#btnSettings');
  expect(await page.isChecked('#setMirror')).toBe(true);
  expect(await page.inputValue('#setAlign')).toBe('right');
});

test('A3 速度单位：px/s ↔ CPM 往返，滑块范围与标签同步', async ({ page }) => {
  await boot(page);
  await page.click('#btnSettings');
  const before = await page.evaluate(() => ({
    unit: state.speedUnit,
    max: document.getElementById('setSpeed').max,
    label: document.getElementById('setSpeedLabel').textContent,
    px: t('unitPx'),
    cpm: t('unitCpm'),
  }));
  expect(before.unit).toBe('px');
  expect(before.max).toBe('400');
  expect(before.label).toContain(before.px);

  await page.click('#btnSpeedUnit');
  const cpm = await page.evaluate(() => ({
    unit: state.speedUnit,
    min: document.getElementById('setSpeed').min,
    max: document.getElementById('setSpeed').max,
    label: document.getElementById('setSpeedLabel').textContent,
    cpm: t('unitCpm'),
  }));
  expect(cpm.unit).toBe('cpm');
  expect(cpm.min).toBe('20');
  expect(cpm.max).toBe('600');
  expect(cpm.label).toContain(cpm.cpm);

  await page.click('#btnSpeedUnit');
  const back = await page.evaluate(() => ({
    unit: state.speedUnit,
    max: document.getElementById('setSpeed').max,
  }));
  expect(back).toEqual({ unit: 'px', max: '400' });
});

/* ================= A4. 举报表单分支 ================= */

test('A4 举报表单：空内容 / 无后端 / 成功 / 失败 / 断网 / 发送中', async ({ page }) => {
  await boot(page);
  await page.click('#btnSettings');
  const [emptyMsg, sendingMsg, thanksMsg, failMsg, netMsg] = await page.evaluate(() => [
    t('reportEmpty'), t('reportSending'), t('reportThanks'), t('reportFailRetry'), t('reportFailNet'),
  ]);
  const status = page.locator('#reportStatus');

  // 1) 空内容：本地拦截，不发请求
  await page.click('#btnReport');
  await expect(status).toHaveText(emptyMsg);

  // 2) 无后端：直接致谢并清空
  await page.fill('#reportDetail', '测试反馈');
  await page.click('#btnReport');
  await expect(status).toHaveText(thanksMsg);
  await expect(page.locator('#reportDetail')).toBeEmpty();

  // 3) 后端成功
  await page.evaluate(() => { CONFIG.API_BASE = 'https://fake.test'; });
  await page.route('https://fake.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.fill('#reportDetail', '成功反馈');
  await page.click('#btnReport');
  await expect(status).toHaveText(thanksMsg);
  await expect(page.locator('#reportDetail')).toBeEmpty();

  // 4) 业务失败
  await page.unroute('https://fake.test/**');
  await page.route('https://fake.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' }));
  await page.fill('#reportDetail', '失败反馈');
  await page.click('#btnReport');
  await expect(status).toHaveText(failMsg);

  // 5) 断网
  await page.unroute('https://fake.test/**');
  await page.route('https://fake.test/**', (route) => route.abort('failed'));
  await page.fill('#reportDetail', '断网反馈');
  await page.click('#btnReport');
  await expect(status).toHaveText(netMsg);

  // 6) 发送中：route 故意延迟，点击当帧就读到 sending
  await page.unroute('https://fake.test/**');
  await page.route('https://fake.test/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const immediate = await page.evaluate(() => {
    document.getElementById('reportDetail').value = '发送中测试';
    document.getElementById('btnReport').click();
    return document.getElementById('reportStatus').textContent;
  });
  expect(immediate).toBe(sendingMsg);
});

/* ================= A5. 前端验签状态展示 ================= */

test('A5 验签：/verify 结果同步到顶部与设置页两处状态栏', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { CONFIG.API_BASE = 'https://fake.test'; });
  const [okMsg, failMsg, errMsg] = await page.evaluate(() => [t('verifyOk'), t('verifyFail'), t('verifyErr')]);

  await page.route('https://fake.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true}' }));
  await page.evaluate(() => verifyInitData());
  await expect(page.locator('#verifyStatus')).toHaveText(okMsg);
  await expect(page.locator('#verifyStatus2')).toHaveText(okMsg);

  await page.unroute('https://fake.test/**');
  await page.route('https://fake.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":false,"reason":"bad_sig"}' }));
  await page.evaluate(() => verifyInitData());
  await expect(page.locator('#verifyStatus')).toContainText(failMsg);
  await expect(page.locator('#verifyStatus')).toContainText('bad_sig');

  await page.unroute('https://fake.test/**');
  await page.route('https://fake.test/**', (route) => route.abort('failed'));
  await page.evaluate(() => verifyInitData());
  await expect(page.locator('#verifyStatus2')).toHaveText(errMsg);
});

/* ================= A6. 面板关闭（遮罩 / ESC / 关闭按钮） ================= */

test('A6 面板：五个面板的关闭按钮、遮罩点击与 ESC 都能收起', async ({ page }) => {
  await boot(page);
  const hidden = async (id) => expect(page.locator('#' + id)).toHaveClass(/hidden/);
  const visible = async (id) => expect(page.locator('#' + id)).not.toHaveClass(/hidden/);

  // About：关闭按钮
  await page.click('#btnSettings');
  await page.click('#btnOpenAbout');
  await visible('aboutSheet');
  await page.click('#btnCloseAbout');
  await hidden('aboutSheet');

  // About：点遮罩空白
  await page.click('#btnOpenAbout');
  await page.mouse.click(5, 5);
  await hidden('aboutSheet');
  await page.click('#btnCloseSettings'); // 关掉设置抽屉，否则遮罩会拦截主控制栏按钮

  // 成片卡 / 遥控 / 语音 / 完成卡：各自关闭按钮
  await page.click('#btnCard');
  await visible('cardOverlay');
  await page.click('#btnCloseCard');
  await hidden('cardOverlay');

  await page.click('#btnRemote');
  await visible('remoteSheet');
  await page.click('#btnCloseRemote');
  await hidden('remoteSheet');

  await page.click('#btnVoice');
  await visible('voiceSheet');
  await page.click('#btnCloseVoice');
  await hidden('voiceSheet');

  await page.click('#btnSettings');
  await page.click('#btnPreviewFinish');
  await visible('finishOverlay');
  await page.click('#btnFinishClose');
  await hidden('finishOverlay');
  await page.click('#btnCloseSettings');

  // ESC 一次收起所有仍开着的面板。
  // 抽屉是全屏遮罩，不能靠连点两个主栏按钮叠加打开；各按钮打开路径上面已逐个验证过，
  // 这里直接置为多开状态，专门验证 ESC 的批量收起语义。
  await page.evaluate(() => {
    for (const id of ['remoteSheet', 'voiceSheet', 'settingsSheet', 'cardOverlay', 'finishOverlay']) {
      document.getElementById(id).classList.remove('hidden');
    }
  });
  await page.keyboard.press('Escape');
  for (const id of ['remoteSheet', 'voiceSheet', 'settingsSheet', 'cardOverlay', 'finishOverlay']) {
    await hidden(id);
  }
});

/* ================= A7. 语音跟随回调链 ================= */

test('A7 语音跟随：识别结果驱动滚动、静音自动暂停、停止复位', async ({ page }) => {
  await boot(page, { speech: true });
  await page.evaluate(() => { state.isPro = true; });
  await page.click('#btnVoice');
  await page.click('#btnVoiceToggle');
  expect(await page.evaluate(() => ({
    following: voiceFollowing,
    playing: playing,
    starts: window.__recog.calls.start,
  }))).toEqual({ following: true, playing: true, starts: 1 });

  const sample = '测试语音跟随滚动效果'.repeat(3);
  await page.evaluate((s) => {
    window.__recog.onresult({ resultIndex: 0, results: [[{ transcript: s }]] });
  }, sample);
  await page.waitForTimeout(360);
  await page.evaluate((s) => {
    window.__recog.onresult({ resultIndex: 0, results: [[{ transcript: s }]] });
  }, sample);

  const listening = await page.evaluate(() => ({
    px: voiceScrollPx,
    status: document.getElementById('voiceStatus').textContent,
    want: t('voiceStatusListening'),
  }));
  expect(listening.px).toBeGreaterThan(0);
  expect(listening.status).toBe(listening.want);

  // 静音超过阈值 → 暂停（保留高亮）
  await page.evaluate(() => {
    voiceLastSpeechAt = Date.now() - VOICE_SILENCE_MS - 100;
    voiceSilenceCheck();
  });
  const paused = await page.evaluate(() => ({
    playing: playing,
    status: document.getElementById('voiceStatus').textContent,
    want: t('voiceStatusPaused'),
  }));
  expect(paused.playing).toBe(false);
  expect(paused.status).toBe(paused.want);

  await page.click('#btnVoiceToggle');
  const stopped = await page.evaluate(() => ({
    following: voiceFollowing,
    stops: window.__recog.calls.stop,
    status: document.getElementById('voiceStatus').textContent,
    want: t('voiceStatusIdle'),
  }));
  expect(stopped.following).toBe(false);
  expect(stopped.stops).toBe(1);
  expect(stopped.status).toBe(stopped.want);
});

test('A7 语音跟随：iOS / 无 Web Speech 只提示不可用，不引导升级', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await boot(page, { speech: false });
  await page.click('#btnVoice');

  const r = await page.evaluate(() => ({
    need: document.getElementById('voiceNeed').textContent,
    wantNeed: t('voiceStatusUnsupported'),
    iosVisible: !document.getElementById('voiceIosBox').hidden,
    wantIos: t('voiceIosHint'),
    disabled: document.getElementById('btnVoiceToggle').disabled,
    btnText: document.getElementById('btnVoiceToggle').textContent,
    wantBtn: t('voiceUnavailable'),
    proHidden: document.getElementById('proSheet').classList.contains('hidden'),
  }));
  expect(r.need).toBe(r.wantNeed);
  expect(r.iosVisible).toBeTruthy();
  expect(await page.locator('#voiceIosBox').textContent()).toBe(r.wantIos);
  expect(r.disabled).toBe(true);
  expect(r.btnText).toBe(r.wantBtn);
  expect(r.proHidden).toBe(true);

  // 按钮已 disabled；直接用 DOM click() 模拟"即使误触也不引导升级"
  await page.evaluate(() => document.getElementById('btnVoiceToggle').click());
  expect(await page.evaluate(() => document.getElementById('proSheet').classList.contains('hidden'))).toBe(true);
  await context.close();
});

/* ================= A8. 遥控前端网络闭环 ================= */

test('A8 遥控：建会话 → 轮询应用指令 → 控制端发指令 → 断开/停止', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    CONFIG.API_BASE = 'https://fake.test';
    state.isPro = true;
    renderRemoteUI();
  });

  const commands = [];
  let stateHits = 0;
  await page.route('https://fake.test/**', async (route) => {
    const url = route.request().url();
    let body = { ok: true };
    if (url.includes('/remote/create')) {
      body = { sessionToken: 'remote_abc12345' };
    } else if (url.includes('/remote/state')) {
      stateHits += 1;
      body = {
        command: stateHits === 1 ? { cmd: 'play' } : { cmd: 'pause' },
        updated_at: 'u' + stateHits,
      };
    } else if (url.includes('/remote/command')) {
      commands.push(route.request().postDataJSON());
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.click('#btnRemote');
  await page.click('#btnRemoteCreate');
  await expect(page.locator('#remoteTokenValue')).toHaveText('remote_abc12345');
  expect(await page.evaluate(() => remotePollTimer !== null)).toBe(true);

  await expect.poll(() => page.evaluate(() => playing), { timeout: 6000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => playing), { timeout: 6000 }).toBe(false);

  // 控制端：切页 → 输入令牌 → 连接 → 发播放指令
  await page.click('#remoteControllerTab');
  await page.fill('#remoteTokenInput', 'remote_abc12345');
  await page.click('#btnRemoteConnect');
  await expect(page.locator('#remoteCtrlPanel')).toBeVisible();
  await page.click('#btnRemotePlay');
  await expect.poll(() => commands.length).toBeGreaterThan(0);
  expect(commands.some((c) => c.cmd === 'play')).toBe(true);

  await page.click('#btnRemoteDisconnect');
  expect(await page.evaluate(() => document.getElementById('remoteCtrlPanel').hidden)).toBe(true);

  await page.click('#remotePlayerTab');
  await page.click('#btnRemoteStop');
  expect(await page.evaluate(() => ({ token: remoteToken, timer: remotePollTimer })))
    .toEqual({ token: null, timer: null });
});
