# 变更记录（CHANGELOG）

> 用途：给非技术视角一份"每次改了什么"的可读清单，随代码一起备份到 Gitee。
> 规则：**每次 push 前在最上面追加一条**，最新在最前。每条包含：类型 / 改了什么 / 为什么 / 怎么验证 / 涉及文件。
> 详细的排查过程记在本地 `.workbuddy/memory/`（不进仓库），这里只留结论。
>
> 类型：`feat` 新功能 · `fix` 修缺陷 · `copy` 文案/合规口径 · `docs` 文档 · `refactor` 重构 · `chore` 杂项

---

## 2026-11-16 · feat(i18n) — 语言从五语扩到七语，新增德语 / 法语

**为什么**：用户判断德语区与法语区（德国、奥地利、瑞士、法国、比利时、加拿大魁北克、西非法语区）是值得覆盖的增量市场，希望在语言选择里加入 Deutsch 与 Français。

**做了什么**：

1. `I18N` 新增 `de` / `fr` 两个语言包，**各 193 键，与 zh 完全同集**（无漏键、无空值、无多余键），全部按德语 / 法语习惯重写而非机翻占位：德语用「du」称呼、欧元区常见措辞与 `Strg+V` 快捷键；法语用「vous」、`Ctrl+V / ⌘V`，并保留 `« »` 与 `’` 排版符号。`{n}` / `{max}` / `{m}` / `{next}` / `{name}` 五类占位符全部保留。
2. `SUPPORTED_LANGS` 扩为 `['zh','en','de','fr','ja','ko','ru']`，`I18N` 内的块顺序也按同一顺序排列（不把新语言追加在末尾，避免以后维护时顺序错乱）；语言下拉按 `中文 / EN / Deutsch / Français / 日本語 / 한국어 / Русский` 排列。`pickSupported()` 与 `detectLang()` 自动生效 —— Telegram 客户端语言为 `de` / `fr`（含 `de-AT`、`fr-CA` 等变体）的用户**首开即见母语**，无需手动切换。
3. 合规口径不变：七语免责声明、Pro 购买须知、14 天退款条款、语音跟随「iOS 不可用」说明逐条对应，未放宽任何文案。

**体积影响（回答"会占很多 Cloudflare 空间吗"）**：`index.html` 由 **195,456 → 223,844 字节（+28,388，+14.5%）**；实测 gzip 后 **62,643 → 72,717 字节（+10,074，+16.1%）**。Cloudflare Pages 免费档：单文件上限 25 MiB、每月 500 次部署、静态请求不限量不计费 —— 223,844 字节只占上限的 **0.85%**，传输增量约 10 KB（约一张小图）。代价只有"多两个语言包要同步维护"，已由 `npm run test:ios` 的七语键集断言兜住。

**怎么验证**：`npm run test:ios` **75/75**（新增 6 项：七语各 193 键一致、SUPPORTED_LANGS 顺序、下拉含 Deutsch/Français、切德语 html lang 与 UI 渲染、切法语同理、切回中文恢复）；`npm test` **126/126**；`node test_i18n_real.mjs` **32/32**（键集一致性循环改为七语）；`npm run smoke:worker` **18/18**。

**涉及文件**：`index.html`、`verify-ios-editor.mjs`、`test_i18n_real.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、`README.md`、`README_deploy.md`、`CHANGELOG.md`、`【上线清单】…md`。

---

## 2026-11-16 · feat(player) — 控制条重排 / 常显滚动条 / 暂停继续 / 刷新归零 / 点击任意行定位

**为什么**：电脑端复测一次报 5 项：① 底部按钮遮挡速度（像素）选择区；② 提词内容区没有滚动条；③ 只能从头播到尾，无法播放中暂停再继续；④ 刷新后不能确保「刷新 + 播放」从头开始；⑤ 不能点击内容任意位置从该处开始播放。根因是**阅读位置没有统一模型**：播放用 transform、滚动条只在编辑态出现、每次输入都把 `offset` 归零。

**具体实现方式**：

1. **底部布局** — `#controlBar` 由 `flex + flex-wrap` 改为 CSS Grid `repeat(6, minmax(0,1fr))`，6 个按钮等宽排第一行；`#speedWrap` 从中间移到 DOM 末尾并设 `grid-column:1 / -1` 独占第二整行。三段分别固定：标签 `flex:0 0 auto`、滑块 `flex:1 1 auto; min-width:0`、像素数值 `flex:0 0 auto; white-space:nowrap; min-width:76px`。≤360px 降为 3 列。速度滑块与「像素/秒」数值不再被右侧按钮挤压、遮挡或折行。
2. **内容区滚动条** — `#viewport` 默认 `overflow-x:hidden; overflow-y:scroll` 并配可见的 `::-webkit-scrollbar` 样式；只有 `#app.playing #viewport{overflow:hidden}` 在播放时关掉，改用 transform 平滑滚动。初始、暂停、编辑三种状态都可自由滚动查看全文。
3. **暂停 / 继续** — 新增 `setPlaying(on)`：切 `.playing` class、同步 `viewport.scrollTop`、按状态重算 transform、更新 ▶/⏸ 文案；原先散落的 7 处 `playing = ...`（语音跟随 4、遥控 2、编辑提交 1）全部收敛到它。`togglePlay()` 播放中点击 → 暂停、保留 `offset`、恢复滚动条并提示；再点 → 从 `offset` 继续，不回开头。滚到底自动 `setPlaying(false)` 停在末尾。
4. **刷新归零** — 新增 `resetReadPosition()`：`offset=0` + `viewport.scrollTop=0` + `setPlaying(false)` + `placeCaretAtStartDOM()`（把输入光标/选区放到讲稿开头）。`resetScroll()` 调它后给 `resetDone` 提示，保证「刷新 + ▶」必定从头播放。
5. **点击定位** — 新增 `seekAtClientY(clientY)`：用 `scrollText.getBoundingClientRect().top` 反推内容坐标（播放态已含 `-offset` 变换、浏览态已含 `scrollTop`，两种模式都成立），`offset = clamp(contentY - viewport.clientHeight * 0.2, 0, maxOffset())`，让所点行落在视口上 1/5 处。浏览态同步 `scrollTop` 并提示「点 ▶ 从这里开始」；播放态保持播放、直接跳到新位置并提示。拖选文字（selection 非折叠）时跳过以免误跳。另加 `viewport` 的 `scroll` 监听，把非播放态的手动滚动同步回 `offset`。
   **配套**：删掉 `commitMainEdit()` 与设置面板 `setScript input` 里「一改字就 `offset=0`」的旧逻辑，改为 `clampOffset(offset)` 保持阅读位置。

**怎么验证**：`npm run test:ios` **69/69**（本轮新增 24 项：Grid 布局、DOM 顺序、⏸ 入口、暂停保位、暂停恢复滚动条、继续播放、滚动同步、点击定位换算 / 提示 / 播放中定位、刷新归零 + 光标回开头 + 刷新+▶）、`npm test` **126/126**、`node test_i18n_real.mjs` **32/32**、`npm run smoke:worker` **18/18**。五语新增 4 键（189→193），三个测试硬编码键数同步。

**涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、`CHANGELOG.md`、`【上线清单】…md`。

---

## 2026-11-15 · fix(desktop) — 长稿溢出无滚动条 / 桌面剪贴板被拒时粘贴失败

**为什么**：电脑端（WorkBuddy 内置预览面板）复测报两项：① 主屏提词区输入内容多时没有滚动条，文字溢出到编辑工具条和底部控制条区域；② 复制文字后点「📋 粘贴」被提示「无法读取剪贴板的内容」。

**改了什么**：

1. `#viewport` 补 `min-height:0`（flex 子项默认 `min-height:auto`，会被 contenteditable 的长内容撑破整个 `#app` 布局）；进入编辑态时给 `#app` 加 `.editing`，提词区改为 `overflow-y:scroll` 并配上可见的自定义滚动条。点 ▶ / ↺ 退出编辑态时自动还原 `overflow:hidden`，不影响原有 transform 滚动播放。
2. 编辑工具条从 `#viewport` 内部（绝对定位 `bottom:0`）移到 `#viewport` 之外，成为 `#app` 的独立 flex 行。长稿只在提词区内滚动，工具条永远固定在文字下方，不会再浮在文字中间或被滚走。
3. 粘贴按钮不再只依赖 `navigator.clipboard.readText()`：该 API 在 iframe / 内嵌预览 / 无 `clipboard-read` 权限的环境会被直接拒绝。现在读取失败时自动弹出「剪贴板兜底框」，用户按 Ctrl+V / ⌘V 用系统原生粘贴（不依赖任何 API），内容自动插入讲稿光标处；另提供「插入讲稿」按钮与「取消」。`readText` 可用时仍走原自动粘贴路径，iOS 系统长按粘贴不受影响。
4. 五语文案：新增 4 个键（185→189）；`editPasteFail` 去掉「长按系统菜单」这种只适用于手机的措辞，`editHint` 补上「内容较长时可在提词区内上下滚动」。

