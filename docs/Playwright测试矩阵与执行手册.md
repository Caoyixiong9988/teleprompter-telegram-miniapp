# Playwright 测试矩阵与执行手册

> 最后更新：2026-11-19  
> 适用项目：单文件 Telegram 提词器（`index.html` + Cloudflare Workers/D1）；第 8 节为跨项目复用清单，供 Google Play 提词器项目直接沿用。  
> 目标：把「能交给真浏览器验证的行为」尽量交给 Playwright，并用矩阵明确哪些不能/不该交给 Playwright。

---

## 0. 一句话原则

**不是把所有测试都塞进 Playwright，而是把所有「用户肉眼可见、依赖真实布局/事件/状态流转」的行为尽量写成 Playwright 断言；纯函数、密码学验签、SQL、i18n 键数一致性继续留在 Node 单测。**

上次高亮 BUG 的教训正来自这里：axe/Lighthouse 很可靠，但它们不测播放轨迹；E2E 能测轨迹，但前提是有人写出「触底与读完同步」的断言。本手册的目的就是让这类断言不再靠临时想起来，而是变成矩阵里的固定条目。

---

## 1. 当前测试资产全景

| 层 | 入口 | 覆盖内容 | 当前规模 | 是否进本地 push 门禁 |
|---|---|---|---|---|
| 配置一致性 | `npm test` → `check-config.test.mjs` | wrangler 配置、D1 ID、Worker 路由、前端 CONFIG 防错配 | 7 项 | 是 |
| 业务单测 | `npm test` | P2 积分、P3 支付/退款/Pro、P5 增长、P6 遥控/语音/模板、P7 合规、P8 导入、P9 配额 | 161 项（含配置） | 是 |
| Worker HTTP | `npm run smoke:worker` | 真 `worker.fetch` 路由分发 | 18 项 | 否（GitHub Actions 跑） |
| jsdom 编辑器 | `node verify-ios-editor.mjs` | iOS 编辑器源码守卫、mock、canvas stub | 354 项 | 是 |
| i18n | `node test_i18n_real.mjs` | 七语键数、缺键、占位符一致 | 七语各 252 键 | 是 |
| Playwright A 层 | `e2e/a-layer.spec.mjs` | 成片卡、保存/分享、完成卡、镜像/对齐/速度、举报、验签、面板、语音、遥控、高亮轨迹 | 18 项 | 是 |
| Playwright B 层 | `e2e/core-flows.spec.mjs` | 空稿/计次门槛、讲稿库、导入、七语 UI、本机 ID、异常响应、播放状态机 | 8 项 | 是 |
| Playwright a11y | `e2e/accessibility.spec.mjs` | axe WCAG A/AA serious+critical 零违规 | 3 项 | 是 |
| Lighthouse | `npm run audit:lighthouse` | 性能 / 无障碍评分 / 最佳实践 / SEO | 手动审计 | 否 |

> 本地 pre-push 跑的是 **Chromium 全量 E2E（A+B+a11y，共 29 项）**；WebKit 用 `npm run test:e2e:all` 单独跑，避免每次 push 时间过长。

---

## 2. 覆盖矩阵

### 2.1 已固化在 Playwright 的用例

| ID | 模块 | 风险点 | 关键断言 | 文件 |
|---|---|---|---|---|
| A1 | 成片卡 | 免费/Pro 画布尺寸、品牌与水印 | 1080×1350 / 2160×2700；`fillText` 真出现；水印有无 | `a-layer.spec.mjs` |
| A2 | 保存/分享 | 下载文件名、Web Share 成功/取消/失败降级 | `scriptdeck-card.png`；AbortError 不降级；Telegram 环境走 `openTelegramLink` | 同上 |
| A2 | 完成卡 | 名字必填、预览、分享文案 | 未填名跳设置并提示；有名字时 PNG + `fmt(finishShareText)` | 同上 |
| A3 | 显示设置 | 镜像/对齐/速度单位持久化 | `scaleX(-1)`、`textAlign`、px↔CPM 往返、刷新后保持 | 同上 |
| A4 | 举报 | 空内容/成功/业务失败/断网/发送中 | 五种状态文案与输入框清空行为 | 同上 |
| A5 | 验签状态 | `/verify` 三态同步到两处状态栏 | `verifyOk`/`verifyFail+reason`/`verifyErr` | 同上 |
| A6 | 面板 | 五个面板的关闭按钮/遮罩/ESC | 全部收起 `.hidden` | 同上 |
| A7 | 语音跟随 | 识别结果驱动滚动、静音暂停、停止复位；iOS 无 API | `voiceScrollPx>0`、状态文案、disabled、不引导升级 | 同上 |
| A8 | 遥控 | 建会话→轮询指令→控制端发令→断开 | token、poll timer、cmd、停止后清空 | 同上 |
| A9 | 高亮轨迹 | 触底后高亮仍移动 / 结尾越过数行才停 | `maxOff>300`、`finalOff≈maxOff`、`framesStoppedBeforeEnd<=2`；短稿 `maxOff=0` | 同上 |
| A11y-1~3 | 无障碍 | 对比度、标签、可访问名称 | axe serious/critical 为 0；可见按钮都有名称 | `accessibility.spec.mjs` |
| B1 | 空稿 | 空稿点播放误导 | 不进 playing、提示 `playEmpty`、徽标 low | `core-flows.spec.mjs` |
| B2 | 有效读完 | 39/40 字边界 | 39 不计次、40 计次、徽标口径与 `onReadComplete` 一致 | 同上 |
| B3 | 七语 UI | 文案/lang/localStorage/刷新恢复、用户标题误翻译 | 切 en/ja 后文案变、刷新保持、自定义标题不被覆盖 | 同上 |
| B4 | 讲稿库 | 新建/切换后内容、标题、激活态、旧高亮残留 | 三处同步；切稿 `readHeadContentY=0` 且高亮隐藏 | 同上 |
| B5 | 文件导入 | 导入隐式新建、标题被覆盖、光标位置错 | 篇数/activeId 不变；标题保留；offset=0；徽标同步 | 同上 |
| B6 | 本机 ID | 「换一个」擅自改名字 | 换 ID 不改名字；确认后才同步；使用 ID 直接填名 | 同上 |
| B7 | 异常响应 | 畸形 JSON 导致白屏/异常 | 验签落 `verifyErr`；无未捕获 pageerror | 同上 |
| B8 | 播放状态机 | 暂停丢高亮、重置不回开头 | 暂停保留高亮；重置 offset=0、留下从开头播意图且隐藏高亮 | 同上 |

