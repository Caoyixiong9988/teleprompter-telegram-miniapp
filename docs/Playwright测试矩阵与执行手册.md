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
  - `page.route` 每个分支后 `unroute`，避免旧 mock 吃掉新请求。
- **Google Play 复用点**：把 `Telegram.WebApp` 替身换成 Android JS Bridge / WebView 注入对象；如果做 TWA，还要单独覆盖返回键、分享面板、文件下载权限、软键盘遮挡。

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

---

## 9. 相关文档

- [无障碍与质量审计工具.md](./无障碍与质量审计工具.md)：axe / Lighthouse 的用途、审计记录、修复清单。
- [GitHub注册与CI门禁.md](./GitHub注册与CI门禁.md)：GitHub 注册、迁仓、云端门禁生效方式。