**怎么验证**：`npm run test:ios` **45/45**（本轮新增 14 项：布局 CSS、工具条父节点、编辑态开关、兜底框弹出 / Ctrl+V / 按钮插入 / 取消、readText 正常路径）、`npm test` **126/126**、`node test_i18n_real.mjs` **32/32**、`npm run smoke:worker` **18/18**。

**涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、`CHANGELOG.md`、`【上线清单】…md`。

---

## 2026-11-15 · fix(ios) — 第三轮真机问题：刷新按钮 / iOS 语音跟随误弹升级会员

**为什么**：iPhone Safari 复测又报两项：① ▶ 旁边的 ↺ 刷新按钮点了没反应；② 🎤 语音跟随点开是「升级会员」界面，没有说明苹果手机暂无此功能、安卓手机可用。

**根因与改法**
- ① `resetScroll()` 逻辑本身正确（`offset=0` + 暂停），但短稿或本来就在开头时视觉上零变化；而且 `commitMainEdit()` 每次输入都会把 `offset` 归零，刷新按钮经常「无事可做」；iOS 焦点在 contenteditable 时第一次点击还可能被吞。现在点 ↺ 会先退出编辑态（隐藏工具条 + blur）、停止语音跟随、清 `lastTs`，并给 `resetDone` toast「已回到开头。点 ▶ 可重新播放」。
- ② `renderVoiceUI()` 原先把 `if (!isPro())` 排在 `!speechSupported()` 之前：免费 iOS 用户只看到「语音跟随为 Pro 权益」，而已经写好的 `voiceIosHint`（iPhone / iPad 不支持、请改用 Android 或桌面 Chrome）被 `hidden` 永远挡住；点「开始语音跟随」又走 `startVoiceFollow()` 的 `!isPro()` 分支直接 `openProSheetSafe()` 弹出升级界面。现在**设备可用性判断优先于付费门禁**：iOS / 无 Web Speech API 的设备打开面板即显示「当前环境不支持语音识别」+ 醒目黄色说明卡（明确苹果暂无、安卓可用），开始按钮禁用并改为「此设备暂不可用」，点开始**绝不弹升级界面**；Android Chrome + 非 Pro 仍走原有付费门禁，不影响后续商业化。
- 五语新增 `resetDone` / `voiceUnavailable` 两键（183→185，三个测试硬编码键数同步更新）；🎤 图标 title 在 iOS 下带完整说明；两个不支持提示框改为醒目卡片样式。

**怎么验证**：`npm run test:ios` **31/31**（新增 13 项断言：刷新归零/反馈/退出编辑态、iOS 不显示升级文案、iOS 说明块含 iPhone 与 Android、按钮禁用、点开始不弹升级、Android 非 Pro 付费门禁仍生效）；`npm test` **126/126**；`test_i18n_real.mjs` **32/32**；`smoke:worker` **18/18**。**仍需 iPhone 真机复测**。

**涉及文件**：`index.html`、`verify-ios-editor.mjs`、三个测试文件、`【上线清单】…md`。

---

## 2026-11-15 · fix(ios) — 第二轮真机问题：播放 / 粘贴 / 底部按钮

**为什么**：第一轮修复部署后用户在 iPhone Safari 复测又报 5 项：① 输入后点播放、再把光标放回开头、再点播放没反应；② iOS 在光标旁弹出的系统「粘贴」预览点了无效；③ 粘贴按钮连点第二次没反应；④ 粘贴按钮像是只唤起 iOS 系统粘贴，必须长按再选；⑤ 右下角只露出半个 ⚙。

**根因与改法**
- ① `togglePlay` 只做布尔取反：`offset` 已滚到底时下一帧立即自动停，看起来就是「点了没反应」；此前 `focus` 还会无条件把 `playing` 置 false。现在点播放先退出主屏编辑态（隐藏工具条 + blur，避免 iOS 焦点回弹），已到底则 `offset=0` 重头开始；内容不足一屏时给明确 toast 而不是静默不动。只有真正改动文字（input/paste）才暂停滚动，单纯定位光标不再打断播放。
- ②③ `paste` 事件原先 `preventDefault()` 再用 `document.execCommand('insertText')` 插入，这一套在 iOS Safari 上会吞掉系统原生粘贴；粘贴按钮则 `textContent = txt` 整篇覆盖，第二次点内容一模一样，看起来没反应。现在 **paste 绝不 preventDefault**，交给浏览器原生插入（系统菜单 / 剪贴板预览气泡都能用），富文本兜底压成纯文本；粘贴按钮改为读剪贴板后在**保存的光标 Range 处插入**，可连续点连续粘，并给「已粘贴」toast。
- ④ 读剪贴板失败时不再卡住，明确提示用系统长按粘贴（此时该路径已可用）。
- ⑤ `#controlBar` 会被 flex 压缩，且 7 个元素在窄屏放不下，右侧图标被裁成半个。现在 `flex-wrap:wrap` + `flex-shrink:0` + 底部安全区 padding；≤480px 时速度条独占第二行，6 个按钮完整留在第一行。
- 另修一处隐藏缺陷：`togglePlay` 在顶层、`leaveEditMode` 在 `init()` 内部，跨作用域取不到，已改为直接操作 DOM。

**怎么验证**：新增常驻回归 `npm run test:ios` **18/18**（含 paste 不 preventDefault、连续粘贴、播放重头开始、控制条 CSS 断言）；`npm test` **126/126**；`node test_i18n_real.mjs` **32/32**；`npm run smoke:worker` **18/18**。五语新增 `editPasteOk` / `editNoScroll` 两键（181→183，三个测试里的硬编码键数同步更新）。**仍需 iPhone 真机复测**。

**涉及文件**：`index.html`、`package.json`、`verify-ios-editor.mjs`（新增）、三个测试文件、`【上线清单】…md`。

---

## 2026-11-15 · fix(ios) — 主屏提词区在 iPhone 上可删 / 可粘 / 可输入 / 可导入文件

**为什么**：用户在 iPhone Safari 做第 0 步真机试用时发现，屏幕上那段「在这里粘贴你的讲稿……」既删不掉、也粘不进、打不了字，还打不开约定格式的文件。三层原因：① 那段文字是 `#scrollText` 的 `textContent`（只读展示区），主屏根本没有输入入口，导入按钮只藏在设置抽屉里；② `<meta viewport>` 带 `maximum-scale=1, user-scalable=no`，而设置面板输入框字号只有 15px，iOS 聚焦时的强制缩放与「禁止缩放」冲突，键盘弹起后文本框错位、点不中；③ 隐藏的文件输入用 `position:absolute; left:-9999px` 放在 `overflow:auto` 抽屉里，iOS 上系统文件选择器可能弹不出来。

**改了什么**
- 主屏提词区改为 `contenteditable`，点一下即可直接删改、粘贴、输入；`input` 时只把内容同步进数据模型与设置面板 textarea，**绝不回写 DOM**（否则 iOS 中文输入法合成中光标被打回开头，表现为「打不出字」）。
- 新增主屏编辑工具条：`📋 粘贴`（用户手势内读剪贴板，失败退回系统长按粘贴）、`📂 从文件导入讲稿`（`<label for>` 原生触发，复用既有 TXT/MD/CSV/SRT/VTT/DOCX/ODT/XLSX 解析与 3 篇额度门禁）、`🗑 清空`、`完成`；进入编辑自动暂停滚动。
- 空稿改用伪元素占位提示，不再是真实内容；修掉成片卡里 `getActiveContent() || defaultScript` 的回退，删掉后不会自己冒回来。
- viewport 去掉 `maximum-scale` / `user-scalable=no`，补 `viewport-fit=cover`；输入控件统一 `font-size:16px !important`；文件输入改 `position:fixed` 到视口角落。
- 五语各新增 6 个编辑键（175 → 181），同步更新三个测试里硬编码的键数。

**怎么验证**：`npm test` 126/126、`node test_i18n_real.mjs` 32/32、`npm run smoke:worker` 18/18；另用 jsdom 临时脚本验证 23 项（contenteditable、输入双向同步、清空占位、纯文本粘贴、导入 label、五语键齐全、无运行错误）。真机复测：iPhone Safari 打开 Pages 地址，点大字段直接删改 / 长按粘贴 / 打字，再点「从文件导入讲稿」选一个 `.txt` 或 `.docx`。