### 2.2 不应/不该只靠 Playwright 的部分

| 类型 | 为什么 | 现有归属 |
|---|---|---|
| 签名验签算法、`MIN_CHARS_FOR_READ` 等纯逻辑 | 无 DOM，Node 单测更快更准 | `npm test` |
| i18n 七语键数/占位符 | 是数据完整性问题，不需要浏览器 | `test_i18n_real.mjs` |
| D1 schema、Worker 路由分发 | 真 Worker 环境，jsdom 无法替代 | `npm run smoke:worker` |
| 真 Telegram Stars 支付 | 需要真实 bot token / 支付沙箱 / 用户交互 | 上线测试阶段手工 + BotFather/Telegram |
| 真 iOS Safari WebView 手势、键盘弹起 | Playwright WebKit 只是近似，不能替代真机 | 真机验收清单（待建） |
| Lighthouse 性能/SEO 分数 | 是审计而非功能断言 | `npm run audit:lighthouse` |
| 像素级视觉回归 | 当前 UI 仍在迭代，锁定截图会制造大量噪音 | 暂不进硬门禁，建议先做「人工看报告」 |

---

## 3. 如何写出可靠的 Playwright 用例

### 3.1 用 `boot()` 注入可控环境

页面是单文件 `index.html`，用 `file://` 打开；后端全部用 `page.route` 拦截。`a-layer.spec.mjs` 与 `core-flows.spec.mjs` 都在 `addInitScript` 里注入：

- `window.Telegram.WebApp` 替身：`initData`、`showConfirm`、`openTelegramLink`、`ready/expand/setHeaderColor`；
- `navigator.share` / `navigator.canShare` 替身：可控成功、AbortError、普通失败；
- `<a download>` 点击拦截：记录下载而不真落盘；
- `canvas.getContext('2d').fillText` 记录：验证真绘制而非按钮存在。

**新增测试不要直接 `page.goto(PAGE_URL)`，先 `boot(page)`**，否则 Telegram 分支和分享降级会走裸浏览器路径，断言会飘。

### 3.2 状态先行，UI 后验

推荐套路：

1. `page.evaluate()` 设置确定性的 `state`、讲稿内容、开关；
2. 触发真实 UI 操作（`click` / `selectOption` / `setInputFiles`）；
3. 再 `page.evaluate()` 读回 DOM 与内部状态做联合断言。

只断言 DOM 容易漏掉「界面变了但数据没变」；只读内部状态又证明不了用户看得见。两者一起断言。

### 3.3 动画/时序类：断言不变量，不断言时间

A9 是范例：不去等「播放 3 秒后应该到哪一行」，而是逐帧推进后断言：

- `finalOff >= maxOff - 1`（读完时确实到底）；
- `framesStoppedBeforeEnd <= 2`（触底与读完几乎同时）；
- `offEverMoved === true`（不是全程静止的假通过）。

这类「不变量」比 `waitForTimeout(3000)` 稳定得多，也不会因为机器快慢误报。

### 3.4 常见踩坑（已踩过，别再踩）

- Pro 成片卡画布是 **2160×2700**，不是 2160×1350；生成慢，timeout 不要压低。
- Telegram WebApp 存在时，分享失败降级走 `openTelegramLink`，不是 `window.open`。
- 设置面板里的按钮（导出 SRT/TXT、预览完成卡等）要先打开 `#settingsSheet`。
- WebKit / 沙箱环境下 Playwright 清理 `test-results/` 可能触发批量删除保护；本地门禁用 `--output=/tmp/tp-e2e-*`。
- Telegram WebView 禁用原生 `confirm`，代码必须走 `showConfirm`；测试替身默认直接回调 `true`。
- `page.route` 多个分支之间要 `unroute`，否则前一个 mock 会把后一个请求吃掉。
- 不要用 `waitForTimeout` 等异步完成，优先 `expect.poll`。
- `file://` 页面 `page.reload()` 在本机偶发等不到 `load` 事件（A3 实测 50.6s），导致 45s 默认超时。刷新类用例改用 `page.reload({ waitUntil: 'domcontentloaded' })` + `page.waitForFunction(() => 页面全局已就绪)`，并给该用例单独放宽 timeout。

---

## 4. 执行命令

```bash
# 只跑 Chromium 门禁（本地 pre-push 同款，A+B+a11y 共 29 项）
npm run test:e2e

# 只跑新增 B 层核心流程
npm run test:e2e:core

# Chromium + WebKit 全矩阵（发版前/排查 iOS 差异时跑）
npm run test:e2e:all

# 只跑高亮轨迹回归
npx playwright test -g "A9" --project=chromium

# 只跑无障碍硬门禁
npm run test:a11y

# 生成 HTML 报告
npx playwright test --project=chromium --reporter=html

# Lighthouse 手动审计
npm run audit:lighthouse
node tools/lighthouse-audit.mjs https://teleprompter-49y.pages.dev/
```

报告位置：

- `playwright-report/`：HTML 报告；
- `test-results/`：失败截图、trace；
- `/tmp/tp-e2e-*`：pre-push 门禁的临时输出目录；
- `lighthouse-report/`：Lighthouse JSON/HTML（已 `.gitignore`）。

---

## 5. 与门禁的关系

- **本地 pre-push**：`.githooks/pre-push` 自动跑 `npm test` → jsdom → i18n → `npx playwright test --project=chromium`。新增的 `core-flows.spec.mjs` 放在 `e2e/` 下，会被自动包含，无需改钩子。
- **GitHub Actions**：`.github/workflows/test.yml` 在 push/PR 到 master/main 时跑全套，并额外跑 `smoke:worker`；迁移到 GitHub 后生效，Gitee 不识别该 workflow。
- **绕过开关**：`SKIP_E2E=1 git push` 只跳 E2E；`SKIP_TESTS=1 git push` 全跳。只应在紧急发布且已人工验证时使用。

