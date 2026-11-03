# 变更记录（CHANGELOG）

> 用途：给非技术视角一份"每次改了什么"的可读清单，随代码一起备份到 Gitee。
> 规则：**每次 push 前在最上面追加一条**，最新在最前。每条包含：类型 / 改了什么 / 为什么 / 怎么验证 / 涉及文件。
> 详细的排查过程记在本地 `.workbuddy/memory/`（不进仓库），这里只留结论。
>
> 类型：`feat` 新功能 · `fix` 修缺陷 · `copy` 文案/合规口径 · `docs` 文档 · `refactor` 重构 · `chore` 杂项

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