**涉及文件**：`index.html`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、`CHANGELOG.md`。

---

## 2026-11-15 · fix(docs) — 修正阶段 1.2 登录命令与本机 wrangler 版本不匹配

**为什么**：上一条写入的 `wrangler login --device` 是 4.x 专属功能；本机实测 `npx wrangler login --help`（3.114.17）只有 `--browser` / `--scopes` / `--scopes-list`，照抄会直接报错。用户已在电脑端登录 Dashboard，但 `wrangler whoami` 仍显示未认证，需要一个 3.x 能跑通的授权步骤。

**改了什么**
- 阶段 1.2 改为 `npx wrangler login --browser=false` + `npx wrangler whoami`：打印 OAuth 链接 → 粘贴到已登录的浏览器 → 点 Allow → `localhost:8976` 回调。
- 明确「Dashboard 登录 ≠ CLI 已授权」；标注 `--device` 仅 4.x 可用，且**不要为登录升级 wrangler**（会破坏 `wrangler.dev.toml` / `smoke:worker` 兼容性）。
- 凭据边界补上 OAuth 链接里的 `state` / `code_challenge` 同样不可外发；备用 API Token 方案的触发条件改为「授权页打不开或回调失败」。

**怎么验证**：`npx wrangler --version` → 3.114.17；`npx wrangler login --help` → 无 `--device`；`npx wrangler whoami` → 授权前显示 `You are not authenticated`。纯文档改动，未动代码。

**涉及文件**：`【上线清单】从账号到真机收银台_2026-11-15.md`、`CHANGELOG.md`。

---

## 2026-11-15 · docs — 上线清单阶段 1.2 补 Wrangler 手机授权流与凭据边界

**为什么**：用户已在手机完成 Cloudflare 注册，但本机 `dash.cloudflare.com` 的 Turnstile 曾出现 Challenge loop；清单原写的 `wrangler login`（默认开电脑浏览器做 OAuth）在这台机器上很可能走不通。官方 Wrangler 文档提供 `--device` 设备授权流，可在手机上完成批准，正好绕开该障碍。

**改了什么**
- `【上线清单】…md` 阶段 1.2：把 `wrangler login` 改为 `npx wrangler login --device --browser=false` + `npx wrangler whoami`，写明在手机打开 `dash.cloudflare.com/oauth2/device` 输入 code（5 分钟有效）、无需 localhost 回调；说明账号在云端、手机注册后无需迁移会话。
- 新增「凭据边界」注记：邮箱验证链接 / OAuth 链接 / 验证码 / API Token / `BOT_TOKEN` 一律不进对话，只有公开 `*.pages.dev` / `*.workers.dev` 可分享；附备用方案 `CLOUDFLARE_API_TOKEN`（"Edit Cloudflare Workers" 模板）。

**怎么验证**：纯文档改动，未动任何代码与测试断言，故未重跑 `npm test`。

**涉及文件**：`【上线清单】从账号到真机收银台_2026-11-15.md`、`CHANGELOG.md`。

---

## 2026-11-15 · docs — 新增《上线清单：从账号到真机收银台》

**为什么**：代码与本地测试已全绿，但「账号 → BotFather → 云端部署 → 真机收银台」这条链一直散落在 `README_deploy.md` 的各模块章节里，且部分章节口径过期（`CONFIG.VERIFY_URL`、P4 悬赏、§9.4 的 `credits_pro`）。用户正在解决账号与 bot 问题，需要一份能按顺序照着执行、并明确「哪些阶段现在就能做、不用等 bot」的清单。

**改了什么**
- 新增 `【上线清单】从账号到真机收银台_2026-11-15.md`：阶段 0–6 共 6 个可勾选阶段。阶段 0 写明号码选择（+86 的 SMS Fee、VoIP 风险、明确劝阻使用 `986-910` 那张美国卡）、注册后必做的 2FA/邮箱/用户名；阶段 1–2 强调 Cloudflare 部署零 bot 依赖、可与账号问题并行；阶段 3 生产 + 测试两套 bot；阶段 4 密钥与 webhook；阶段 5 测试 Stars 免费真机全链路；阶段 6 切生产与上线判定标准。
- 写进两个此前文档没覆盖的实操坑：① `BOT_API_TEST` 只让 `createInvoiceLink` / `refundStarPayment` 走 `/test/`，**`setWebhook` 是手写 curl，测试环境必须手工加 `/test/`**；② 测试环境 `initData` 用测试 bot token 验签，同一套 Worker 不能同时跑生产与测试，需整套切换 `BOT_TOKEN`，换 secret 无需重新 deploy。
- 附「一页速查：所有要填的值」「常见失败对照表」「旧手册口径校正表」；明确 126 项全绿 ≠ 能收钱，上线判定标准是真机生产闭环跑通一次。
- `README.md` / `README_deploy.md` 加入口链接；修正 `README.md` 进度表 P3 仍写「前端收银台未接」的过期描述。

**怎么验证**：纯文档改动，未动任何代码。`npm test` → **126 / 126**；`node test_i18n_real.mjs` → **32 / 32**（五语各 175 键）。代码未变，`smoke:worker` 无需重跑。

**涉及文件**：`【上线清单】从账号到真机收银台_2026-11-15.md`（新增）、`README.md`、`README_deploy.md`、`CHANGELOG.md`

---

## 2026-11-11 · feat — 前端接通 Telegram Stars 官方收银台 + Bot API 测试环境可配置

**为什么**：此前「升级 Pro」按钮只弹「即将上线」，后端 `/payments/invoice` 与 webhook 记账虽已写好并测过，但用户没有任何入口真的付钱——等于零收入。另外 `README_deploy.md §9.4` 与 `payments-client.js` 的示例仍写 `credits_pro` 积分包，照抄会买了积分却不解锁 Pro。

**改了什么**
- **单文件内接通收银台**：Pro 权益页月付／年付可点选（默认月付，避免误买 4000⭐），点「升级 Pro」→ 带 `initData` 请求 `/payments/invoice` → `Telegram.WebApp.openInvoice()` 拉起官方付款弹窗 → 处理 paid / cancelled / failed / pending。
- **权益红线**：`openInvoice` 回调报 `paid` **绝不**直接写 `state.isPro`；只通过 `confirmProAfterPay()` 轮询 `/payments/pro-status` 由服务端确认（webhook 落库可能滞后，按 0 / 0.8 / 1.6 / 2.4 秒回查）。
- **商品白名单**：`proProductId()` 只放行 `pro_month` / `pro_year`，用 `hasOwnProperty` 挡住 `__proto__` 等原型链键；修正文档与注释里的 `credits_pro` 示例。
- **前置降级**：未配 `API_BASE` / 不在 Telegram / 无 `initData` / 旧版客户端无 `openInvoice` 时给出对应提示且**不发请求**；下单失败、取消、客户端抛错都恢复按钮；`payInFlight` 防重复下单。
- **五语各新增 9 个支付文案键**（166 → 175）。
- **后端支持官方测试环境**：新增 `botApiUrl(env, method)`，`BOT_API_TEST=1` 时走 `/bot<token>/test/METHOD`（测试 Stars 免费），`BOT_API_BASE` 可指向自建 Bot API Server；`createInvoiceLink` 与 `refundStarPayment` 均改走此函数。

**怎么验证**
- 新增 `p3-payments/test-checkout.mjs` 16 项：静态契约、五语键集、白名单／原型链、状态归一化、套餐选择、四种前置校验、成功链路、年付商品、服务端未发货不解锁 Pro、取消／失败／pending、下单失败、防重复、openInvoice 抛错、Bot API 三态地址。
- `npm test` → **126 / 126**；`node test_i18n_real.mjs` → **32 / 32**（五语各 175 键）；`npm run smoke:worker` → **18 / 18**。
- **仍未验证**：真机 `openInvoice`、真实／测试环境 Stars 付款、webhook 真实回调、真实 `refundStarPayment`。这些必须等 bot 与部署，见 `README_deploy.md §9.6`。

**涉及文件**：`index.html`、`p3-payments/payments-worker.js`、`p3-payments/payments-client.js`、`p3-payments/test-checkout.mjs`（新增）、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、`package.json`、`README.md`、`README_deploy.md`、`CHANGELOG.md`

---

## 2026-11-10 · feat — 后台退款操作台 + 退款自动撤销 Pro + 本地 Worker 真实运行时自测

**为什么**：核实发现两处缺口——① 五语 `paidNotice` 一直承诺「14 天内可经 `/paysupport` 全额退款」，但后台**没有任何退款界面或按钮**，承诺无法履行；② 即使人工退了 Stars，`users_pro` 里的订阅仍在，用户会继续白用 Pro。另外 `worker.js` 的 ROUTES 漏挂 `/admin` 前缀，已有的对账仪表盘线上其实是 404。