---

## 6. 下一步扩展优先级

### P0：最该补的浏览器行为

1. **文件导入格式矩阵**：txt / md / srt / vtt / docx / xlsx / doc / rtf 各自一个最小 fixture，验证解析结果与失败文案；可复用 `p8-import` 的纯函数测试做前置。
2. **长稿性能边界**：1000 行 / 10 万字讲稿下，高亮 token 构建、滚动、切稿是否卡顿；用 Playwright 测「不崩、不超时、状态正确」，性能数字交给 Lighthouse/手工。
3. **小屏 320×568**：A9 与 B4/B5 在小视口重跑，验证工具栏不遮编辑器、补白逻辑不误伤短稿。
4. **本地存储容错**：`localStorage` 被写坏（`state` 非 JSON、scripts 非数组）时是否回落到默认稿而不白屏。

### P1：加固项

5. **Telegram 启动参数**：`start_param`、`initDataUnsafe.user` 缺字段时完成卡/深链不崩。
6. **Pro 门禁 UI**：未付费时导出 SRT/TXT、云同步、语音入口的锁定提示；支付成功态只 mock `/payments/pro-status`，不碰真实 Stars。
7. **视觉回归试运行**：对主界面、设置面板、成片卡保存 baseline 截图，先做成「人工看 diff」的非阻断报告，稳定 2 周后再决定是否进硬门禁。
8. **真机清单**：iOS Safari / Android Telegram WebView 各一份手工验收单，记录键盘弹起、分享面板、下载到相册、语音权限四个 Playwright 替代不了的点。

---

## 7. 新增一条用例的验收标准

一条测试只有同时满足下面四条才算合格：

1. **名字带模块号和风险描述**，如 `B9 小屏 320×568：短稿仍可点播放且工具条不遮编辑器`；
2. **失败时能一眼看出坏在哪**：断言里写清中文 message，不裸写 `toBe(true)`；
3. **不依赖机器速度**：没有裸 `waitForTimeout` 等待业务完成；
4. **能挡住真实回归**：如果把它删掉，上一次修的 BUG 会重新漏过去——A9 就是标准样板。

---

## 8. 跨项目可复用 Debug 经验（Google Play 提词器可直接沿用）

> 这一节不是本项目专属操作，而是前几天反复 debug 后**抽象出来的通用判据**。  
> 下次做 Google Play 提词器时，可直接把这一节当作「架构评审 + 测试设计 + 验收」清单；平台相关替身要换（Telegram WebApp → Android/WebView/Play Billing），但判据和断言思路通用。

### 8.1 高亮/滚动同步：先建坐标系，再写播放逻辑

- **踩过的坑**：阅读头终点 `endY > maxOffset + readHeadScreenY()`，导致文稿触底后高亮继续在空白处扫；用户看到「空白处光标还在动」「到结尾越过几行才停」。
- **通用判据**：任何“跟随指示器 + 可滚动内容”的系统，必须先定义三个量：
  - `readHeadContentY()`：阅读头在内容坐标系里的位置；
  - `offsetForHead(head)`：阅读头位置如何映射成滚动偏移；
  - `readEndContentY()`：阅读任务的真实终点。
- **必须满足的不变量**：`maxOffset >= readEndContentY() - readHeadScreenY()`，即“内容能滚到的终点”与“阅读头读完的终点”同步。
- **验证手法**：不要靠肉眼看几秒，也不要断言“3 秒后到第几行”；逐帧记录 `head / offset / maxOffset`，断言：
  - 读完时 `finalOffset >= maxOffset - 1`；
  - 触底后高亮独走的帧数 `<= 2`；
  - 短稿 `maxOffset === 0`，不被尾部补白误伤成可滚动。
- **Google Play 复用点**：Android 上字体、行距、系统字号缩放差异更大，这个坐标系不变量要比 Telegram 版更早写、更易测。

### 8.2 导入/编辑：光标意图必须绑定到“当前讲稿”

- **踩过的坑**：从讲稿库选中 A 稿后导入，旧实现因为编辑器没光标就隐式新建 B 稿；用户看到“凭空多一篇”。另一个坑是导入后光标停在末尾，看起来像已经读完。
- **通用判据**：
  - 导入目标恒为 `activeScript()`，绝不隐式新建；想导入成新稿必须显式“新建讲稿”；
  - 光标/选区必须在 `mousedown` / `touchstart` 阶段抓取，因为 `click` 时按钮会让 `contenteditable` 失焦；
  - 整篇替换内容后必须 `resetCaretIntentForContentSwap()`，清掉旧稿的“从哪个字开始播”意图；
  - 数据模型、提词区 DOM、设置面板输入框、讲稿库激活态四处一次同步。
- **验证手法**：导入前后断言 `scripts.length`、`activeScriptId`、标题、编辑器内容、`offset=0`、高亮隐藏、字数徽标同步。
- **Google Play 复用点**：Android 文件选择器返回的 URI、权限与文件名编码不同，但“导入不新建、目标恒为当前稿”的判据不变。

### 8.3 有效读完规则：可见、单一口径、不静默

- **踩过的坑**：短稿读完什么都不发生，用户不知道为什么没计次；徽标说“可计次”，`onReadComplete()` 却不认。
- **通用判据**：
  - 门槛（本项目 `MIN_CHARS_FOR_READ = 40`）必须在 UI 上可见；
  - 徽标与计次共用同一个去空白计数函数；
  - 不达门槛要提示“还差 N 字”，不能静默 return；
  - 达到门槛后计次、完成卡、头衔升级的顺序固定，且完成卡可被用户关闭。
- **验证手法**：用 `门槛-1` 和 `门槛` 两个边界值测，而不是随便拿一篇短稿。
- **Google Play 复用点**：若未来接入 Play Games 成就，仍需先有本地明确的“什么算一次有效使用”，不要把平台成就规则当产品规则。

### 8.4 身份体系：名字、本机 ID、系统标题三者分离

- **踩过的坑**：换 ID 时擅自改名字；“使用 ID”与“换一个”语义混淆；系统讲稿标题随语言把用户自定义标题覆盖。
- **通用判据**：
  - `displayName` 是用户身份，用户自定；
  - `localId` 是本机标识，不上传、不参与社交排名；
  - 系统标题用 `titleKind: default|new` 标记，用户改过的标题必须标 `custom`，切语言时只翻译系统标题；
  - 完成卡“自动弹出”不拦名字，但“保存/分享出去”必须要求署名。
- **验证手法**：测试必须走真实输入框的 `input` 事件来设标题，直接改 `state.title` 而不改 `titleKind` 会制造假通过。
- **Google Play 复用点**：若接 Google Sign-In，仍建议保留“本地显示名/云端账号名”分层，不要用账号邮箱直接当卡片署名。

### 8.5 i18n：前端七语不等于后端七语

- **踩过的坑**：前端有 de/fr，后端合规声明只有五语，请求 `?lang=de|fr` 静默回落中文；硬编码键数导致每次加键都要改测试。
- **通用判据**：
  - `SUPPORTED_LANGS` 必须前后端同源；
  - 每个语言做“缺键 + 占位符 + 真实请求返回该语言特征字符”三层校验；
  - 新增翻译键只改数据源，测试从数据源动态计算键数，不要硬编码 252。
- **验证手法**：Node 层测数据完整性，Playwright 层测 UI 切换、`document.documentElement.lang`、localStorage、刷新恢复、用户标题不被翻译。
- **Google Play 复用点**：Google Play Listing 的多语言与 App 内 i18n 是两套系统，别互相假设一致。

### 8.6 WebView / 平台替身：先注入，再断言

- **踩过的坑**：Telegram WebView 禁用原生 `confirm`；Telegram 环境下分享失败走 `openTelegramLink` 而非 `window.open`；裸浏览器直接 `page.goto()` 会绕过所有 Telegram 分支，断言飘。
- **通用判据**：
  - 平台 SDK 必须在 `addInitScript` 阶段注入替身，页面加载前就存在；
  - 分享 API 至少测三态：成功、`AbortError`（用户取消，不降级）、其他失败（降级）；
  - 原生弹窗统一走 SDK `showConfirm`，替身默认直接回调 `true`；
  - `page.route` 每个分支后 `unroute`，避免旧 mock 吃掉新请求；
  - **必须阻断外部 SDK 脚本**（本项目是 `https://telegram.org/js/telegram-web-app.js`）：在 `boot()` 里 `await page.route(..., r => r.abort())`。否则 CI 有外网、真实 SDK 会加载并**覆盖 `addInitScript` 的替身**，而本地无外网时替身得以保留——同一份代码就出现「本地 100% 过、CI 稳定挂」的假象。2026-11-20 那次 CI 4 项失败（验签/遥控/分享降级状态为空或误跳转）根因就是它。
- **定位手法**：`--reporter=line` 看失败项 → 下载 Actions 的 `playwright-report` artifact → trace 的 `*.network` 里若出现真实 SDK 请求且成功，基本可锁定替身被覆盖。
- **Google Play 复用点**：把 `Telegram.WebApp` 替身换成 Android JS Bridge / WebView 注入对象；任何「页面从 CDN 引 SDK」的场景（Play Billing、Google Identity、Firebase）都要在测试里 abort 掉该请求，只留替身。如果做 TWA，还要单独覆盖返回键、分享面板、文件下载权限、软键盘遮挡。

### 8.7 画布导出：验证真绘制，不验证按钮存在

- **踩过的坑**：Pro 成片卡实际是 **2160×2700**，不是 2160×1350；生成慢，把 timeout 压到 15 秒会假失败；只断言“按钮存在”完全没用。
- **通用判据**：
  - hook `document.createElement('canvas')` 记录尺寸；
  - hook `CanvasRenderingContext2D.prototype.fillText` 记录真实文案；
  - 断言 dataURL 长度、画布尺寸、品牌/水印/Pro 标记是否真的画进去。
- **Google Play 复用点**：Android 设备 DPR 差异大，导出尺寸更要写死在测试里，而不是依赖运行时截图判断。

### 8.8 无障碍：能加 `<label for>` 就别堆 aria-label

- **踩过的坑**：灰色 `#79808c` 对比度 3.97 < 4.5；6 个表单控件 + 2 个 select 无可访问名称；A−/A+ 的 aria-label 不含可见字符；滚动区键盘不可达。
- **通用判据**：
  - 表单控件优先 `<label for="id">`，名称随 i18n 自动切换，不用新增几十个翻译键；
  - aria-label 必须包含可见字符，否则 `label-content-name-mismatch`；
  - 全局 `--muted` 一处改，13 处对比度问题一起消；
  - `#viewport` 这类滚动区要 `tabindex="0"`，页面要有 `<main>` 地标；
  - axe 基线清零后就是**零违规硬门禁**，任何 serious/critical 都挡 push。
- **Google Play 复用点**：Android TalkBack 与 WebView 的标签暴露规则和浏览器相近，这套标签/对比度判据可直接复用。

### 8.9 测试基础设施：稳定比覆盖更重要的部分

- **踩过的坑**：
  - Playwright 清理 `test-results/` 触发沙箱批量删除保护 → 门禁用 `--output=/tmp/tp-e2e-*`；
  - Gitee push 期间 SSH 空闲断开报 `exit 141` → `ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=120`；
  - `wrangler` 不带 `--branch main` 会部署到 Preview，不是生产；
  - 长门禁期间任何一项红灯都应挡住 push，`SKIP_E2E` / `SKIP_TESTS` 只能紧急人工验证后用。
- **通用判据**：
  - 本地门禁跑快而稳的核心子集，CI 跑全矩阵（含 WebKit / smoke / 手工清单）；
  - 部署后必须核验**字节数 + sha256**，并避开 CDN 缓存（cache-buster）；
  - 配置一致性门禁要覆盖“生产 ID 误写进 dev”“路由漏挂”“已下线模块仍被 import”“前端硬编码 URL”。
- **Google Play 复用点**：换成 Play App Signing / AAB 上传流程后，仍要保留“本地门禁 → 云端留痕 → 发布后逐字节/版本核验”的三段式。

### 8.10 工具可靠性边界：工具不会替你写断言