**改了什么**
- **后台退款界面**：`/admin` 从只读对账页升级为可操作页面，最近 20 笔每笔带「退款」按钮（二次确认）、超期提示、强制退款勾选、成功／失败状态条；地址栏里的管理密钥加载后自动清除，之后一律走 `x-admin-secret` 头。
- **新增接口**：`GET /admin/refunds`（可退款交易列表 JSON，含 14 天窗口判定）、`POST /admin/refund`（执行退款）。全部 `ADMIN_SECRET` 门禁。
- **退款铁律**：**先调 Telegram `refundStarPayment`，只有返回 `ok:true` 才写本地**。平台没退钱绝不先撤权益；API 失败／未配 token 一律 502／503 且本地状态零改动（测试专门锁死这条）。
- **同意退款后自动撤销 Pro 与积分**：`users_pro` 新增 `charge_id` 列，退款按支付号精确 `DELETE`，避免「先买月付、再买年付覆盖同一行」后退旧单误撤当前有效订阅；同时扣回仍未使用的积分（不超过余额、不追负数）、写负向 ledger、写 `refunds` 审计行（含 `forced` 留痕）。`/payments/pro-status` 随即返回 `pro:false`，前端 `checkProStatus()` 会把它回写本地缓存。
- **窗口与幂等**：默认仅 14 天内可退（与五语条款一致），超期需管理员显式「强制」并留痕；`refunds` 表 `UNIQUE(charge_id)` + 支付行 `status='refunded'` 双重防重复退款。
- **无人值守的本地自测**：新增 `wrangler.dev.toml`（假 UUID + 全假密钥，**不碰生产 `wrangler.toml` 的占位符**）、`tools/smoke-worker.mjs`、`npm run smoke:worker`。无需 Cloudflare 账号、无需 Bot、无需网络，自动幂等建本地 D1、自动拉起 workerd、跑完自动关闭。
- **修 `/admin` 404**：`worker.js` ROUTES 补 `['/admin', paymentsHandler]`。

**怎么验证（可复现）**
```
npm test                   → 110 / 110（原 96 + 新增 14 项 test-refund.mjs）
node test_i18n_real.mjs    → 32 / 32，五语键集各 166
npm run smoke:worker       → 18 / 18（真 workerd + 真本地 SQLite，从零一键跑通）
```
`smoke:worker` 验证的是 mock 测不出来的东西：真实 SQL 方言、`D1 batch`、新增 `charge_id` 列的 INSERT、`grantPro → pro-status` 真读回、`/admin` 前缀分发、真实 Pro 门禁。新增 14 项单测覆盖：14 天窗口／force、精确撤销旧单、参数校验、Bot API 参数、Pro 降级、积分扣回、重复退款、API 失败不动状态、注入防护。

**涉及文件**：`schema.sql`、`p3-payments/{payments-worker.js,payments-core.js,inmemory-payments-store.js,test-refund.mjs}`、`worker.js`、`wrangler.dev.toml`、`tools/smoke-worker.mjs`、`package.json`、`package-lock.json`、`.gitignore`、`README.md`、`README_deploy.md`、`wrangler.toml`（注释）、`【产品宪法】所有APP共同底线.md`、本文件。

**仍待验证**：本地 D1 从未连过真实 Cloudflare；`refundStarPayment` 只用 stub 测过，**没有真实 Bot Token 与真实支付号**；退款页面在真机／生产 Worker 上的交互、14 天窗口与真实系统时间的边界，都要部署后验。

> **例外留痕（按产品宪法 §3）**：底线 4 写「无人工审核队列」。退款确实需要管理员点一次按钮，但它是 Telegram Stars 条款 + 我们自己五语承诺要求履行的**低频履约动作**，不是持续流入、需要内容裁决的 UGC 审核队列；无定时任务、无待办积压、单人几分钟可完成。**退出方案**：若日后不打算承接退款，须先改窄五语 `paidNotice` 条款（不能既承诺又不给退），再下线 `/admin/refund`。**复核日期**：Stars 收银台接通当天。

---

## 2026-11-10 · feat — 免费版 3 篇上限 + 云同步数据契约 + Pro 状态修复

**改了什么**
- **免费／Pro 分层改为「容量墙」**：免费用户最多保存 3 篇讲稿，Pro 不限量；核心提词、粘贴、编辑、单文件导入**不按次数收费**。撞墙点落在「想存第 4 篇」那一刻，提示含额度数字并打开 Pro 权益页；讲稿库列表显示 `{n}/3 · 免费版额度`。
- **数据安全红线**：限额只拦「新增」。老用户／Pro 到期／退款降级后已有的讲稿一律保留、列表可见、不截断；删到额度内即可继续新建。云同步回写用户自己的数据不占新增额度。
- `addScript()`、`handleImportFile()`、`importTextAsNewScript()` 三处统一接 `guardScriptLimit()`；导入是**通用额度**而非 Pro 身份门禁，未超额时依旧免费。
- 五语新增 `scriptQuota` / `scriptLimitToast` 两键（各 164 → 166），文案用 `{max}` 占位，改常量不必改文案。
- **《产品宪法》升级 v1.1**：§2 补「墙放容量不放次数」及竞品依据；新增 §2.1「云同步数据契约」7 条——只约束系统入库格式（UTF-8 无 BOM、`\n` 统一、纯文本、`textContent` 渲染、100 KiB / 1 KiB / 200 篇上限、入口即归一化、只存 5 个字段、`updated_at` 大者胜出），**不向用户规定写作模板**；§5 补 3 条落地记录。
- **修两个 Pro 状态 bug**：① `checkProStatus()` 原本只在 `j.pro === true` 时写 true、从不回写 false，退款／到期后本地缓存的 Pro 会一直生效 → 改为服务端为唯一真相，成功响应时双向回写并落盘；网络失败保留缓存，避免临时断网误降级。② `btnProDevPreview` 原本在 `API_BASE` 为空时被 `renderProState()` 主动显示（当前正是空），任何人可一键解锁 Pro → 改为默认隐藏，仅「无后端 + URL 显式 `?dev=1`」开放，且**点击事件本身二次校验**（隐藏不等于安全）。

**为什么**
- 2026 年 B2C 竞品调研：容量型上限让转化提升约 30%，「每月 N 次使用」在消费级产品仅 5–10% 且被视为惩罚；VoicePrompter 免费 3 篇、Teleprompter Apps Ltd 免费 5 次导入都是现成验证。故放弃「每月 4 次」原方案。
- 云存储不该要求用户按格式写稿，否则新增格式工单、旧数据迁移与五语说明，与「业务逻辑简单明了」相悖；应只约束系统入库前的归一化。

**怎么验证**
- 新增 `p9-quota/test-quota.mjs` 11 项（额度边界、第 4 篇被拦且数据不变、Pro 无限、7 篇历史稿不删不隐藏、删除后恢复、导入受限、dev 开关 5 组合、服务端回写 false/true 与断网保留缓存、五语 166 键）。
- `npm test` → **96 / 96**；`node test_i18n_real.mjs` → **32 / 32**（五语键集各 166 键，无运行时错误）。
- 同步更新 `test_i18n_real.mjs` 第 11/12 项、`p8-import/test-import.mjs` 键数与导入断言、`package.json` 测试列表。

**涉及文件**
`index.html`、`【产品宪法】所有APP共同底线.md`、`test_i18n_real.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`（新增）、`package.json`、`README.md`、`CHANGELOG.md`

**已知例外（按宪法 §3 留痕）**
- 例外理由：宪法 §2 要求「付费墙后面必须先有收银台」，而 Stars 支付前端至今未接、收款主体未落地；本次按用户明确拍板先落地上限，撞墙页 CTA 仍为「即将上线」，**转化链路存在已知断点**。
- 持续人工成本：无（纯本地计数，无服务端表、无定时任务、无人工队列）。
- 退出方案：调大或移除 `FREE_SCRIPT_LIMIT`／`guardScriptLimit()` 调用即可，一行常量，不动数据结构。
- 复核日期：**Stars 收银台接通当天**，须确认撞墙 → 付费 → 解锁全链路，否则把上限调回宽松值。

---

## 2026-11-10 · feat — 从文件导入讲稿（免费 · 零依赖 · 纯本地）