- **结论**：axe 查无障碍，Lighthouse 查性能/最佳实践/SEO，E2E 只验证写好的断言，jsdom/单测没有真实布局。它们都可靠，但都只在自己的范围内可靠。
- **上次高亮 BUG 的真正原因**：上午跑了工具，但没有“触底与读完同步”的断言；用户真机场景触发了未覆盖的坐标边界。
- **修复方式**：把每个真实 BUG 转写成一条“删掉就会复发”的断言（A9 是样板），再纳入 push 门禁。
- **Google Play 复用点**：新项目第一天就建这个规则：**修一个 BUG，必须同时产出一条回归测试**；否则工具跑得再多，也只是把已知问题跑一遍。

### 8.11 平台账号与支付凭据：先跑通注册链，再谈上线（2026-11-23 真机联调）

- **踩过的坑**：项目专用 Telegram 号用 +852 香港储值卡，仍触发 `SMS Fee`（$0.29 一次性，附赠 3 天 Premium）——这不是被判「在大陆」，页面原文写的是 `in your country (Hong Kong (China))`，按**号码归属地**的国际短信成本收费，与 IP / 实际所在地无关。iPhone 上登的是**美区 Apple ID**，内购不认支付宝/微信，最后是大陆手机买美区礼品卡、在那台 iPhone 的 App Store 兑换成余额才付成功；付款后短信不是秒到，界面提示 `Telegram will call you in 1:14`，**语音来电**才是稳定通道（顺手关掉「静音未知来电」，否则容易漏接）。BotFather 给 token 后，从截图抄 `1`/`l`、`0`/`O` 极易出错。
- **通用判据**：账号注册 + 支付凭据是上线的**第一道工程任务**，不是行政杂事；所有验证码、两步验证密码、token、卡密只进本机文件，绝不进对话或外发截图；token 必须取纯文本（长按复制），不要从图里转录。
- **验证手法**：注册后立刻设两步验证 + 恢复邮箱；拿到 token 先用 `getMe` 核对 id / username 再往下配；付 $0.29 后去订阅页确认 3 天 Premium **没开自动续费**。
- **Google Play 复用点**：Play 组织开发者账号同理——D-U-N-S、营业执照、法人护照、$25 与 Google Payments 收款账户，是**唯一可能卡死的非技术项**，先验证收款主体能落地再写代码；开发者账号也建议专用，不与个人号混用。

### 8.12 本机到不了目标 API：用一次性跳板，别改架构（2026-11-23 真机联调）

- **踩过的坑**：本机到 `api.telegram.org` 与 `*.workers.dev` 都是 `http=000`（直连和代理都不通），但 `*.pages.dev` 与 `api.cloudflare.com` 通；于是 `getMe` / `setWebhook` 从电脑根本发不出去。
- **通用判据**：先区分「本机网络受限」与「服务故障」——同一个 URL 换云端执行能通，就是前者。**不要为了迁就本机网络去改 webhook 目标或降级配置**。
- **验证手法**：用已保存的 CF API Token 调 Cloudflare API 核验部署版本（比本机 curl 可靠）；临时部署一个 **Pages Function** 跳板（`pages.dev` 从本机可达，且在海外执行能调通目标 API），token 走 secret 注入、不落代码；依次跑 `getMe → setWebhook → getWebhookInfo` 核验 `url` / `secret_token` / `pending_update_count` / `last_error_message`。**跳板用完立刻删除**（Worker 脚本 + Pages 项目都删），不留带 secret 的公开端点。
- **Google Play 复用点**：Play Developer API / RTDN 从国内直连同样不稳，照用一次性跳板或已授权的 CI runner；规则不变——secret 走环境变量、跳板短命、用完即删、云端核验优先于本机 curl。

### 8.13 平台控制台会改版：按当前屏幕走，不按旧教程走（2026-11-23 真机联调）

- **踩过的坑**：新版 BotFather 没有 `/newapp` 菜单项，实际路径是 Settings → **Mini Apps** → Menu Button；Menu Button 方式**没有上传图标那一步**（那是完整 Mini App 流程才有的），bot 头像要单独 `/setuserpic` 且必须是**正方形**（做成了 512×512）；`/setuserpic` 必须「先选 bot 再发图片」，直接发图会报 `Invalid bot selected`；BotFather 管理页截图里带 token，不能外发。
- **通用判据**：平台后台 UI 会变，教程只用来认概念（Web App URL、图标、菜单入口），操作时**以当前屏幕为准**；分清「管理后台」和「用户对话」是两个入口——在管理页里永远找不到用户侧的底部按钮。
- **验证手法**：保存后回到真正的对话窗口点 Launch，确认页面加载、身份栏、积分显示；头像（聊天列表 / Launch 弹窗）与 Mini App 内部 logo 是两个位置，分别核验。
- **Google Play 复用点**：Play Console 的测试轨道、商品、Data safety 表单同样会改版；商店素材（512 图标、1024×500 feature graphic、真机截图）是**独立上传项**，不会从代码里自动生成，提前排期。

### 8.14 真机专属 BUG：软键盘与浏览态高亮，本地测不到（2026-11-23 真机联调）

- **踩过的坑**：① 点台词区软键盘弹起，底部按钮整行被顶上来把台词区冲没——`100dvh` 在 iOS / Telegram 内置浏览器里**不随软键盘收缩**；② 打开就有一个黄色高亮块停在第一字，手指下滑稿子时黄块跟着手指走——暂停/浏览态也在画逐词高亮，滚动时还重画。设置面板原文其实写着「只在播放时显示」，实现跑偏了。
- **通用判据**：任何「可滚动内容 + 跟随指示器」系统，必须明确区分**播放态**与**浏览/编辑态**：逐词高亮只在播放态出现，浏览态收起但记住起点；编辑态用 `visualViewport.height` 实测视口高度锁定整页，并隐藏非必要控制条给输入区让位，提词区留最小高度兜底。
- **验证手法**：这类只有真机软键盘 / 触摸才触发，jsdom 和 Playwright 默认视口测不出来；真机逐项手测后，把修法转成源码门禁断言（如「编辑态隐藏控制条规则存在」「暂停态滚动不再调 `updateReadMark`」），否则下次改代码会复发。本次加了两条断言并同步更新了旧断言。
- **Google Play 复用点**：Android WebView 的 `adjustResize` / `adjustPan`、system bars、各家输入法键盘高度差异更大，8.6 提到的「软键盘遮挡」到这里要用同一套 `visualViewport` 判据更早处理；TWA 尤其注意。

### 8.15 提示文字与正文的边界：伪元素承载引导，别写进 contenteditable（2026-11-24 真机联调）

- **踩过的坑**：默认讲稿 `defaultScript` 里把「点击右下角 ⚙ 打开设置……准备好后点 ▶」写成了**真实文本节点**。于是用户全选/复制时会把操作说明一起带走，播放时也会把它念出来——操作提示混进了内容。另一个坑：编辑态为防键盘顶飞把整个控制条 `display:none`，导致用户输入后看不到 ▶，必须先点「完成」才出现。
- **通用判据**：
  - UI 引导文字绝不进入可编辑内容模型；用 **CSS 伪元素 + `data-placeholder`**（`::before{content:attr(...)}`）承载，伪元素不进 DOM、不会被选中/复制/`innerText` 读取；配套提示条加 `user-select:none`。
  - 默认稿只放**一句中性示例**（如「Paste your script here.」）即可，别塞「点击右下角/准备好后点▶」这类操作指令；切语言要能刷新这句示例（i18n 测试常断言它包含特征文案）。真正清空成空稿时要额外检查「空内容被误判为默认稿」的判定（`isDefault` 类逻辑别只比内容相等），本次就因清空导致导入后字数徽标停旧态的连锁 bug。
  - 编辑态可压缩控制条（隐藏调速等次要行）腾空间，但**核心操作按钮（▶）必须常驻可见**——「输入完就能播」是基本预期，不该要求先退出编辑态。
- **验证手法**：源码断言三件套——默认稿正文不含操作动词、`edit-hint` 带 `user-select:none`、引导走 `is-empty:empty::before`；再断言编辑态不再整条隐藏 `#controlBar`、且 `togglePlay` 会先退出编辑态。行为上用一条 E2E 覆盖「导入/输入后字数徽标即时同步」——本次就暴露出 `commitImportedEdit` 漏调 `renderReadCharsBadge`，空默认稿下没有输入事件兜底，徽标停在旧态（真 bug，顺带修）。
- **Google Play 复用点**：Android 原生 `EditText` 的 `hint` 天然是这个模型（hint 不属于 `getText()`），移植时别反过来把提示塞进正文；TV/车载等遥控器场景更依赖「当前焦点可直接触发主操作」，编辑态藏主按钮会同样挨批。

### 8.16 触摸手势与跨行高亮：禁整页缩放 + 按显示行拆词（2026-11-24 真机联调）

- **踩过的坑**：① 播放态原生滚动条被关、进度条做成只读（`pointer-events:none`），用户手指拖动定位**完全无效**，拖动还被 WebView 当成缩放手势把整个 mini app 放大——为了修 iOS 输入框聚焦放大，之前把 `user-scalable=no` 从 viewport meta 去掉了，副作用是整页可缩放；② 高亮黄块一次盖住两行——连续无空格串（随机拼音、长英文）被切词器当成**一个词**，跨行显示时 `Range.getBoundingClientRect()` 返回的是跨所有行的**包围盒**（首行 left、末行 right、高度跨两行），黄块按它画就盖满两行。
- **通用判据**：
  - Mini App / WebView 内**禁止整页缩放**（`maximum-scale=1, user-scalable=no`）；输入框聚焦放大的真正根因是字号 <16px，用 `font-size:16px !important` 单独解决，不要用「放开缩放」这种以毒攻毒的写法。
  - 播放态的进度指示别做成只读：给它 `pointer-events:auto` + `touch-action:none`，加宽透明热区（可视 5px/热区 18px），`pointerdown/move` 按比例定位；定位函数要同时更新 offset、阅读头锚点和进度条，但不写 `viewport.scrollTop`（位移交给 transform）。
  - 「跟随指示器 + 可折行文本」系统：切词后必须再按**显示行**校正几何——用 `getClientRects()` 拿词占用的每个行片段，逐字符按 `top` 归行，把跨行词拆成每行一个子 token（`charStart/charEnd/rw` 按比例分配，保证 caret 定位与权重守恒）；绘制时再把高度钳制到本行高做双保险。jsdom 无 `getClientRects` 时回退常规测量。
- **验证手法**：源码断言——viewport meta 含 `user-scalable=no`、进度条 `pointer-events:auto`+`touch-action:none`、`seekByProgress` 与 `pointerdown/move` 绑定、跨行拆分函数存在且在几何循环里被调用、黄块高度 `Math.min(tk.h, lineHeight)`。行为上用 mock token 验证「英文整词」仍是一个词元（拆分只发生在几何层，不改切词口径），避免为了修跨行把 `tokenizeForRead` 改坏。
- **Google Play 复用点**：Android WebView 的 `setSupportZoom(false)` / `builtInZoomControls=false` 对应这里的禁缩放；Canvas 自绘高亮同样会遇到「一个 textRun 跨多行」——文本测量要用 `getTextBounds`/逐行 `StaticLayout` 而非整段包围盒，判据完全一致。

### 8.17 真机第二批 6 BUG：WebKit 测量、动态文案翻译、WebView 能力边界（2026-11-24 下午）

- **踩过的坑（逐项根因）**：
  1. **高亮少首字母**：iOS WebKit 的 `Range.getBoundingClientRect()` 对整词（尤其跨 text node / simple line layout）有已知偏移 bug（WebKit #182181 / #296765），实测「yabjianggao」黄块从 `a` 开始；输入法还会把一个英文词拆成两个 text node。
  2. **身份已验证不翻译**：`verifyStatus` 缓存的是 `t('verifyOk')` 的**当期语言字符串**，切语言时 `applyI18n()` 只刷新带 `data-i18n` 的静态节点，动态节点永远停在首次语言。
  3. **没有"打开文件"**：只有"从文件导入"（写入当前稿），没有"选择一个已存文件 → 另存为新讲稿并载入"的入口；且曾把两个功能共用一个 `<input type=file>`，change 事件互相串。
  4. **完成卡 CTA / URL 点了没反应**：卡片是 `canvas.toDataURL()` 生成的 **PNG**，图片内文字天生不可点；页面里也没有 `<a>` 或 image map。
  5. **分享给朋友弹的是系统面板**：`navigator.share` 被排在 `openTelegramLink` 之前；Telegram WebView 里它调起的是 Android / iOS **系统分享面板**，不是 Telegram 内置「选择聊天」。
  6. **保存卡片毫无反应**：`<a download>.click()` 在 Telegram 内 WebView 被静默忽略（既不下载、也不报错），用户完全看不到反馈。