**改了什么**
- `index.html` 设置页「讲稿内容」输入框下方新增「从文件导入讲稿」按钮 + 五语提示（"讲稿已经写在 Word 或记事本里？直接导入，不用复制粘贴"）+ 五语格式说明。
- 新增零依赖解析内核：扩展名白名单二次校验（不信 `accept`、ZIP 文件头复核）、UTF-8 / UTF-16 BOM / GBK 自动识别、SRT / VTT 去序号与时间码、ZIP central directory 定位 + 浏览器原生 `DecompressionStream('deflate-raw')` 解压 + `DOMParser` 只取纯文本节点（天然规避宏与外链图片）。
- 支持 `TXT / TEXT / MD / MARKDOWN / CSV / SRT / VTT / LOG / DOCX / ODT / XLSX`；**不做**旧版 `.doc`（OLE 二进制）、PDF、RTF、Pages / WPS，UI 明确引导另存为 `.docx` 或 `.txt`。
- 约束：文件 ≤ 2 MB、提取后 UTF-8 ≤ 90 KiB（与上一轮 `/scripts` 正文 100 KiB 上限对齐，避免云同步时撞 400）；清洗 CRLF / NUL / 行尾空格 / 过多空行；每类失败都有五语明确提示。
- 导入一律**新建一篇讲稿**（标题取文件名），不覆盖用户当前内容；**无 Pro 门禁**、无网络请求、无第三方库 / CDN。
- 新增 `p8-import/test-import.mjs` 15 项测试（含手工构造 STORED ZIP 跑通 DOCX 端到端、免费用户导入不覆盖原稿、悬赏运行时下线断言），已加入 `npm test`。

**为什么**
依据《产品宪法》：入口功能一律免费。导入是用户带着现成内容来的第一个动作，锁进 Pro 会在他还没体验到提词价值时撞墙；何况 Stars 收银台目前尚未接通（付费墙后面没有收银台）。坚持零依赖是为了守住「单文件、离线、不产生新运维面」。

**怎么验证**：`npm test` → 85/85；`node test_i18n_real.mjs` → 32/32，五语键集各 164 键。
**尚未验证（真机，发布前必做）**：Telegram Android / iOS / Desktop / Web 四端文件选择器行为、GBK 中文 txt、真实带表格与图片的 docx、大文件、xlsx 多工作表。若某端选不了文件，textarea 仍可复制粘贴，不影响主流程。
**涉及文件**：`index.html`、`package.json`、`p8-import/test-import.mjs`、`README.md`、`CHANGELOG.md`

---

## 2026-11-10 · refactor — 下线悬赏改稿（P4），确立所有 APP 共同底线

**改了什么**
- 新增 `【产品宪法】所有APP共同底线.md`：五条硬性底线、免费/Pro 分区规则、新功能准入 8 问、例外审批、跨 APP 共用内核、上线前后固定动作。适用于当前及未来每一个 APP。
- `worker.js`：移除 `/bounty` 路由分发与 `bounty-worker.js` import，健康检查 `modules` 去掉 `bounty`。
- `schema.sql`：移除 `bounties` / `bounty_submissions` / `bounty_awards` 三张表及 5 个索引；顺带清掉 `credits_ledger` 注释里的悬赏枚举。
- 五语 `submitNotice`（投稿提示 / 奖励不予发放）从 `index.html` 内联字典与 `p7-compliance/i18n.js` 一并删除；`getDisclaimerText()` 不再返回该字段，合规测试相应改为断言「字段已消失」。
- `p7-compliance/test-compliance.mjs`、`p2-credits/test-credits.mjs` 里残留的悬赏测试字符串改为中性值。

**为什么**
悬赏是全项目唯一的「双边市场 + UGC + 积分托管 + 需人工裁决」模块。公司只有一人且要陆续推多个 APP，这类功能会持续产生工单与审核责任，与「业务逻辑简单明了、不能造成混乱」冲突。前端本来就没接过悬赏 UI（全文件仅 2 处注释/文案），下线成本极低。

**边界说明（重要）**
- 按既定方案**只做运行时下线**，`p4-bounty/` 目录与其 6 项单测保留为存档，仍在 `npm test` 列表里跑（保证存档代码不腐烂），但不挂路由、不建表、不进健康检查、不参与部署。
- `/compliance/report` 举报/反馈入口**保留**：它是通用反馈与合规兜底，零人工队列成本。

**怎么验证**：`npm test` → 70/70；`grep -rn "submitNotice" index.html p7-compliance/` → 仅剩测试断言一处。
**涉及文件**：产品宪法、`worker.js`、`schema.sql`、`index.html`、`p7-compliance/{i18n.js,compliance-core.js,test-compliance.mjs}`、`p2-credits/test-credits.mjs`、`CHANGELOG.md`

---

## 2026-11-10 · fix — /scripts 写入配额与长度上限（防撑爆 D1 免费额度）

**改了什么**
- 后端 `p6-enhance/enhance-worker.js`：`/scripts POST` 新增四层拦截（只作用于该路由，其余路由行为不变）
  1. 请求体 ≤ 256 KiB：`readJsonLimited()` 先按 Content-Length 快速拒绝，再按 `TextEncoder` 实测 UTF-8 字节复核（防伪造 header / chunked 无长度），超限 413 `payload_too_large`。
  2. 字段类型：`title` / `content` 必须为字符串，否则 400 `invalid_fields`（防非字符串绕过字节计算、防异常值写入 D1）。
  3. 长度：正文 ≤ 100 KiB、标题 ≤ 1 KiB（按 UTF-8 字节，中文 3 字节/字），超限 400 `content_too_long` / `title_too_long`。
  4. 每用户 ≤ 200 篇：`D1EnhanceStore.countScripts()` 走 `SELECT COUNT(*) ... WHERE user_id = ?`，**仅新增时检查**，超限 409 `script_limit_reached`（响应带 `limit`）；更新已有讲稿不消耗配额。
  - 校验顺序：读体 → 验签 → 字段类型/长度 → Pro 门禁 → 配额 → 写库。非法 initData 仍 401、非 Pro 仍 403、越权读写仍 403。
- 前端 `index.html`：
  - `syncScripts()` 单篇失败时停止后续上传，但**仍执行 `saveState()`** 把已成功拿到的 `cloudId` 落盘，再抛出错误。修掉「限流后刷新页面重复新增 → 再次撞上限」的死循环。
  - `renderSyncStatus('err', detail)` 把后端 error code 附在状态文案后，便于诊断（不再只有笼统的「同步失败」）。
  - 五语 `proB5` 由「无限讲稿数量」改为「本地讲稿不限量 · 云同步最多 200 篇」；只改值不加键，键集仍各 155 键。
- 测试：`p6-enhance/test-helpers.mjs` 的 mock D1 支持 `SELECT COUNT(*) AS n FROM scripts WHERE user_id`；`p6-enhance/test-scripts.mjs` 新增 7 项（5–11）：正文超长且不落库、100 KiB 边界值、标题超长、非字符串绕过、请求体超 413、200 篇配额（边界/409/更新/删除恢复/按用户隔离）、鉴权顺序不被破坏。

**为什么**
`/scripts POST` 此前只校验 `!title || content == null`，单篇可塞到 D1 单行上限 2 MB、篇数不限，是免费额度被撑爆 / 被恶意刷的真实入口；且此前全部测试都跑在本地 mock 上，从未在真实后端约束下验证过——与此前「积分异常增加数百分」属同类问题。

**怎么验证**
- `npm test` → **70/70**（原 63 + 新增 7）
- `node test_i18n_real.mjs` → **32/32 全部通过**，五语键集各 155 键
- ⚠️ 仍为本地 mock：真实 Cloudflare D1 的 `COUNT(*)` 行数计费、256 KiB 请求体在 Workers 运行时的行为、以及真机上的超限提示，需 `wrangler deploy` 后在 Telegram 内验证。

**涉及文件**
`p6-enhance/enhance-worker.js` / `p6-enhance/test-helpers.mjs` / `p6-enhance/test-scripts.mjs` / `index.html` / `CHANGELOG.md`

**仍待处理（本次未涉及）**
- 「积分异常增加数百分」的成因未查明。
- 后端从未部署：`wrangler.toml` 的 `database_id`、`BOT_TOKEN` 等仍是占位符，`API_BASE` 为空，云同步当前在前端降级为「本地模式」。

---

## 2026-11-04 · feat — 语音跟随滚动（Pro 权益 #5 · 六项全部落地）