- **通用判据 / 修法**：
  - 跟随指示器不要用整段 Range 的包围盒做最终绘制：**逐字符**取 `Range.getBoundingClientRect()`（过滤 WebKit 折行返回的 width=0 假矩形），用首/末字符并集得出词块；再按 `charStart/charEnd` 连续 + 同 `top` 合并跨 text node 的同一单词。缓存几何只做兜底。
  - 动态状态文案**只缓存 key/reason**（如 `{key:'verifyOk'}`），渲染时现取 `t(key)`；`applyI18n()` 必须显式调用一次所有动态渲染函数（验签状态、徽标、档位提示等）。凡是 `textContent = t(...)` 出现在初始化而非渲染函数里的，都是切语言漏翻的高危点。
  -「导入」和「打开」是两个语义：导入=写当前稿，打开=另存新稿并载入。各自一个隐藏 file input，挂在 body 级（不要放进 `display:none` 的面板，iOS 会弹不出选择器）。免费额度满时降级覆盖当前稿并明确 toast，别让用户点了没反应。
  - Canvas 图片内的"链接"必须外置：用 `<img usemap>` + `<area>` 把图上 CTA / 网址区域映射到深链（坐标按画布实际像素缩放，Pro 高清卡 ×2 也能对准），并在图片下方放同文案真实 `<a>` 兜底；两条路径统一调 `openTelegramLink` / `openLink`。
  - WebView 能力判断顺序：**在 Telegram 内 → openTelegramLink(t.me/share/url)**；普通浏览器 → Web Share API（带 PNG）→ 失败降级 deep link。`navigator.share` 永远不能排在 Telegram 原生分享之前。
  - Telegram 内**不能依赖 `a[download]`**：弹一个"保存面板"显示原图 + 长按指引（Android/iOS 通用）；桌面浏览器优先 `showSaveFilePicker()`（真正的选择目录框），最后才 `a.download`，每条路径都给 toast 反馈。
- **验证手法**：iOS 门禁补 11 条断言，其中 4 条是**行为级**：mock `document.createRange` 复现"整词 Range 缺首字母 + 跨 text node"，验证修正后的黄块 left/w 覆盖完整单词；切法语后检查验签节点无中文；`handleOpenFile` 验证以文件名为标题新增并载入；`shareCompletion` 验证 Telegram 内 `navigator.share` 调用数为 0；`saveCardImage` 验证保存面板开/关。Playwright A2 层同步改成双环境断言（Telegram 内 + 普通浏览器各跑一遍），避免"只测了浏览器路径却宣称 Telegram 修好"。
- **Google Play 复用点**：Android WebView 同样有 `a[download]` 被吞、`navigator.share` 弹系统面板的问题；原生端用 `ACTION_SEND` + `FileProvider` 才是真分享，TWA 则要 `openTelegramLink` 等价的 deep link 顺序。动态 i18n 状态在 Compose/Flutter 里对应"状态存 key 不存字符串"，否则切 locale 也会残留旧语言。

### 8.18 邀请深链跳到别的机器人：占位符兜底必须换成真实 Bot（2026-11-25 上午）
- **现象**：完成卡上的「你也来试试」/ 卡片下方网址点击后，Telegram 打开的是 `YourBot`（机器人、暂无消息、底部「开始」按钮），不是 `@Dfb9988bot`。
- **根因**：`CONFIG.BOT_USERNAME` 留空（设计成"用户在设置里填"），`deepLink()` 与 `buildRemoteDeepLink()` 的兜底写成字面量 `'your_bot'`；**`your_bot` 是 Telegram 上真实存在的测试机器人**，所以链接不是失效而是跳错号，更容易被忽略。卡片上 4 个可点入口（image map 两个 `<area>` + 两个 `<a>`）统一走 `openInviteLink() → deepLink()`，因此全部中招；静态 `<a href>` 虽然写了 `Dfb9988bot`，但点击被 `preventDefault` 后由 JS 重算，静态值救不了。
- **判据**：默认（设置里 Bot 用户名为空）时 `deepLink()` 必须等于 `https://t.me/Dfb9988bot?startapp=invite`；`buildRemoteDeepLink('tokX')` 必须等于 `...?startapp=remote_tokX`；卡片 4 个入口渲染出的 href 必须匹配 `^https://t.me/Dfb9988bot\?startapp=`；全局不得残留 `'your_bot'` 作为可到达值（注释保留可以）。
- **修法**：① `CONFIG.BOT_USERNAME` 内置 `'Dfb9988bot'`；② 两个 deep link 函数的兜底从 `'your_bot'` 改为 `'Dfb9988bot'`；③ `applyI18n()` 里同步刷新完成卡链接的 `href`（此前只在生成卡片时刷新，卡片未生成前 href 是光的 `t.me/<bot>`、缺 `startapp`）；④ 七语 `botUserHint` / `botUserPlaceholder` / `refHint` 从"留空显示 your_bot"改为"留空自动使用内置 @Dfb9988bot"，避免继续引导用户填占位符。
- **验证手法**：iOS 门禁加 1 条行为断言，在 `state.botUser=''` 下读 config / deepLink / buildRemoteDeepLink / 两个 `<a>.href` / 点击 CTA 后 `openTelegramLink` 的实参，一次性比对；Playwright A2 层加同名 E2E，真浏览器里点 CTA 断言 `window.__tgLinks[0]` 含 `Dfb9988bot?startapp=`，且 `window.open` 未被调用。
- **Google Play 复用点**：任何"用户名可配置"的外部跳转都要有**已验证的真实默认值**，不能用文档示例占位符兜底——示例字符串往往真的被别人注册了。Android 端对应 deep link / App Link 的 host 与 pathPrefix 白名单，默认 host 写错会跳到别人的 App 或应用商店。