**改了什么**
- 前端 `index.html`：
  - 控制栏新增 🎤 按钮 → 打开「语音跟随」面板（标题 / 提示 / 状态行 / 开始·停止 / 关闭）。
  - 语音跟随逻辑：用 Web Speech API 连续识别，**说话时文字随语速推进、停顿即暂停**；基于 3s 滑动窗口估算瞬时语速，复用 `mapSpeechRateToScrollSpeed`（与 `p6-enhance/speech-follow.js` 同源、已单测）映射到滚动速度；静音 > 1.2s 自动暂停。
  - **iOS 端提示**：iOS（iPhone/iPad）的 Telegram 内置浏览器（WKWebView）不提供 `webkitSpeechRecognition`，`speechSupported()` 返回 false；面板明确提示"iOS 暂不可用，请改用 Android 手机或桌面 Chrome；其余功能不受影响"。非 iOS 但不支持识别的浏览器走通用提示。
  - 纯逻辑内联复用 `speech-follow.js` 的 `clamp` / 速度映射 / `createSpeechRecognition`（保证单文件可独立运行）；新增 `voiceClamp / voiceMapSpeed / voiceBaseRate / voiceCountUnits / speechSupported / isIOS / voiceLangCode / canVoiceFollow / createSpeechRecognition / startVoiceFollow / stopVoiceFollow / renderVoiceUI` 等。
  - `pxPerSec()` 增加语音分支（voiceFollowing 时直接用 `voiceScrollPx`，不依赖 canvas）；`togglePlay()` 在语音跟随进行中改为"停止语音跟随"，避免与语音控制冲突。
  - **Pro 门禁**：`canVoiceFollow()` = `isPro()`（纯前端能力，与导出一致；生产以 `/payments/pro-status` 为准）。非 Pro 点击开始会提示并自动打开 Pro 权益页。
  - 五语各新增 **12 个键**（voiceTitle/voiceHint/voiceNeedPro/voiceStart/voiceStop/voiceStatusIdle/voiceStatusListening/voiceStatusPaused/voiceStatusUnsupported/voiceIosHint/voiceUnsupportedHint/voiceStatusLabel），键集各 **155 键**一致。
- 测试 `test_i18n_real.mjs` 新增第 27–32 项（按钮/面板存在、核心函数已定义、速度映射、pxPerSec 语音分支、Pro 门禁、不支持环境提示）。

**为什么**
- Pro 六项权益中「语音跟随」是最后一个未达用户可用的项（此前仅 `speech-follow.js` 纯逻辑 + 绑定，无前端 UI）。
- iOS 不支持是硬限制（WKWebView 无 Web Speech 识别），产品上必须显式告知用户，否则会被误认为 bug；Android / 桌面 Chrome 可正常体验。

**怎么验证**
- `npm test` → **63/63**（后端无改动，仅前端 + 前端测试）；前端回归 `node test_i18n_real.mjs` → **32/32**。
- ⚠️ 局限：jsdom 无麦克风 / 无真实 Web Speech，无法在此跑真实识别；**真机识别、iOS 提示框显隐、语速跟手效果需 `wrangler deploy` 后在 Telegram 真机（Android / 桌面）验证**；iOS 端预期为显示提示而非可用。用户计划 11-06 回北京后再研究线上部署。

---

## 2026-11-03 · feat — 字幕 / 文本导出 SRT·TXT（Pro 权益 #4 落地）

**改了什么**
- 前端 `index.html`：成片卡页新增「字幕 / 文本导出」区块，两个按钮 —— **导出 SRT 字幕** / **导出 TXT 文本**。
- 新增纯函数（不依赖 canvas，可单测）：
  - `fmtSrtTime()` 秒 → SRT 时间码（`00:00:04,200`）。
  - `splitCues()` 切句：先按换行分段，超长段在标点处就近切分（避免句子被从中间砍断），兜底硬切。
  - `buildSrt()` 按当前语速估算每句时长，生成标准 SRT（序号 / 时间轴 / 文本 / 空行，句间留 120ms 间隙）。
  - `buildTxt()` 纯文本导出（统一 `\n`、去尾部空白）。
  - `readingCharsPerSec()` 语速换算：cpm 直接换算；px 模式用字符宽估算，canvas 不可用时按 0.55em 兜底。
  - `safeFileName()` 文件名安全化（去路径与非法字符、限长 60）。
  - `canExport()` / `exportScript(kind)`：Pro 门禁 + 空稿校验，未开通 Pro 时提示并打开 Pro 权益页。
- 五语各新增 8 个键（`exportTitle/exportHint/exportSrt/exportTxt/exportNeedPro/exportEmpty/exportDoneSrt/exportDoneTxt`），键集各 **143 键**一致。

**为什么**
- Pro 六项权益中「字幕与文本导出」此前完全空白（0 行代码）。补齐后 Pro 权益达到 4/6 可用。
- 时间码是**估算值**，文案中明确写了"供剪辑参考"，不做任何准确性承诺（沿用不承诺结果的合规口径）。

**怎么验证**
- `npm test` → **63/63**；前端回归 `node test_i18n_real.mjs` → **26/26**。
- 新增前端用例 20–26：按钮存在、时间码格式（0 / 4.2 / 3661.5）、切句（短段 / 超长 / 空稿）、SRT 结构、TXT 去尾空白、文件名安全化、导出门禁（非 Pro / 空稿不可，Pro 有内容可）。
- ⚠️ 局限：jsdom 无 canvas、也无真实下载行为，**实际下载到的 .srt / .txt 文件内容需真机点一次确认**；时间与切分逻辑已由纯函数单测覆盖。

**涉及文件**：`index.html`、`test_i18n_real.mjs`、`CHANGELOG.md`、`【功能清单】…2026-10-29.md`

---

## 2026-11-03 · feat — 双设备遥控（Pro 权益 #3 落地）+ 后端 Pro 门禁

**改了什么**
- 前端 `index.html`：控制栏新增 📡「远程控制」入口 → 双角色面板（播放端 / 控制端）。
  - 播放端：创建会话（后端 `/remote/create`）→ 拿到 `sessionToken`，每 700ms 轮询 `/remote/state` 取最新指令并应用到提词器（play / pause / 调速倍率）。
  - 控制端：输入/粘贴令牌（或经 Telegram 深链 `startapp=remote_<token>` 自动进入并预填）→ 连接后发送 play / pause / speed 指令。
  - 速度指令以倍率（0.25×–4×）乘以 `pxPerSec`，停用时复位为 1×；面板含令牌复制 / 分享深链 / 停止 / 断开。
- 后端 `p6-enhance/enhance-worker.js`：`/remote/create` 验签后加 **Pro 门禁**（`users_pro` 表，未订阅返回 `403 pro_required`）；`command`/`state` 仅凭 token，控制端无需 Pro（可借朋友手机操控）。
- i18n：五语各新增 22 个遥控键（共 135 键一致）。

**为什么**
- 把"双设备遥控"从"后端就绪 / 无 UI"补全为真正可用；同时与云同步一致把托管会话限定为 Pro 权益，避免非付费占用后端资源。

**怎么验证**
- 后端 `node --test p6-enhance/test-remote.mjs`：创建（Pro→200 / 非Pro→403 / 坏initData→401）、发指令+轮询可见、非法 cmd→400、缺/错 token→401（7 项）。
- 前端 `node test_i18n_real.mjs`：新增第 16/17/18/19 项（面板存在、令牌解析 start_param/URL/裸令牌/非法、深链生成、指令应用到全局播放状态）。
- `npm test` 全绿（63/63）。

**涉及文件**：`index.html`、`p6-enhance/enhance-worker.js`、`p6-enhance/test-remote.mjs`、`test_i18n_real.mjs`、功能清单 §1.2、本 CHANGELOG。

---

## 2026-11-03 · feat — 多讲稿管理 + 云同步（Pro 权益 #2 落地）；澄清"云"的归属

**改了什么**

- **数据模型重构（单篇 → 多讲稿）**：`state.script`（单字符串）升级为 `state.scripts` 数组 `[{id,title,content,updatedAt,cloudId}]` + `state.activeScriptId`；旧版单篇自动迁移，不丢老用户讲稿。新增助手 `activeScript / getActiveContent / setActiveContent / setActiveTitle / addScript / deleteScript / selectScript / loadActiveIntoEditor / renderScriptList`。
- **讲稿库 UI**（设置面板）：讲稿列表（高亮当前、点标题切换、点 ✕ 删除，至少保留 1 篇）、「＋ 新建讲稿」、讲稿标题输入框；讲稿内容编辑实时同步当前讲稿。
- **云同步（Pro 权益，本地模式自动降级）**：纯函数 `reconcileScripts` 做本地↔云端双向合并（本地优先解决冲突、云端独有回写本地）；`syncScripts / cloudList / cloudSave / cloudDelete / canCloudSync / maybeSyncDebounced` 负责增删改即时同步与启动拉取。`renderSyncStatus` 区分：本地模式 / 非 Pro 提示升级 / 已开启 / 同步中 / 完成 / 失败。
- **后端 /scripts 加 Pro 门禁**（`p6-enhance/enhance-worker.js` + `schema.sql` 复用 `users_pro`）：未订阅 Pro 访问云端同步一律 `403 pro_required`（GET/POST/DELETE 三路由均在验签后校验），避免非付费占用云存储；mock D1 与 `test-scripts.mjs` 同步加 `users_pro` 与用例。
- **五语 i18n 新增 17 键**（讲稿库 / 云同步相关），键集保持各 **113 键**一致；新增 `.script-list` 等样式。