### 8.19 一次性 Cloudflare Pages Function 跳板：函数目录必须在项目根（2026-11-25 下午）
- **场景**：本机直连 `api.telegram.org` 不通，需要临时跳板调用 Bot API 批量写入七语介绍（About ≤120 / Description ≤512 字符，`setMyShortDescription` / `setMyDescription` 支持 `language_code`，Bot API 6.6+）。
- **坑 1**：把 `functions/tgproxy.js` 放在 `wrangler pages deploy <静态目录>` 的静态目录里，部署日志只显示 "Uploading... (1/1)"、没有 "Uploading Functions bundle"，路由返回 **405 且空 body**——函数根本没部署。正确位置是**运行 wrangler 的 cwd 下的 `functions/`**（项目根），与 `--directory` 指向的静态输出目录无关。看到 "✨ Uploading Functions bundle" 才算成功。
- **坑 2**：只导出 `onRequestPost` 时首次探测仍拿到 405；改为通用 `onRequest` 内部判 method 后稳定。
- **坑 3**：本机对 `pages.dev` 的 curl / Node fetch 时通时不通（超时或 fetch failed）；脚本里必须带 3 次重试 + 60s 超时，且先用 `getMe` 验证跳板与 Bot 身份，再批量写。
- **安全做法**：token **不写进函数代码**，由调用方经 `x-bot-token` 请求头传入；函数只做 method 白名单 + 转发。用完立即删除 `functions/` 并重新部署干净版本；验证 `/tgproxy` 回到 405、生产首页哈希与本地 `index.html` 一致、token 不在任何被跟踪文件里。
- **验证结果**：七语 + 英文默认兜底共 8 组，写入后 `getMyShortDescription` / `getMyDescription` 逐字回读全部一致。
- **Google Play 复用点**：出海项目里凡"本机到海外 API 不通但托管域名可达"，都可用一次性边缘函数跳板做管理操作；关键是把凭据放在请求头而不是代码/仓库，并在任务结束前下线函数，避免留下公开代理。

### 8.20 真机第二轮 5 项 BUG：长词首字母、CTA no-op、重复邀请、光标消失（2026-11-25 晚）
- **场景**：Telegram Mini App 真机又报 5 项——①行首长英文单词黄块仍少首字母；②完成卡「你也来试试」/网址点击无动作；③完成卡有两处邀请入口太多；④删行后点完成光标消失；⑤刷新归零后点完成光标消失。
- **判据与根因**：
  - ① WebKit 的 `Range.getClientRects()` 对折行/跨 text node 词会返回整行矩形或把首字符 top 归到上一行；逐字符测量"选最宽矩形 + 严格行过滤"反而漏掉首字母。Chromium 探针证明 `tokenRectsForDisplay` 的按行拆词几何是准的，问题在二次精测。
  - ② `openInviteLink()` 在 Telegram 内调 `openTelegramLink(自己的 startapp 深链)`——用户已在该 Mini App 内，Telegram 视为 no-op。事件绑定本身没坏（探针里点击确实触发了 2 次），是**产品语义错**：CTA 是"邀请朋友"，不是"自己再进一次"。
  - ③ 画布 `generateFinishCard` 画了一份 CTA+URL，图片下方 HTML 又有一份，视觉重复。
  - ④⑤ `leaveEditMode()` 只 `exitMainEditModeDOM()`，而 `enterEditMode()` 会 `hideReadMark()`；删行/刷新后点完成从不重画，用户看到"光标消失"。
- **修法**：
  - ① `preciseWordSpanRect` 改为"双向钳制"：以 `tokenRectsForDisplay` 的几何为不可逾越的兜底（left 不右于 anchorLeft、right 不左于 anchorRight），逐字符只作向外修正且限幅 ±1em；合并相邻词元时各段 left 都纳入 anchor。
  - ② `openInviteLink()` 统一走 `telegramShare()` → `t.me/share/url?url=…&text=…`，Telegram 内弹「选择聊天」，有明确动作；普通浏览器走 Web Share。
  - ③ 画布不再 `fillText(finishCtaTitle/深链)`，移除 `usemap`/`<area>` 与坐标兜底点击；邀请入口只剩图片下方一对 `<a>`。i18n 键保留以维持七语键数一致。
  - ④⑤ 新增顶层 `showCaretStartMark()`：以 `caretSeekOffset`（或实时 caret）定位词元，`buildReadTokens()` 重建后 `anchorReadHeadToToken` + `updateReadMark(true, true)`（allowPaused 在暂停态画定格黄块）；`leaveEditMode()` 调用它。刷新按钮本身仍隐藏黄块（符合既有"重置"语义），仅"再点完成"时恢复。
- **验证**：单测 161/161、iOS 门禁 381/381（新增 5 条 + 更新 3 条过时断言）、i18n 32/32、Playwright E2E（新增 3 条：完成卡邀请唯一性/分享面板、删行与刷新后起点黄块）。
- **坑**：jsdom 无真实 Range 几何，`buildReadTokens()` 必返回空、viewport 尺寸为 0 会让黄块被视口检查隐藏——这类渲染断言只能放 Playwright，iOS 门禁只验源码结构与调用链安全，别硬断言 display。
- **Google Play 复用点**：Android WebView 里"深链打开自己"同样可能被判定 no-op——邀请/分享入口一律用 `ACTION_SEND` + 文案深链，而不是 `ACTION_VIEW` 指向自身 App；`contenteditable` 的 caret 意图在失焦后会丢，原生端用 `SelectionInfo` 或 JS 注入保存字符偏移，退出编辑态时据此重画起点指示，逻辑同 `showCaretStartMark`。

---

## 9. 相关文档

- [无障碍与质量审计工具.md](./无障碍与质量审计工具.md)：axe / Lighthouse 的用途、审计记录、修复清单。
- [GitHub注册与CI门禁.md](./GitHub注册与CI门禁.md)：GitHub 注册、迁仓、云端门禁生效方式。