**为什么**

- 用户要求先实现「多讲稿 + 云同步」。顺带澄清一个误解：提词器的"云"**不是用户在 Telegram 上租的空间**——Telegram Mini App 不提供这种云存储；我们的云同步是**自建后端（Cloudflare Workers + D1）**，按用户 Telegram `user_id` 隔离存储讲稿，属于我们提供给用户的 Pro 服务。

**怎么验证**

- `npm test` → **62/62**（新增后端 `p6-enhance/test-scripts.mjs` Pro 门禁用例；前端 `test_i18n_real.mjs` 新增第 13/14/15 项：多讲稿数据模型、reconcileScripts 合并、云同步门禁）。
- 局限：jsdom 无 canvas、且本机未部署后端，真实"上传/下载到云端"需部署 `wrangler deploy` 后在 Telegram 内真机验证；本地/未配置后端时云同步正确降级为"本地模式"。

**涉及文件**：`index.html`、`p6-enhance/enhance-worker.js`、`p6-enhance/test-scripts.mjs`、`p6-enhance/test-helpers.mjs`、`test_i18n_real.mjs`、`schema.sql`、`CHANGELOG.md`、`【功能清单】…md`

---

## 2026-11-03 · feat — 实现 Pro「去水印 + 高清导出」成片卡（首个真正可用的 Pro 权益）

**改了什么**

- **成片卡导出逻辑重构**（`index.html` 的 `generateCard()`）：抽离纯函数 `isPro()` 与 `cardExportOptions()`（不依赖 canvas，便于单测）。Pro 会员导出时**去除水印**（免费版的品牌信用 + 推荐码深链），画布由 1080×1350 **放大到 2160×2700（2× 高清）**；免费版维持原样（带水印、1×）。
- **Pro 状态权威来源落到后端**（`p3-payments` + `schema.sql`）：新增 `users_pro` 表、`GET /payments/pro-status`（经 initData 验签）、webhook 收到 `pro_month`/`pro_year` 商品时写订阅（到期前有效）。前端 `checkProStatus()` 在配置后端时以服务端为准。新增 Pro 订阅商品（400⭐/月、4000⭐/年）与前端定价对齐。
- **本地预览开关（仅开发用）**：未配置后端 `API_BASE` 时，Pro 面板显示「本地预览 Pro 效果」按钮可一键切换 `isPro` 看效果；**配置后端后该按钮自动隐藏**，防止生产被 URL 参数绕过付费。
- **状态反馈**：成片卡页底部动态显示「免费版：带水印·标准分辨率」或「Pro：已去除水印·高清导出」；Pro 面板显示会员状态徽章。
- 五语各新增 6 个键（共 96 键，五语一致）：`cardExportPro/Free`、`proStatusOn/Off`、`proDevOn/Off`。

**为什么**

- 用户要求先把 Pro 里"唯一能立刻交付"的权益做出来——去水印高清导出复用现有 canvas，改动最小、风险最低，且是付费的真实价值点。
- Pro 门禁此前只有本地开关、无服务端真值，付费无法真正生效；本次把状态来源补成后端，使 Pro 后续真正可交付。

**怎么验证**

- `npm test` → 61/61 通过（含新增 `test-pro-status.mjs` 5 项：订阅写入/幂等/未知用户/过期/定价对齐）
- 前端回归 `node test_i18n_real.mjs` → **12/12 通过**（新增第 10/11/12 项：Pro 导出策略、本地预览按钮可见与文案、点击切换 isPro）
- 五语键集一致：zh=en=ja=ko=ru=**96 键**
- 局限：jsdom 无 canvas，`generateCard()` 像素级水印/高清效果需在真机（或本地点开 index.html 用本地预览开关）肉眼确认。

**涉及文件**

`index.html`（generateCard、isPro、cardExportOptions、checkProStatus、renderProState、五语新键、Pro 面板/卡片页 UI）、`p3-payments/payments-core.js`（Pro 商品）、`p3-payments/payments-worker.js`（pro-status 路由 + webhook 分支）、`p3-payments/inmemory-payments-store.js`（grantPro/getProStatus）、`schema.sql`（users_pro 表）、`p3-payments/test-pro-status.mjs`、`test_i18n_real.mjs`、`package.json`、`【功能清单】…md`、`CHANGELOG.md`

**遗留**

Pro 其余五项（语音跟随、云同步前端、遥控器、无限讲稿、字幕导出）仍未达到用户可用，下一步继续逐项实现。

---

## 2026-11-03 · feat/copy — 退款改 14 天无理由、云同步例外披露、新增免费阅读等级

**改了什么**

- **退款条款改为 14 天无理由全额退款**（五语前端 + 后端 `p7-compliance/i18n.js`）：购买后 14 天内可通过 `/paysupport` 申请全额退还 Stars，无需理由；同一账号反复申请可拒绝；并写明「本条不影响你依法享有的权利」。Pro 权益页新增一行醒目的退款承诺。
- **免责声明补「云同步例外」**（五语 + 后端）：原文「我们不会读取、上传或备份」改为「除你主动开启『云同步』外，我们不会读取、上传或备份你的讲稿」；Pro 说明同时披露「云同步默认关闭，开启后讲稿会保存到服务器以便其他设备取回」。
- **新增免费阅读等级**（`index.html`）：起步 🌱 / 星光 ⭐ 3 次 / 月光 🌙 10 次 / 日光 ☀️ 30 次 / 皇冠 👑 100 次。设置面板显示等级、进度条与晋级提示；**成片卡右上角同步绘制等级徽章**（卡片会成为传播载体）；文案五语齐全，等级名随界面语言切换。
- 功能清单新增 §1.1 付费条款、§1.2 Pro 六项权益实现状态对照、§1.3 阅读等级规格。

**为什么**

- 原「解锁后不支持退款」在欧盟/英国站不住：Stars 结账页由 Telegram 渲染，**无法插入「放弃撤回权」的同意勾选**，法定 14 天撤回权排除不掉；且 Telegram 提供 `refundStarPayment`（仅全额），官方条款要求 bot 必须能处理 `/paysupport` 与争议。主动给 14 天是唯一在主要辖区都成立的写法，工具类实际退款率极低。
- 原「我们不会上传」与 Pro 权益「跨设备云同步」**直接矛盾**，功能一上线文案就变假，故提前加例外。
- 等级是免费的纯荣誉机制：不涉及付费判断、不制造内容承诺，且挂在成片卡传播链路上可提升回访。

**怎么验证**

- `npm test` → 56/56 通过
- 前端回归 `node test_i18n_real.mjs` → **10/10 通过**（新增第 9 项：五档等级 / 英文等级名 / 短稿不计次 / 晋级提示）
- 五语键集一致：zh=en=ja=ko=ru=**90 键**

**涉及文件**

`index.html`（五语文案、Pro 页退款行、等级 UI/CSS/逻辑）、`p7-compliance/i18n.js`（五语免责声明与付费提示）、`test_i18n_real.mjs`、`【功能清单】…md`、`CHANGELOG.md`

**遗留**

Pro 六项权益**尚无一项达到用户可用**：语音跟随 / 云同步 / 遥控 / 无限讲稿有底层代码但未接前端，去水印高清与字幕导出完全空白。详见功能清单 §1.2。

---

## 2026-11-03 · copy — 客户文案重写：删除占卜类表述，改用「工具类」口径

**改了什么**

- 五语（zh/en/ja/ko/ru）免责声明、付费提示、投稿提示、Pro 权益文案全部重写，**不再出现"占卜 / 预测 / 算命 / 运势 / 黄历"等任何字样**。
- 新口径借鉴同类提词器产品（Telepromptme、Teleprompter.works、Teleprompter.com、Teleprompter for Video）的通行写法，四段结构：
  ① 工具定位（只显示并滚动你输入的文字，不替你创作/发布/评价）；
  ② 内容归属与本地存储（讲稿归你，默认只存本机，我方不读取/不上传/不备份）；
  ③ 自行备份（清数据、卸载、换设备可能丢）；
  ④ 按「现状」提供（速度与字数估算仅作参考，不对录制效果或使用后果作保证）。
- 付费提示改为：「Pro 为功能解锁（月付/年付到期不自动续费），属虚拟商品，解锁后不支持退款；支付由 Telegram 处理，我们不接触你的支付信息」。
- Pro 六项权益改写为更具体的表述（如"语音跟随：文字跟着你的语速走，停顿即暂停""导出无水印高清成片卡""双设备遥控"）。

**为什么**

提词器与占卜类产品毫无关联。**在免责声明里反复声明"不含占卜"，反而主动建立了这种联想**，等于替审核方和用户制造疑问。纯工具应用只需讲清数据、支付、责任边界。

**怎么验证**

- `npm test` → 56/56 通过
- `node test_i18n_real.mjs` → 9/9 通过（新增第 8 项：扫描五语全部文案，命中占卜类字样即失败）
- 全仓 `grep` 复查：`.js/.mjs/.sql/.html/.md` 均已无残留

**涉及文件**：`index.html`、`p7-compliance/i18n.js`、`p7-compliance/compliance-core.js`、`p7-compliance/test-compliance.mjs`、`p6-enhance/templates.js`、`p6-enhance/test-helpers.mjs`、`p6-enhance/test-templates.mjs`、`p3-payments/*`、`p4-bounty/*`、`p5-growth/*`、`schema.sql`、`README.md`、`README_deploy.md`、功能清单、`test_i18n_real.mjs`

**附带删除（重要）**

- 移除 `complianceScan()` 与内部危险词表（`p7-compliance/compliance-core.js`）：该函数**未接入任何用户流程**，是死代码，且它本身就是占卜词的最大聚集地。
- 移除 2 个相关测试（p7 危险词扫描、p5 分享文案禁用词），故测试总数 58 → 56。
- p6 模板库的质量守门改为**中性的「绝对化承诺用语」检查**（保证 / 100% / 根治 等），这对"用户照读成稿"的场景更有实际意义。

> ⚠️ 如果以后要做 UGC 内容审核（悬赏改稿、模板投稿），应重新设计一套**中性的内容政策词表**，而不是恢复旧表。

---

## 2026-11-03 · feat — 新增俄语（第 5 语言）+ 俄语环境自动识别

**改了什么**

- `I18N` 新增 `ru` 全量 **83 键**，与中文键集逐一比对一致。
- 语言下拉新增「Русский」；`SUPPORTED_LANGS` 扩为 `zh/en/ja/ko/ru`。
- 自动识别改为**优先读 Telegram 的 `initDataUnsafe.user.language_code`**，其次 `navigator.language`——俄语用户首开即见俄语，不必手动切。
- 新增 `pickSupported()` 归一化 `ru-RU` / `ru_RU` / `RU`；`curLang` 初始化加白名单校验。
- 俄语文案针对窄屏压缩：`switchUnit=Ед. изм.`、`saveAlbum=В галерею`、`shareChat=Поделиться`。
- 后端 `p7-compliance/i18n.js` 同步支持 `ru`（`/compliance/disclaimer?lang=ru`）。

**为什么**：俄语区是 Telegram 最大用户池；WebView 里 `navigator.language` 跟的是设备系统语言，`language_code` 才是用户在 Telegram 内的真实语言习惯。

**怎么验证**：前端回归 8/8；后端 58/58；五语键集校验各 83 键。

**涉及文件**：`index.html`、`p7-compliance/i18n.js`、`p7-compliance/test-compliance.mjs`、`test_i18n_real.mjs`、`README_deploy.md`、功能清单

---

## 2026-11-03 · feat — Pro 权益页 + 完成卡图片分享 + 定价 400⭐/月 · 4000⭐/年

**改了什么**

- 新增 `#proSheet` 权益页（月/年价格、Pro vs Free 对比、四语），入口在设置面板。
- 「分享到聊天」修实：原来只分享深链+文字，**PNG 图片并没发出去**；改为优先 Web Share API 分享图片本身，不支持时降级 Telegram 深链。
- 定价从 199⭐/月·499⭐ 终身，改为 **400⭐/月 · 4000⭐/年**（年付省 2 个月），走 `CONFIG.PRO_PRICE_*`。

**为什么**：原「终身 499⭐」只需 3 个月月费就回本，会杀死续费收入。新档折合 $5.6–8/月、$56–80/年，2026 竞品年费主流 $90–150，本档处行业下 1/3。

**怎么验证**：回归测试 5 项全过（价格渲染 400/4000、多语、遮罩关闭）；四语键集各 83 键。

> ⚠️ 缺口：Pro 页列出的去水印、云同步、遥控、字幕**多数尚未实现**，页面目前是"权益说明"。CTA 仅提示"即将上线"。

**涉及文件**：`index.html`、`test_i18n_real.mjs`、功能清单

---

## 2026-11-03 · fix — 语言切换后"下面还是中文"

**改了什么**

- 默认示例稿在用户**未自定义**时跟随语言切换（提词区 + 设置面板输入框同步）；用户编辑过之后不再覆盖。
- 新增 `test_i18n_real.mjs`（jsdom 真实 DOM 测试）。

**为什么**：根因不是切换失效——控件文字一直是正常切换的；是页面下方最大的**提词区**显示着中文稿，讲稿按设计不翻译，视觉上就成了"还是中文"。

**怎么验证**：真实 DOM 实测三项全过（UI 切换 / 示例稿跟随 / 自定义稿保留）。

**涉及文件**：`index.html`、`test_i18n_real.mjs`、`package.json`（加 jsdom 开发依赖）

---

## 2026-11-03 · feat — 品牌对外定名 ScriptDeck

**改了什么**：`<title>`、四语 `appTitle`、卡片水印、分享文案、下载文件名统一为 ScriptDeck；`LS_KEY` **保持 `teleprompter_state_v1` 不变**（改了会丢老用户讲稿）。

**为什么**：检索 14 个候选名，EasyPrompt / CueFlow / CueDeck / Promptr / Scriptora / Promvia 等均已被占用（EasyPrompt 有 3 个 App 在用，美区 #165 / 日区 #175），**仅 ScriptDeck 在同品类无同名**。

**怎么验证**：58/58 测试通过；i18n 键集一致。

**涉及文件**：`index.html`、`README.md`、`README_deploy.md`、功能清单、测试指南、JS 速通清单

---

## 2026-11-03 · fix — 多语言覆盖补全（切 EN/JA/KO 大量中文不动）

**改了什么**：把设置面板、控制栏、成片卡、关于页里**写死的中文**全部改为 `data-i18n`；接管速度单位、验签状态、举报状态、卡片水印等动态文案。

**为什么**：`data-i18n` 只覆盖了约 10 处，页面大量文案是硬编码，切语言只换了一小部分。

**怎么验证**：四语键集校验一致；DOM 桩实测切换生效。

**涉及文件**：`index.html`

---

## 2026-11-02 · refactor — 合并 P0+P2–P7 为单体 Worker

**改了什么**：新增根 `worker.js` 路由（`/credits` `/payments` `/admin` `/bounty` `/growth` `/scripts` `/remote` `/templates` `/compliance` `/verify`）、合并 `schema.sql`、单一 `wrangler.toml`；`shared/verify.js`、`shared/ledger-core.js` 上提；删除 12 个分模块 wrangler/schema；前端统一 `API_BASE`。

**为什么**：代码边界本身清晰，真正的 clash 风险在**部署拓扑**——6 个 Worker + P0 各带配置和 URL，而 Telegram 只支持配 1 个后端 URL。

**怎么验证**：58/58 测试通过；`node --test` 需显式列文件（目录参数在本环境不生效）。

**涉及文件**：`worker.js`、`schema.sql`、`wrangler.toml`、`shared/*`、`package.json`、各模块导入路径、`README_deploy.md`

---

## 2026-11-02 · docs — 去除跨产品目录混名残留

**改了什么**：清理功能清单中另一个产品（黄历工作目录）的残留命名，明确提词器为独立项目。

**为什么**：两个产品不应在产品文档里互相牵连。

**涉及文件**：功能清单

---

## 2026-11-02 · feat — P7 合规模块 + 多语 + 平台 Stars 对账 + 举报入口

**改了什么**：`p7-compliance/` 八个文件；`/compliance/disclaimer`、`/compliance/report`；前端内联多语切换器 + 可见免责声明 + 举报入口。

**涉及文件**：`p7-compliance/*`、`index.html`

---

## 2026-11-02 · docs — 新增 JS 学习速通清单

对照本项目代码整理的 JS 学习路径。

## 2026-11-02 · chore — 初始：README + 一键备份脚本

## 2026-11-02 · chore — 初始：P0–P6 全量恢复

Telegram Mini App 提词器 P0–P6 模块恢复，补齐 P4 悬赏改稿。
