# 变更记录（CHANGELOG）

> 用途：给非技术视角一份"每次改了什么"的可读清单，随代码一起备份到 Gitee。
> 规则：**每次 push 前在最上面追加一条**，最新在最前。每条包含：类型 / 改了什么 / 为什么 / 怎么验证 / 涉及文件。
> 详细的排查过程记在本地 `.workbuddy/memory/`（不进仓库），这里只留结论。
>
> 类型：`feat` 新功能 · `fix` 修缺陷 · `copy` 文案/合规口径 · `docs` 文档 · `refactor` 重构 · `chore` 杂项

---

## 2026-11-18 · fix — 播放结束高亮常显 + 英文点击定位落错词 + 换ID两步语义（第三十六轮）

- **类型**：fix（结束态显示 / 点击定位口径 / ID 两步流程）
- **用户反馈**：①播放结束后高亮光标仍停在最后位置且一直显示；②高亮扫过英文时未覆盖完整词、位置随机；③"换一个ID"应只换ID、名字不变，"确认换ID"才同步名字。
- **逐项结论与根因**：
  - ①**确认为需修正**：`loop()` 读完调 `setPlaying(false,true)`（keepMark），把"完成态"当成"暂停态"，黄块永久定格在最后一个词。完成态应收起，暂停才定格。
  - ②**部分确认**：英文**分词本身正确**（连续字母按整词切），播放跟随高亮也整词覆盖；真 BUG 在**点击定位**——用"词数均分 `(w+.5)/n`"算 frac，与播放跟随的"阅读权重 `tokenFracAt`"口径不一致，英文词权重=字数、长短差异大时落错词（实测 24 词中 4 词错位，标点尤甚），表现为"位置随机/高亮不在点的词上"。
  - ③**按用户新预期重做**：旧实现是"连点同一按钮两次才换 + 换时若名字=旧ID自动同步"，与预期相反。
- **改了什么**：
  - ①读完改 `setPlaying(false)`（无 keepMark）收起高亮；`reachedEnd` 保留供重播；`onReadComplete` 弹完成卡作为结束反馈。手动暂停/语音停顿仍定格。
  - ②点击定位改用 `tokenFracAt(ti)`（与高亮跟随同一权重口径），移除词数均分；整词切分逻辑不变。
  - ③新增独立"确认换 ID"按钮（默认隐藏）：点"换一个"只换 ID、名字框保持原样并显示确认按钮；点"确认换 ID"才把新 ID 填入名字框并收起按钮；用户手动改名字框则收起确认按钮。Telegram 环境仍走 `showConfirm`，去掉旧两段式 `resetIdArmed`。去掉"换 ID 时自动同步名字"的旧逻辑。
  - i18n 新增 `btnConfirmId`（七语），改 `idRegenerated` 文案为"新 ID 已生成，名字未变；确认后才同步"，键数 246→247。
- **怎么验证**：npm 147/147、iOS 编辑器 345/345（旧两段式断言改为两步语义 + 新增结束态/整词口径断言）、i18n 32/32（七语各 247 键）、Worker 18/18；真 Chrome 复验：读完 `mark:none`、英文权重口径偏差 0 且锚定整词宽度 103.7=103.7、换一个只换ID名字不变→确认才同步。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`

---

## 2026-11-18 · fix/feat — ID 流程四项：使用ID填入名字 + 换一个不用原生confirm + 预览完成卡（第三十五轮）

- **类型**：fix（Telegram WebView 原生 confirm 失效）/ feat（使用 ID、预览完成卡）
- **用户反馈**：①复制专属ID后无法粘进名字框；②点"换一个"ID 不变；③要把"复制ID"改为"使用ID"一键填入名字；④填名字后没看到"完成"按钮。
- **逐项结论**：
  - ①**非 BUG**：复制按钮本就只写剪贴板、不碰名字框，且 Telegram WebView 剪贴板常受限——真实诉求由③解决。
  - ②**确认为 BUG**：`btnResetId` 用了 `window.confirm()`，Telegram WebView 禁用原生 confirm → 点击被静默拦掉、ID 永不变（真 Chrome 复现：confirm 抛错/返回 false 时 ID 保持原值）。
  - ③功能改造，按用户要求实现。
  - ④**非 BUG**：设置页"完成"=关闭面板、编辑条"完成"=结束编辑；完成卡是"读完一篇自动弹"，与填名字无因果，故此链路本就不存在。但为回应"想立刻看效果"的诉求，新增"预览完成卡"入口。
- **改了什么**：
  - `btnCopyId` 语义由"复制 ID"改为"使用 ID"：点击把本机 ID 经名字护栏填入 `setDisplayName` + state 并保存（不再写剪贴板）。七语文案同步。
  - 换 ID 去掉 `window.confirm`：优先 `Telegram.WebApp.showConfirm`，无 Telegram 时降级为两段式点击（第一次进入"再点一次确认换 ID"待确认态、5 秒超时，第二次才换），彻底摆脱被禁用的原生弹窗。
  - 边缘修复：若用户正"用 ID 当名字"，换 ID 时名字同步更新为新 ID，避免卡上名字=旧ID、ID 行=新ID 脱节；自定义名字则不被覆盖。
  - 新增"预览完成卡"按钮 `btnPreviewFinish`：随时查看当前名字/ID/称号在卡上的效果，不改 reads、不依赖读完。
  - i18n 新增 `resetIdArm`/`idRegenerated`/`btnPreviewFinish` 三键（七语），键数 243→246；`btnCopyId`/`idCopied` 文案改口径。
- **为什么**：Telegram Mini App 明确禁用 `window.alert/confirm/prompt`，必须用 SDK 原生确认框；让"专属 ID"从展示代号升级为可一键署名的身份入口。
- **怎么验证**：npm 147/147、iOS 编辑器 338/338（+15）、i18n 32/32（七语各 246 键）、Worker 18/18；真 Chrome（390×844）复验四项全过：使用ID填入一致、两段式与 Telegram 原生确认两条路径换ID成功、预览卡显示且 reads 不变、用ID当名字换ID后名字同步；截图确认完成卡排版正常。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`
- **线上**：Cloudflare Pages 生产部署 `47c0596c`（`--branch main`），`https://teleprompter-49y.pages.dev/` 368,082 字节、sha256 `fd8a8d9d…`，与本地逐字节一致；Gitee `9cd608e`。

---

## 2026-11-18 · feat — 完成卡人格称号升级 + 名字★必填 + 本机专属 ID（第三十四轮）

- **类型**：feat（身份体系 / 成就感）/ copy（七语文案）
- **改了什么**：
  1. **人格称号从"描述句"升级为"勋章式称号牌"**：五档改为「表达新星 / 镜头新秀 / 口播实力派 / 表达艺术家 / 传奇讲述者」+ 一句荣耀宣言；完成卡上以金色圆角勋章牌呈现称号、下方单独一行宣言，成就感/自豪感显著增强（借鉴 Duolingo 人格标签、Spotify Wrapped "数据变身份"：普适性 > 排行榜，新手也有得晒）。七语全部重写。
  2. **"完成卡上的名字"设为 ★ 必填**：设置页红框 + 红色 ★ 标记，hint 改为"★ 必填"口径；保存/分享完成卡时校验，缺名字则 toast 提示并跳到设置页聚焦输入框。自动弹卡不拦，不打断提词主流程。新增名字护栏（去控制字符/换行、限 24 字）。
  3. **新增本机专属 ID**：首次启动用 `crypto.getRandomValues` 生成 `TP-` + 6 位 base32（剔除 0/O/1/I/L 等易混淆字符），只存本机、不上传、不参与云同步/付费；设置页可"复制 ID / 换一个"（换号二次确认并提示旧卡作废）；完成卡上名字正下方以 monospace 小字显示，作为"这张卡属于谁"的展示代号。
- **为什么**：用户要求三项里选一项做必填、并由平台分配一个只留本机的 ID 用于完成卡署名；同时人格称号要"有十足成就感自豪感"。竞品调研（Duolingo/Spotify Wrapped/SimpleX/Session）支撑了"人格化标签 + 本机身份、不上传"的设计。
- **怎么验证**：`npm test` 147/147、`verify-ios-editor.mjs` **321/321**（新增 16 项：七语新键、红色必填标记、ID 格式/本地性/补发、名字护栏、必填校验拦截与放行、称号拆分、勋章牌渲染）、`test_i18n_real.mjs` 32/32（七语各 **243 键**，+7）、`smoke:worker` 18/18；真 Chrome（CDP + 390×844）确认：ID `TP-D6FB2T`、红色 ★、缺名字被拦并跳设置、完成卡勋章牌 + ID 行 + 宣言排版无重叠（截图确认）。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`
- **线上**：Cloudflare Pages 生产部署 `30c44949`（`--branch main`），`https://teleprompter-49y.pages.dev/` 365,240 字节、sha256 `5e5c0ab3…`，与本地逐字节一致；Gitee `ead190e`。

---

## 2026-11-18 · fix — 暂停态高亮不跟新起点（黄块黏在上一篇暂停处）（第三十三轮）

- **类型**：fix + copy
- **现象**（用户实测）：导入新文稿后把光标点到开头，黄色高亮块仍停在上次暂停的那个词上（图里停在正文中部）；点 ▶ 才跳到新起点。
- **根因**：`#readMark` 是 `#viewport` 的绝对定位子元素，会随内容一起滚动；暂停时保留的是"最后一次播放帧"的像素坐标。`seekAtClientY()` 的暂停分支只更新了 `offset` / 阅读点，**没有重画高亮**（`updateReadMark()` 里有 `!playing` 早退），手动滚动同理 —— 于是黄块像贴纸一样黏在旧的字上，与"起点"错位。CDP 复现：暂停后点首行，`head` 已到 108.6、`offset` 已回 0，但 `#readMark.style.top` 仍是旧词坐标。
- **修复**：
  1. `updateReadMark(force, allowPaused)` —— 新增 `allowPaused`，暂停/浏览态也能把高亮画到"阅读点"上，作为**下次播放的起点指示**。
  2. 暂停态**点击定位**后立刻重画；**手动滚动**后重画（跟随滚动位置，≥45ms 节流）。
  3. 改字 / 改字号 / 改对齐后词元坐标失效 → 暂停态先收起黄块（再次播放或重新定位会画到正确位置）；导入 / 清空 / 切稿仍走 `resetReadHighlight()` 隐藏。
  4. 七语文案 `readMarkHint` 由"只在播放时显示"改为"暂停时同一个高亮标出下次播放的起点（点文字或滚动即可改）"，键数不变（236）。
- **验证**：npm 147/147、iOS 编辑器 305/305（新增 7 项）、i18n 32/32；CDP 真浏览器：修复前点首行后 `#readMark.style.top` 停在旧词坐标，修复后 = 首行 top 101.8（截图确认黄块落在"圆觉经原文"的"圆"上，提示"已定位到这一行"）。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`
- **线上**：Cloudflare Pages 生产部署 `fc8ff7e7`（`--branch main`），`https://teleprompter-49y.pages.dev/` 354,514 字节、sha256 `f76ed8a1…`，与本地逐字节一致；Gitee `13239f9`。

---

## 2026-11-18 · fix — 播放时高亮贴顶边划出屏幕 + 起点在首行"空等"（第三十二轮）

- **类型**：fix（两项）+ feat（播放进度条）
- **现象**（用户实测：从文件导入讲稿 → 点 ▶）：① 第一个字停留时间明显过长，之后"翻页太快"，高亮光标很快看不到；② 播放时提词区没有滚动条，看不出读到哪儿。
- **根因**（真 Chrome CDP + 手机视口取样，确有 BUG）：
  1. **高亮贴顶边**：`loop()` 里 `offset` 与阅读点 `readHeadContentY` 各自从同一个值 `+step`，两者恒等 → 被高亮那一行的屏幕位置 `tokenTop - offset` 恒在视口顶边附近；每推进一行就向上划出屏幕。实测 `markTop` 从 +101 → 0 → −85 循环，`updateReadMark` 判"滚出视口"后直接隐藏 —— 这就是"看不到高亮/像在翻页"。
  2. **首字空等**：导入后 `resetReadHighlight()` 把 `readHeadContentY` 归 0，而首行文字在 `padding-top`（2.2em≈97px）之后；播放时既没有 caret 意图也没做锚定，阅读点从 0 起步 → 先在空白内边距里空跑约 1.1 秒（文字已滚走、高亮仍钉在第一个词），越过首行后才突然恢复正常节奏。
  3. **没滚动条**：播放态 `#app.playing #viewport{overflow:hidden}` 关掉原生滚动条（位移改由 transform 承担），这一块确实没有任何位置指示。
- **修复**：
  1. 唯一真源改为阅读点：`offset = offsetForHead(readHeadContentY)`（= `clampOffset(head − 视口高度×20%)`），高亮恒落在视口 20% 的阅读线上，文稿从下方滚过；到底时 offset 钳在 max，高亮在最后一屏内继续完成。
  2. 播放起点显式锚定：无 caret 且 `offset≤0` → `anchorReadHeadToToken(0)`（阅读点落在第一个词，不在内边距里起步）；已滚动过 → `readHeadContentY = offset + 20%`，与屏幕上所见那一行一致，不闪回。
  3. 手动滚动同步阅读点（仅在 `scrollTop` 与 `offset` 不一致时同步，避免覆盖"点击定位"精心对齐的起点）。
  4. 新增 `#playProgress` 只读进度条：播放态在右侧显示滑块位置=全篇进度，暂停自动隐藏、原生滚动条恢复。
  5. `ensureReadTokens()` 收口三处重复的"按需构建词元缓存"。
- **验证**：npm 147/147、iOS 编辑器 298/298（改 3 项口径 + 新增 10 项）、i18n 32/32（七语仍 236 键）；真 Chrome（CDP + 真排版 + 390×844）场景 4/4：导入后播放 `head` 直接从首词(113)推进、`markTop` 稳定在 68–132 不再变负/隐藏、进度条可见且随进度下移；暂停手动滚 400px 后续播从 436 继续（不闪回）、读完重播从头开始、点底部定位后阅读点不被覆盖、短稿（max=0）高亮照常推进。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`
- **线上**：Cloudflare Pages 生产部署 `03185255`（`--branch main`），`https://teleprompter-49y.pages.dev/` 352,366 字节、sha256 `47170de6…`，与本地逐字节一致；Gitee `f5b6ac7`。

---

## 2026-11-18 · fix — 导入/切讲稿后光标意图残留，点播放直接判定读完（第三十一轮）

- **类型**：fix
- **现象**：设置里选一篇讲稿 → 从文件导入 → 回主界面，光标停在该讲稿末尾，点 ▶ 立刻提示结束（内容够长时会直接弹完成卡）。
- **根因**：内容被整体替换（切讲稿 / 导入）时浏览器会把 caret 甩到新内容末尾并触发 `selectionchange`，监听器把它记成 `caretSeekOffset = 全文长度`；`togglePlay()` 又把"光标位置"当作最高优先级的播放起点，于是锚点直接落在最后一个词 → 循环第一次就判定 `reachedEnd`，表现为"一播就结束"。真 Chrome（CDP）复现：导入后 `caretSeekOffset=34`（=正文长度）、点 ▶ 后 `playing=false`、阅读头瞬移到末尾。
- **修复**：
  1. 新增 `resetCaretIntentForContentSwap()`：清 `caretSeekOffset` + 开 400ms 忽略窗口；在**切讲稿**（`loadActiveIntoEditor`）、**整篇导入**（`writeImportIntoActiveScript`）、**光标处插入导入**（`insertImportedTextAtCaret`）三处内容替换前调用。
  2. `selectionchange` 监听器在窗口期内不记录播放起点（浏览器甩光标不再被误读成用户意图）。
  3. 整篇导入后 `caretToEditorStart()` 把输入光标归到开头（仅在焦点/选区本来就在提词区时执行，不抢设置页输入框的光标）。
  4. `resetReadHighlight()` 顺带复位 `reachedEnd` / `readCounted`，避免换内容后沿用"已读完"状态。
- **验证**：npm 147/147、iOS 编辑器 288/288（新增 8 项）、i18n 32/32、worker 18/18；真 Chrome（CDP + 真排版）6/6：导入后 `caretSeekOffset=null`、点 ▶ `playing=true`、阅读头从开头推进、无完成卡。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`

---

## 2026-11-18 · fix — 短稿点空白也能编辑 + 空稿播放提示（第三十轮）

- **类型**：fix（两项）
- **问题①（短稿点空白无工具条·真 BUG）**：提词区编辑面 `#scrollText` 只有 `min-height:60px`，短稿时文字下方一大片空白属于外层 `#viewport`，点在那里不落焦点 → 粘贴/讲稿库/导入/清空/完成 这条工具条不出现。修复：`#scrollText{ min-height:100% }` 让编辑面铺满提词区（播放态 `#app.playing #scrollText{min-height:0}` 复原，避免误点空白顶出工具条）；新增 `clickBelowText()` 几何判定，点文字下方空白只进编辑态、**不**设置播放起点（否则浏览器把光标贴到末尾文字，下次 ▶ 会从最后一个词开始）。
- **问题②（空稿点 ▶ 却说"继续播放"·真 BUG）**：`togglePlay()` 播放分支没有任何内容校验，空稿同样 `setPlaying(true)` 并 toast「继续播放」。修复：进入播放前拦截空稿（`getActiveContent().trim()` 为空），提示新增 `playEmpty`（七语，键数 235→236）并保持编辑态不变；有稿播放不受影响。
- **验证**：npm 147/147、iOS 编辑器 280/280（新增 10 项）、i18n 32/32、worker 18/18；另用真 Chrome（CDP + 真排版）复现确认：编辑面高度 565px = 视口 565px、点空白工具条出现、`caretSeekOffset` 不被污染、空稿点 ▶ 不播并提示、有稿正常播放。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`

---

## 2026-11-18 · fix — 高亮残留重置 + 主界面显示当前讲稿标题 + 眼睛按钮对齐（第二十九轮）

- **类型**：fix（三项）
- **问题①（高亮残留·真 BUG）**：清空讲稿或从文件重新导入后，逐词高亮的旧黄色块仍停在原位置，下次播放从旧位置续读。根因：`commitMainEdit`/`commitImportedEdit` 仅在播放中才 `setPlaying(false)`，暂停定格态下既未隐藏高亮，也未重置 `readHeadContentY` 与词元缓存。修复：新增 `resetReadHighlight()`（隐藏高亮 DOM、阅读头归零、词元缓存失效、节流时间戳归零），在导入、清空（内容变空）、切换讲稿三条路径统一调用；导入/清空同时把 `offset`/`scrollTop` 归零。普通逐字编辑不重置阅读头，保留"改字不跳回开头"体验。
- **问题②（标题未显示·功能缺口）**：主界面只显示 App 名，切换讲稿后看不到当前是哪一篇。修复：header 左侧新增 `#currentScriptTitle`，显示 `scriptTitleOf(activeScript())`；`loadActiveIntoEditor` 与 `applyI18n` 均调用 `refreshCurrentScriptTitle()`，系统标题随语言翻译、用户自定义标题保留。复用 `scriptTitleLabel` 作 title 提示，零新增 i18n 键。
- **问题③（眼睛按钮未对齐）**：档位标签原用 flex-column 占布局高度，把眼睛按钮整体上顶约 6px。修复：`#readMarkStatus` 改绝对定位脱离文档流，`#btnReadMarkWrap` 用 inline-flex，按钮本体与 A−/A+ 严格同排对齐；header 底部 padding 12→18px 容纳标签。
- **验证**：`npm test` 147/147、`verify-ios-editor.mjs` 270/270（新增 14 项）、`test_i18n_real.mjs` 32/32、`smoke:worker` 18/18。键数保持 235（本轮零新增键）。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`。

---

## 2026-11-18 · fix — 讲稿库激活态同步 + 主界面直接选用讲稿库讲稿（第二十八轮）

- **类型**：fix（激活态不同步）+ feat（主界面讲稿库入口）
- **问题一（激活态 BUG）**：在设置-讲稿库点击前两篇讲稿时，提词区内容会切换，但列表蓝色激活框始终停留在最后新建的那篇。根因是 `selectScript(id)` 只改 `activeScriptId` 并重载提词区，漏调 `renderScriptList()`，导致列表 DOM 未重绘。修复：在 `selectScript` 中补 `renderScriptList()` 与 `maybeSync()`，使数据/提词区/列表三处一次同步。验证三篇讲稿依次切换，任意时刻仅一篇高亮且与 `activeScriptId`、提词内容一致。
- **问题二（功能缺口）**：主界面编辑条原只有「从文件导入讲稿」，点开是系统文件选择器，无法从已存入讲稿库的讲稿中选用，必须进设置页。修复：编辑条新增「讲稿库」按钮 `btnQuickLib`，点击弹出 `quickLibSheet` 面板，按当前 `activeScriptId` 渲染全部讲稿（复用 `renderQuickLibList`），点选即调用 `selectScript(id)` 切换并自动关闭面板、停止播放、滚动归零。设置页讲稿库功能保持不变。
- **为什么**：截图反馈「创建第三个后激活始终是第三个、点前两篇蓝框不动」属真 BUG；主界面缺少讲稿库直选入口属可用性缺口。两处统一到 `activeScriptId` 单一激活源。
- **验证**：`npm test` 147/147、`verify-ios-editor.mjs` 256/256（新增 13 项：激活态同步 6 项 + 主界面入口 6 项 + 文案 1 项）、`test_i18n_real.mjs` 32/32、`smoke:worker` 18/18。七语新增 1 键 `quickLibHint`（234→235），四个测试文件键数断言已同步。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、`p3-payments/test-checkout.mjs`。

---

## 2026-11-17 · fix — 导入目标锁定为当前选中讲稿，不再意外新建 + 免费版本地自动保存提示（第二十七轮）

- **类型**：`fix`（用户复现的真实 BUG + 一条产品提示）
- **改了什么**：
  - 用户复现：在讲稿库选中「默认讲稿」后点「从文件导入讲稿」，系统凭空新建一篇讲稿，而不是写入选中的稿件。
  - 根因：`handleImportFile()` 采用"有光标→插入，无光标→新建"分支。从讲稿库/设置面板导入时编辑器里没有有效光标，直接落到 `importTextAsNewScript()` 新建分支。
  - 修复：导入目标**恒为当前选中讲稿** `activeScript()`。新增 `writeImportIntoActiveScript()`：无光标时整篇写入选中稿（篇数/选中 id/标题都不变，`dataset.isDefault='0'` 防止被当默认稿覆盖）；有光标时仍插到光标处保留原内容。想导入成新讲稿，须先点「新建讲稿」并选中再导入。
  - 同步改掉误导文案：`importFormats` 七语由"导入会新建一篇讲稿"改为"导入内容写入当前选中的讲稿"。
  - 新增常驻提示 `freeAutoSaveHint`（七语）：免费版讲稿自动保存在本设备、无需手动保存、不上传服务器。
- **为什么**：一个按钮两种目标违反最小惊讶原则；选中态与导入目标必须一致，否则用户以为丢稿。
- **怎么验证**：npm test 147/147、iOS 验证 243/243（新增 10 项导入目标断言）、i18n 32/32、worker 18/18。p8-import 的 change 事件全链路测试改为验证"写入选中稿 b、篇数不变、选中不变、其他稿不受影响"。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、`p3-payments/test-checkout.mjs`；i18n 键数 232→234（每语 +`importIntoActive`、+`freeAutoSaveHint`）。

---

## 2026-11-17 · refactor — 「立即同步」改为单按钮三态，本地保存与云同步语义分离（第二十六轮）

- **类型**：`refactor`（用户产品逻辑质疑后的设计调整）
- **改了什么**：用户指出"一个按钮因付费与否执行两种动作不合理"。追查发现更严重的事实：免费用户点「立即同步」时 `canCloudSync()` 为 false，按钮**根本什么都不做**——用户看到的"存到本地"是每次编辑时 `debounceSave()` 自动完成的，与按钮无关，属假按钮。按用户选定的"单按钮状态化"方案重构：
  1. 按钮只有**一个语义**（云同步入口），三态由 `renderSyncStatus()` 统一渲染：`locked`（未解锁，文案 🔒 云同步 · Pro，**不灰化、可点击**，点击弹 Pro 升级面板）/ `pending`（同步中，文案"同步中…"，按钮 disabled 防重复触发）/ `ready`（可用，文案"立即同步"，点击真正同步）。
  2. 本地保存退到状态文字表达：免费态 `scriptSyncStatus` 同时显示"云同步为 Pro 权益"与"讲稿仅保存在本设备"，不再由按钮承担"存本地"的假动作。
  3. 动态按钮/状态文字不挂静态 `data-i18n`；在 `applyI18n()`、`checkProStatus()`、dev 预览切换 Pro 后均调用 `renderSyncStatus()` 重绘，切语言/付费态变化即时同步。
- **为什么**：一个控件绑定两种语义会让用户无法预期点击结果；免费态"假装同步"更是欺骗性交互。本地保存本就是系统自动行为，用状态文字告知即可，不该伪装成手动动作。付费解锁的按钮用引导升级替代灰化，既保留转化入口又避免"灰按钮不知道为何不能点"。
- **怎么验证**：npm test 147/147、iOS 233/233（新增 13 项：单按钮/三态文案/data-mode/禁用防抖/点击弹面板守卫/切语言重绘/运行时 stub 覆盖三态）、i18n 32/32（7 语仍各 232 键，零新增键）、Worker 18/18。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`
- **附带澄清（用户第 4 问）**：云空间后台分配框架**已存在**且完整——Stars webhook 成功付款写 `users_pro`（30/365 天到期），`/payments/pro-status` 为权益唯一真相，`/scripts` 读写按 `user_id`（来自 initData HMAC 验签，不可伪造）门禁+每用户 200 篇/单篇 100KiB 配额+越权拒改+退款精确撤销；表在 `schema.sql`，测试 test-checkout/test-pro-status/test-quota/test-scripts 齐备。**但尚未端到端上生产**：`CONFIG.API_BASE` 仍空、bot/secrets/webhook 未配，真实付费→上云闭环需走上线清单阶段 3–5 才能验证。

---

## 2026-11-17 · fix — 4 个 BUG：标题保持 / 新建反馈 / 自定义取色器（第二十五轮）

- **类型**：`fix`（用户真机反馈 4 项）
- **改了什么**：
  1. **BUG1 标题丢失**：默认讲稿内容仍是示例稿时，`applyI18n()` 里 `isDefault==='1'` 分支会无条件把标题复位成「默认讲稿」，覆盖用户改过的标题（如「讲稿1」）。改为：仅当标题仍是系统文案（`titleKind==='default'` 或老数据文案命中）才随语言复位；用户已改标题（`custom`）只刷内容、不碰标题。
  2. **BUG2 新建无反馈**：新建功能本身正常，但成功时没有任何提示、新讲稿又是空标题，用户误以为「没生成」。新增 `scriptCreated` 七语键，`addScript()` 成功后弹 toast + 滚动到新讲稿 + 聚焦标题框。
  3. **BUG3 取色光标**：原生 `<input type=color>` 弹窗的圆形光标由浏览器控制，部分手机 WebView 上过大且错位。改用网页自绘取色器：预设色卡 16 色，选中项的圆形标记固定 10px、精确居中在色卡上。
  4. **BUG4 长条取色失效**：原生弹窗长条拖动在部分浏览器不改色。改用自绘「色相条 + 深浅条」（原生 range，拖动实时生效）+ HSV/HEX 纯函数转换，颜色实时写回 `state.color` 与提词样式。
- **为什么**：原生取色弹窗的内部 UI 网页无法控制，只有自绘才能根治光标大小/位置与长条失效；标题复位会把用户自定义命名悄悄改掉，属数据丢失级问题。
- **怎么验证**：npm test 147/147、iOS 220/220（新增 18 项覆盖 4 BUG：标题三档保持、新建篇数+toast、取色器 DOM/色卡/纯函数/拖动改色/点选/光标 CSS）、i18n 32/32、Worker 18/18；另用真实 Chrome CDP 端到端复现确认修复前后行为。键数 229→232（+scriptCreated/colorHueLabel/colorLightLabel 各七语）。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`

---

## 2026-11-17 · fix — 讲稿标题随界面语言切换（第二十四轮）

- **类型**：`fix`（用户真机发现的功能缺陷）
- **改了什么**：Settings 里无论切到哪种语言，讲稿标题「默认讲稿」始终显示中文。根因：标题在首次生成时按当时语言写进 `s.title` 存本地，切换语言时脚本库列表直接用这个固定值，标题输入框也只在"内容仍是默认示例稿"时才刷新——用户一旦导入或改写内容，标题就永久停在首次语言。修复：给系统生成的标题加 `titleKind`（`default`/`new`/`custom`），新增 `autoTitleKind/scriptTitleOf/refreshScriptTitles`；`applyI18n()` 里统一刷新所有**系统生成**的标题（默认讲稿/新讲稿），列表与输入框三处同步；用户手写或导入文件名的标题标为 `custom`，绝不随语言改写；老数据无标记时靠"标题文案等于任一语言的系统标题"识别并补齐标记。键数不变（229）。
- **为什么**：默认讲稿/新讲稿文案属于界面语言的一部分，切语言后理应跟着变；用户自定的标题属于用户内容，不能擅自改写。两者必须分清。
- **怎么验证**：npm test 147/147、iOS 202/202（新增 13 项：七语默认标题三处同步、用户自定标题不翻译、新建标题跟随、老数据文案识别、源码守卫）、i18n 32/32、Worker 18/18 全通过。测试过程中抓到并修复一处自引入缺陷：`custom` 是 truthy，旧判断会把它当 `new` 处理，已加显式排除。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`

---

## 2026-11-17 · feat — 状态说明移到眼睛下方常驻标签（第二十三轮）

- **类型**：`feat`（可用性微调，用户真机体验后反馈）
- **改了什么**：用户反馈三态切换后状态说明用底部 toast 显示，落在播放/设置区不顺手（`#toast` 固定在 `bottom:90px`）。改为在眼睛按钮正下方加**常驻档位标签** `#readMarkStatus`（强底色／淡下划线／已关闭），颜色与眼睛图标三档呼应（strong 主色/subtle 金/off 灰）；眼睛点击、设置面板改档、切换语言三处都实时同步标签。眼睛点击**不再弹底部 toast**——状态就地可见。为标签新增 3 个短文案键 `readMarkModeStrong/Subtle/Off`（七语齐全），键数 226→229。
- **为什么**：底部 toast 位置远离用户视线焦点（眼睛按钮在顶部），用户要点完眼睛再往下看才知道切到了哪档，违反"状态就近可见"。常驻标签让状态一目了然，不必等 toast 弹出或回忆上一档。
- **怎么验证**：npm test 147/147、iOS 189/189（新增 7 项：标签存在且在按钮后、常驻非 toast、三档 CSS、起始/三态点击标签同步、不弹 toast、设置改档同步、切语言同步）、i18n 32/32、Worker 18/18 全通过。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、CHANGELOG。

## 2026-11-17 · feat — 眼睛按钮三态循环（强底色/淡下划线/关闭）一处全包（第二十二轮）

- **类型**：`feat`（可用性增强，用户从用户视角提出，经竞品 + NN/g + Apple HIG 论证后采纳并改良）
- **改了什么**：眼睛按钮从「开/关」二态升级为「**强底色 → 淡下划线 → 关闭 → 强底色**」三态循环——点一下即可开关 + 换档，不必进设置。为规避 NN/g《State-Switch Controls》对「多状态共用一个按钮、用户得推断下一档」的警告，让按钮**自己显示当前档**：strong=主色描边、subtle=描边+底部金线、off=半透明+红斜杠（`data-mode` 驱动）；title 写明「当前档 → 下一档」，点击 toast 明确刚切到的档。设置面板下拉保留为精确入口，与眼睛按钮双向同步（下拉改档也刷新眼睛 `data-mode`）；语言切换后由 `applyI18n()` 末尾调 `syncReadMarkUI()` 恢复动态 title，不被通用 `data-i18n-title` 覆盖。三态复用原有 7 个 i18n 键，仅改文案不新增 → 仍 226 键。
- **为什么**：用户反馈「强底色/下划线设在 setting 里，希望点眼睛就能开关+换档」。论证结论——方向对（Nielsen 可见性启发式 #1：高频控制应就地可见；Apple HIG：2–5 个互斥选项应放一起并清楚显示当前选中项；竞品普遍让高亮可关可换样式），但纯三态循环有「下一击不可预期」隐患，故加视觉档位标记 + 动态 title/toast 改良。
- **怎么验证**：npm test 147/147、iOS 182/182（第 23 节改为三态循环断言：循环顺序、data-mode 视觉标记、title 当前→下一档、设置双向同步、切语言 title 恢复）、i18n 32/32、Worker 18/18 全通过。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、CHANGELOG。

## 2026-11-17 · refactor — 眼睛开关移到顶部字体按钮旁（第二十一轮）

- **类型**：`refactor`（布局微调，用户反馈）
- **改了什么**：用户觉得底部按钮太多，把 `#btnReadMark`（👁 逐词高亮开关）从底部控制条移到顶部 header 的字体缩放按钮组（A−/A+ 旁），样式与顶部小按钮统一（30×30 白底圆角）。底部控制条恢复 6 列、极窄屏恢复 3 列。功能逻辑（与设置复选框双向同步、aria-pressed、两档强度）完全不变——状态全靠 id 与 aria-pressed，不依赖所在位置。
- **为什么**：底部 7 个按钮在手机小屏偏拥挤；眼睛是高频显示开关，放顶部 A−/A+ 旁更顺手、视觉分组更合理。
- **怎么验证**：npm test 147/147、iOS 177/177（新增 3 项：眼睛在 header 内、紧邻 A−/A+ 同组、已移出底部）、i18n 32/32、Worker 18/18 全通过。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、CHANGELOG。

## 2026-11-17 · feat — 眼睛一键开关 + 高亮强度两档（第二十轮）

- **类型**：`feat`（逐词高亮可用性增强 ×2，源自竞品论证：连专业提词器都把高亮做成可关、可切换样式）
- **改了什么**：
  1. **主屏眼睛一键开关**：控制条加第 7 个按钮 `#btnReadMark`（👁），点一下即切换逐词高亮，不必进设置。与设置面板「逐词跟随高亮」复选框**双向同步**（`syncReadMarkUI()` 统一镜像两处 + aria-pressed + 开态描边/关态半透明），切换时 toast 提示开/关。控制条 6→7 列、极窄屏 3→4 列，保证 7 键完整可点。
  2. **高亮强度两档**：设置面板新增「高亮强度」选择器——**强底色**（默认，`rgba(255,196,46,.38)`+下边框，醒目好跟读）/ **淡下划线**（`.subtle`：底色降到 `.10`、下边框半透明，干扰小、适合熟练用户或视觉敏感者）。`state.readMarkStrength` 本地保存；`applyReadMarkStrength()` 只切 class 不动几何坐标，零跳变；非法值兜底 strong。
  3. **i18n 七语各 +7 键**（197→219→226）：toggleReadMark / readMarkOn / readMarkOff / readMarkStrengthLabel / readMarkStrengthStrong / readMarkStrengthSubtle / readMarkStrengthHint。
- **为什么**：竞品证据显示高亮从不做成强制（ADHD/阅读障碍/专业用户需要关闭或减弱）；我们的高亮偏醒目，越醒目越必须给关闭权。选择权早已存在于设置里，本轮把它从设置深处提到手边（眼睛图标）并增加强度档，是可感知的差异化。
- **怎么验证**：npm test 147/147、iOS 174/174（新增第 23 节 20 项：眼睛双向同步、强度两档切换、非法值兜底、源码守卫、键数 226）、i18n 32/32、Worker 18/18 全通过。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`、CHANGELOG。

## 2026-11-17 · fix — 暂停高亮定格 + 短稿逐词高亮（第十九轮）

- **类型**：`fix`（交互缺陷 ×2）
- **改了什么**：
  1. **暂停后高亮停在当前词**：旧版 `setPlaying(false)` 无条件 `hideReadMark()`、`updateReadMark` 守卫 `if(!playing)` 也隐藏，导致按暂停高亮立刻消失。改为 `setPlaying(on, keepMark)`：手动暂停 / 自然读完 / 语音停顿 / 远程暂停传 `keepMark=true` 保留高亮定格在最后一帧位置；刷新归零 / 切换文稿 / 改稿 / 停止语音仍默认隐藏旧高亮，避免定格在过期位置。
  2. **不足一屏也能逐词高亮**：旧版 `togglePlay` 的 `max<=0` 直接 toast + return、`updateReadMark` 的 `if(!(max>0)) hideReadMark()` 双重门槛，短稿高亮全程关闭。移除两处门槛——文稿 `offset` 恒为 0 不滚动，但阅读头锚点 `readHeadContentY` 仍按速度推进，高亮逐词前进（"不滚动"≠"不高亮"）。
- **为什么**：用户实测发现暂停高亮消失、短稿无跟随；均为设计门槛误伤，播放/高亮模型本身已解耦（offset 管滚动、锚点管高亮），移除门槛即可，不破坏前 18 轮的零跳变 / 定位 / 匀速逻辑。
- **怎么验证**：`verify-ios-editor.mjs` 新增第 22 节 11 项（源码守卫 + spy 计数区分"暂停保留/归零隐藏" + 短稿点击进播放态）。全套：npm test 147/147、iOS 157/157、i18n 32/32、Worker 18/18。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`CHANGELOG.md`。

---

## 2026-11-17 · fix + feat — 按字符匀速高亮 + 阅读成就完成卡裂变（第十八轮）

- **类型**：`fix`（高亮速度模型）+ `feat`（完成卡）
- **改了什么**：
  1. 【修复】逐词高亮从「按行匀速」改为「按字符匀速」。原先默认速度单位是 px，阅读头穿过每行耗时固定 → 3字行每字停留约 23 帧、30字行仅 2.3 帧（差 10 倍），短行慢、长行快。现在给每个词算阅读权重（普通字/英文词按字数、标点 0.25），穿过一行的耗时 ∝ 该行权重和，每字停留恒定、标点快速略过；归一化保证均匀文本整体时长不变、文稿仍平滑滚动零跳变。新增 `tokenWeight/tokenFracAt/tokenIndexAtFrac/paceScaleForHead`，`updateReadMark` 与点击/caret 定位共用同一权重口径。
  2. 【新功能】一篇读完自动弹「阅读成就完成卡」：用户名（Telegram 昵称，可在设置改）+ 完成篇数 + 等级徽章 + 人格化称号（五档，让新手也有得晒）+ 一句可晒文案 + 产品深链（带推荐码）。一键保存图片 / 系统分享，点遮罩或「继续提词」关闭；设置里可关。纯 canvas 本地生成，零服务端、零用户间交互（符合产品宪法底线）。借鉴 Duolingo / Spotify Wrapped「个性化数据卡：卡片关于用户本人、普适性胜过排行榜」的核心洞察——竞品提词器赛道普遍无完成卡，属差异化。
- **为什么**：用户实测发现高亮在短行/长行速度差 10 倍（诊断脚本复现），确认真 BUG；用户要求播放完一篇有完成卡承载用户名/篇数/产品链接以传播。产品宪法无完成卡条文但新功能满足其全部准入项（纯本地、无用户交互、无人工队列、复用 i18n/Pro 门禁）。
- **怎么验证**：`diagnose_pace.mjs` 复现修复前 10× 差值；`verify-ios-editor.mjs` 新增第21节（真实函数验证每字停留比值<1.5、标点快过、互逆映射）与第22节（完成卡 DOM/七语22键/名字来源/人格五档/开关/关闭/无 canvas 降级）；全套件 npm test 147/147、iOS 145/145、i18n 32/32、Worker 18/18。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`tools/diagnose_pace.mjs`、`tools/_countkeys.mjs`、`p3-payments/test-checkout.mjs`、`p8-import/test-import.mjs`、`p9-quota/test-quota.mjs`（键数 197→219）、`CHANGELOG.md`、上线清单。

---

## 2026-11-17 · fix — 空白行高亮空等根治：空白带快进（第十七轮）

- **类型**：fix（逐词跟随高亮节奏）
- **问题1（文件类型）——核实结论：符合约定，不改动**。用户反馈"Excel 能打开但此前约定不含 Excel/PDF"。核对三份权威文档：`【产品宪法】`第119行、`README.md`第70行、`CHANGELOG`第434行均明确把 `XLSX` 列为支持格式、PDF 列为不支持。当前代码白名单 `IMPORT_ZIP_EXTS={docx,odt,xlsx}`、选择器 accept 含 `.xlsx`、解析入口 `ext==='xlsx'` 与七语文案，全部一致。经用户确认：保持现状（Excel 可导入、PDF 不可导入）。
- **问题2（空白行）——核实结论：属实，是 BUG**。上一轮（第十六轮）只钳制行高 `height`，但"切到下一行的判定"与"行内 frac"仍用被空行拉大的真实 `top`，坐标系不一致：切到下一行后 `frac=(headY-真实top)/height` 为负被 clamp 到 0，高亮卡在下一行首词空等，直到阅读头爬完整段空白。诊断脚本实测：夹 2 空行→单处停留 144 帧（正常约 9 帧），末行前夹 3 空行→209 帧。
- **修复**：新增 `blankGapAhead(headY)` 检测"本行文字带末尾到下一行真实 top"的空白带；`loop()` 中阅读头进入空白带时，offset 与锚点共用同一 `step = max(正常步长, 跨完剩余空白)` 一步掠过。空白带无文字、快速掠过用户无感，逐词节奏连续；两处共用 step，文稿与高亮始终同步、零跳变。普通行距（gap≤行高×0.5）不触发，匀速逻辑不变。
- **验证**：诊断脚本复现修复前后；`verify-ios-editor.mjs` 新增第20节 8 项（真实函数调用）：修复前空等 >100 帧、修复后 <20 帧、24 词全覆盖、边界不误触发。回归全绿：`npm test` 147/147、iOS 126/126、i18n 32/32、Worker 18/18。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`tools/diagnose_blankline.mjs`、`CHANGELOG.md`。

---

## 2026-11-17 · fix — 逐词高亮四项：顶部留白 / 跳空白行 / 读完末行才停 / 文稿不跳确认（第十六轮）

- **类型**：fix（逐词跟随高亮 + 播放终点）
- **核实结论（四项均为实测确认）**：
  1. 顶部无留白（属实）：`padding-top` 仅 28px，从开头播放高亮词贴在视口顶端 32px，慢速时无缓冲。
  2. 空白行按像素扫过（属实）：行高被覆盖为"到下一行 top 的距离"，夹空行时 68px→204px，阅读头停在行尾慢慢扫。
  3. 播放过早停止（属实，最严重）：终点用 `offset>=max`（文稿底部贴视口底），实测高亮只到第 2 行/共 10 行，**81% 文稿未被高亮**就停了。
  4. "自动刷新并定位顶部三行"（核实为**不存在**，且不应新增）：播放/暂停 offset 不变、文稿零跳变，正是上一轮刚修好的行为；新增会重新引入跳变 bug。
- **修复**：
  1. `#scrollText` padding-top 28px→`2.2em`（约 1.5 行，随字号缩放），首词落在视口顶部往下 1~2 行处。
  2. `buildReadTokens` 行高钳制：取相邻行距最小值作 normalGap，gap>1.6× 判定为夹空白行并钳回，阅读头越过本行即跳下一行行首。
  3. 播放终点改 `readEndContentY()`：锚点扫过最后一行末尾才停；文稿位移仍钳在 max 不露底部空白，锚点继续前进把末行也高亮完。
  4. 问题4 保持现状（文稿不跳变），仅补回归锁定。
- **验证**：诊断 10/10；四套回归 `npm test` 147/147、iOS 118/118（新增 8 项：顶部留白、行高钳制、末行终点、末词高亮、自动暂停、文稿不跳）、i18n 32/32、Worker 18/18。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`

---

## 2026-11-17 · fix — 从头播放文稿不再"突然刷新"跳到中间；语言顺序前移非汉语（第十五轮）

- **类型**：fix（逐词高亮 / 播放起点）+ 体验（语言顺序）
- **现象1**：播放→暂停→光标移回起点→再播放，台词部分像"自动刷新"一样突然跳一下，起点从台词区顶端移到中间才开始高亮。这是第十四轮修复的副作用。
- **根因**：第十四轮用「负 offset（文稿下移约128px）」把首词推到固定在视口20%的阅读头，虽然修好了"高亮从首词开始"，但视觉上整篇文稿被推下去 = 用户看到的跳变。
- **修复**：改用**可变阅读头锚点** `readHeadContentY`（内容坐标）。起点播放时只把锚点对齐到起点词，offset 不动（文稿零跳变）；播放中锚点与 offset 同步 += 速度×dt，高亮仍恒速（匀速修复不回退）。caret 起点、点击定位、读到底重播统一走此模型，移除负 offset 机制（clampPlayOffset/minPlayOffset）。诊断脚本：文稿位移 128.6px → 0px，高亮命中词19 → 词0，锚点与文稿同步 90px/s。
- **现象2/修复**：语言下拉把中文从第1位移到 EN、Français 之后（主要用户为非汉语用户）。顺序 EN → Français → 中文 → Deutsch → 日本語 → 한국어 → Русский；`SUPPORTED_LANGS` 校验顺序不变，不受影响。
- **验证**：`npm test` 147/147、`test:ios` 110/110（新增第17节文稿不跳变/匀速/语言顺序用例）、`test_i18n_real` 32/32、`smoke:worker` 18/18。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`CHANGELOG.md`。

---

## 2026-11-17 · fix — 大视口下"刷新→播放"从第一行开始，不再跳到第三行（第十四轮）

- **类型**：fix（逐词高亮 / 播放起点）
- **现象**：播放→暂停→点刷新按钮（光标回起点）→再播放，高亮不从第一个词开始，而是固定从第三行的词（如"WorkBuddy"）开始。小视口不明显，桌面大视口必现。
- **根因**：阅读头固定在视口高度 20%（大视口约 160px），而文稿第一个词在内容盒顶部约 28px。上一轮为修"高亮过快"把起点 offset 钳在 ≥0（`clampOffset`），导致第一个词无法上移到阅读头——offset=0 时阅读头落在第 2~3 行，于是高亮从那里起。这是模型缺陷，不是主观感受（诊断脚本在 800px 视口下实测命中词索引 19）。上一轮误判为"20% 阅读头的正常表现"。
- **修复**：新增 `clampPlayOffset()`，播放起点允许**负 offset**（下限 −视口×20%），文稿先下移让第一个词正好对齐阅读头，之后再匀速上滚——这正是提词器"文稿从阅读线滚上来"的标准行为，且保持高亮匀速（阅读头位置不变）。caret 起点、点击定位、读到底重播三处统一改用 `clampPlayOffset`；重播从 `offset=0` 改为 `minPlayOffset()`；暂停态 `scrollTop` 同步改用 `clampPlayOffset`，避免负起点暂停时文稿跳回顶部。
- **验证**：`npm test` 147/147、`test:ios` 105/105（新增 6 项大视口针对性回归）、`test_i18n_real` 32/32、`smoke:worker` 18/18。诊断脚本 800px 视口从词索引 19 修复为 0。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`CHANGELOG.md`。

---

## 2026-11-16 · fix — 播放起点严格跟随当前光标；刷新后不再续播旧位置（第十三轮）

- **类型**：fix（播放起点 / 状态恢复）
- **现象1**：播放→暂停→把文本光标移到某字符前→再播放，不是从该字符开始，而是跳过 N 个字符（从暂停残留位置开始）。
- **现象2**：播放→暂停→刷新页面→把光标置于开头→再播放，却从刷新前的暂停位置续播，而非从头完整播放。
- **根因1**：`togglePlay()` 只依赖模块变量 `offset`（暂停时保留的位置），完全不读取 DOM 里用户当前的光标（caret）位置；"移动光标"这个动作从未转化为播放起点更新。
- **根因2**：刷新后浏览器的 scroll restoration 把 `#viewport.scrollTop` 还原成旧暂停位置，`scroll` 事件又把它同步回 `offset`，覆盖了"从头播放"意图。
- **改了什么**：
  1. `tokenizeForRead()` 为每个词元记录全文字符偏移 `charStart/charEnd`；新增 `caretCharOffset()`（读折叠光标的全文字符偏移）、`caretOffsetToWord()`（字符偏移→词元）。
  2. 新增 `selectionchange` 监听：暂停/浏览态下用户放置折叠光标时，把字符偏移记入 `caretSeekOffset`（一次性意图；playing 或输入法合成态不记录；每次暂停清空，避免旧位置污染）。
  3. `togglePlay()` 开始播放时优先用 `caretSeekOffset` 反算起点（与点击定位同一阅读头公式），消费后清空；其次是 `reachedEnd` 从头重播；否则保留 `offset` 续播。
  4. `init()` 禁用 `history.scrollRestoration='manual'`，并把 `offset`/`scrollTop` 归零；`resetReadPosition()` 显式标记 caretSeekOffset=0。
- **为什么**：用户明确要求"每次播放都以当前光标位置为准，不被旧状态覆盖"，把光标意图提升为播放起点的权威来源，同时保留暂停续播/点击定位/到底重播三条既有语义。
- **怎么验证**：`npm run test:ios` 99/99（新增第16节 8 项：caret 记录、字符→词映射、从 caret 播放、意图消费、刷新归零、scrollRestoration 守卫等）；`npm test` 147/147、i18n 32/32、Worker 18/18；诊断脚本实测两问题从复现到通过。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`、`CHANGELOG.md`。

---

## 2026-11-16 · fix — 暂停后点击定位续播跳到行尾/下一行（第十二轮）

- **类型**：fix（定位精度）
- **现象**：播放中点暂停 → 点击某处改光标位置 → 再点播放，高亮不从所点位置开始，而是跳到该行末尾或下一行。
- **原因**：`seekAtClientY` 只用点击的 Y 设 offset，把所点内容 Y 放到阅读头；但 `updateReadMark` 是按"阅读头在行带内的纵向比例 `frac=(headY-line.top)/line.height`"选词的。同一行所有词的 Y 相同，点击的 X（点了哪个词）完全没被使用——点在字上缘/下缘/行距会分别落到第 3/6/8 词，正是"跳到行尾或下一行"。
- **改法**：
  - `seekAtClientY(clientY, clientX)` 增加 X 参数；用 `readTokenAtPoint()` 命中点击处的真实词元（先按包围盒命中，点到空白则取所在行 X 最近的词）；再反算 offset 使阅读头的 `frac` 恰好选中该词（`headY=line.top+(w+.5)/n*line.height`）。暂停/首次点击无词缓存时按需 `buildReadTokens()`。
  - 未传 clientX 的旧调用回退到按 Y 定位，保持兼容；词缓存无效时同样回退。
  - click 事件把 `e.clientX` 一并传入。
- **验证**：`npm test` 147/147、`test:ios` 91/91（新增 7 项定位精度回归）、i18n 32/32、`smoke:worker` 18/18。诊断脚本覆盖行内不同 Y 位置/不同词，均精确命中；无 X 回退值一致。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`。

---

## 2026-11-16 · fix — 播放速度下限、高亮速率、暂停定位续播（第十一轮）

### fix(speed)：速度下限 20→5 px/s，核实无单位换算 bug

- **用户反馈**：速度拉到最低档 20px/s 仍快于汉/英跟读。
- **核实结论**：`pxPerSec()` 在 px 模式直接返回 `state.speedPx × remoteSpeedMul`；遥控倍率默认 1、语音跟随关闭时，实测推进 1 秒恰好 20px——**设置值与生效值完全一致，无单位换算或设置未应用的 bug**。问题在于 20px/s 本身就偏快（默认字号下约 140 字/分），下限设得太高。
- **改法**：px/s 与 CPM 两档滑块下限均由 20/60 降到 5/20；默认 90px/s 不变。改稿、切换讲稿不影响该值。

### fix(readMark)：高亮速率不再随文稿长度放大

- **用户反馈**：逐词高亮移动过快，怀疑是主观感觉。
- **核实结论**：**是真 bug，不是主观**。旧映射 `idx = offset / maxOffset × 总词数`，词推进速率 = 文本速率 × 内容高 / 可滚动高；短稿该倍率可达 6 倍、2 屏稿 2 倍，即高亮会明显跑在文本前面。
- **改法**：改为「固定阅读头」模型——阅读头锚定在视口 20%（与点击定位一致），先按内容坐标定位当前视觉行，再按行内横向进度逐词推进。文本以 V px/s 经过阅读头，高亮推进速率就恒等于 V，与文稿长短无关；行内 34px 跨 4 词、每行 68px 走完 8 词并连续接下一行，均已量测。

### fix(player)：暂停后点击定位再播放，从所选位置续播

- **现象**：播放中暂停→点击某处移动光标→再点 ▶，播放没从所选位置开始（末尾附近尤其明显）。
- **根因**：`togglePlay` 用 `offset >= max-1` 推断"上次读完了"，命中就把 `offset=0` 从头重播。用户点击末尾附近定位时 offset 恰好贴近 max，被误判为"读完"，所选位置被清零。
- **改法**：新增显式 `reachedEnd` 标志，只有 `loop()` 真正滚到底才置位；任何点击定位、刷新、自然重播都会清除。播放前只认这个标志，且 offset 越界时只钳制不回开头。`resetReadPosition` 同步清理该标志。
- **验证**：`npm test` 147/147、`test:ios` 84/84（新增 12 项）、`test_i18n_real` 32/32、`smoke:worker` 18/18。
- **涉及文件**：`index.html`、`verify-ios-editor.mjs`。

## 2026-11-16 · fix — 逐词高亮改为真正逐词推进；字号调节提到主屏

### fix(readMark)：从"每行固定列一个词"改为真正的逐行随词

- **现象**：上一版把探测点 x 固定在屏幕左/中/右，导致每行只有那一列的词被高亮；滚动时高亮跳到下一行同一列——不是逐词。
- **改法**：按 DOM 阅读顺序把全文切成词/字序列（英文按词、中文按字、emoji 合并），用滚动进度 `offset / maxOffset` 线性映射到词索引。滚到哪儿亮到哪儿：同一行从左到右逐词推进，行尾自动接到下一行行首；速度设置天然决定每词停留时长。
- 词位置在构建时缓存为"相对内容盒坐标"，每帧只做一次 getBoundingClientRect 换算，不拆 scrollText 的 DOM，编辑能力不受影响。
- **顺带抓到并修掉一个真 bug**：新映射里误用了不存在的 `clamp()`，异常被函数内 catch 吞掉，导致高亮在真实浏览器里被永久隐藏（jsdom 无布局测不到）。改用 `Math.max/min`，并加源码守卫测试防止复发。
- **验证**：真实 headless Chrome 用 160 词样本测 0→100% 滚动，高亮依次命中 WORD0→WORD2→WORD5→中文词，全部正常显示；tokenizeForRead 顺序经 Chrome 证实"行内 x 递增、换行回行首"。

### feat(fontSize)：字号调节提到主屏 + 统一多语言字体栈

- 设置面板早有 24–96px 滑块但藏得深，主屏 header 新增 A− / A+ 快捷按钮，点按即时改字号（每次 4px，夹紧 24–96），与滑块双向同步。
- 提词区统一用系统无衬线字体栈（PingFang SC / Hiragino / Microsoft YaHei / Apple SD Gothic Neo / Roboto / Arial…），中/日/韩/俄/拉丁字形都能正常显示。
- 字号/对齐变化时标记词缓存失效，高亮位置即时重算。

- **测试**：`npm test` 147/147（新增 3 项）、`test:ios` 75/75、`test_i18n_real` 32/32、`smoke:worker` 18/18。
- **涉及文件**：`index.html`、`p8-import/test-import.mjs`。

## 2026-11-16 · fix + feat — 导入改为光标处插入；新增逐词跟随高亮

### fix(import)：导入不再清空已输入内容

**为什么**：用户先在提词区输入 `AAAAAA`、把光标放到第三个 A 后，再导入 `4.docx`，期望文件内容插在中间；旧实现一律「新建讲稿」，原来的 6 个 A 看起来被清空了。

**做了什么**：导入按钮（设置面板 + 编辑条两个入口）在 `mousedown` / `touchstart` 阶段先抓取提词区内的选区 Range（点击会让 contenteditable 失焦）；`handleImportFile` 解析完成后，有有效光标就插到该位置并保留原文字，没有光标才新建讲稿。插入会同步数据模型与设置面板、不增加讲稿篇数（因此不受免费 3 篇限制）；连续导入会接在上一份之后。讲稿切换导致 Range 失效时自动退回新建，不会误插。

### feat(player)：逐词跟随高亮

**为什么**：用户在长稿里容易找不到「下一个该读的字」，希望有一个随速度在词间移动的下划线／底色。

**判断与做法**：词级高亮本身有必要，但**直接把文本拆成 span 会破坏刚修好的 contenteditable 编辑模型**（输入、删除、系统粘贴、光标保存都会回归）。所以采用不动 DOM 的方案：在视口阅读点（上 1/5，与点击定位落点一致）用 `caretRangeFromPoint` 取当前字符，扩成英文整词／中文单字，把屏幕坐标写进独立覆盖层 `#readMark`；文字上移后下一帧自然定位到下一词，旧词自动恢复。约 22fps 节流的只读查询，不碰内容。暂停/停止/编辑、镜像模式、不支持该 API 的 WebView 都会自动隐藏。设置面板新增开关，默认开。

**验证**：`npm test` 144/144（新增 4 项：光标插入与连续插入、失效光标退回新建、覆盖层/七语文案/降级、英文按词中文按字）、`test:ios` 75/75、`test_i18n_real` 32/32、`smoke:worker` 18/18；真实 Chrome 探针确认高亮随 offset 从 y=33px 移到 y=49.375px、停止播放后隐藏。七语各 197 键（新增 `importInserted` / `readMarkLabel` / `readMarkHint`）。

**涉及文件**：`index.html`、`p8-import/test-import.mjs`、`p3-payments/test-checkout.mjs`、`p9-quota/test-quota.mjs`、`verify-ios-editor.mjs`、`README.md`。

---

## 2026-11-16 · fix(import) — `.docx` 导入永久卡死（Chrome 解压背压死锁）

**为什么**：用户用桌面真实 `4.docx` 测试「从文件导入讲稿」，点选文件后讲稿编辑区始终空白，没有任何提示。

**根因**：真实 Word 保存的 `.docx` 内部条目全部是 **deflate 压缩（ZIP method 8）**，而原来的测试夹具只有 STORED（method 0），这条解压分支从未被真实覆盖。`inflateRaw()` 的实现是 `await writer.write(data)` → `await writer.close()` → 才开始 `reader.read()`。在 **Chrome 的 `DecompressionStream` 中可读端 `highWaterMark = 0`，写入 Promise 要等读者消费才兑现**，于是写入等读取、读取等写入，永久死锁。Node 的流实现没有这个背压时序，所以本地测试一直是绿的；用真实 Chrome 跑探针才定位到卡在 `parseImportFile` 内。

**做了什么**：

1. **`inflateRaw()` 改为边写边读** — 写入任务不 await，与读取循环并发启动；读端出错时主动 `cancel()`，压缩数据损坏时明确报 `importFail('parse')`，不再静默留空。
2. **回归测试补上真实压缩路径** — 新增 method 8 的 deflate ZIP 夹具，并注入一个模拟 Chrome 背压的 `DecompressionStream` 替身（`write()` 必须等 `read()` 才兑现）。**把旧代码放回去这条测试必然失败**，证明它确实能抓住该死锁；同时加了「deflate 载荷损坏 → 明确报解析失败」用例。
3. **真实浏览器验证** — 用用户桌面上的 `4.docx`（11,160 字节，16 个条目，全部 deflate）在 headless Chrome 中跑完整链路，成功提取 1,446 字；修复前同一探针卡死在 `kind=zip` 之后。

**怎么验证**：`npm test` 140/140（新增 2 项）、`npm run test:ios` 75/75、`node test_i18n_real.mjs` 32/32、`npm run smoke:worker` 18/18；真实 Chrome 端到端通过。

**涉及文件**：`index.html`（`inflateRaw`）、`p8-import/test-import.mjs`（背压替身 + deflate 夹具 + 2 项用例）。

---

## 2026-11-16 · fix(import) — 电脑端导入 `.doc` 讲稿从「一律失败」到真正可用

**为什么**：用户实测电脑端点「从文件导入讲稿」，选的都是 Word 的 `.doc` 文件，试了几次都不成功。查下来是三个原因叠在一起：

1. **`.doc` 原本被设计成不支持**（格式白名单里只有 `docx/odt/xlsx` 与纯文本），代码直接 `importFail('type')` —— 而 `accept` 属性也没有 `.doc`，Windows 文件对话框按扩展名过滤，用户甚至可能选不到。
2. **隐藏的 file input 藏在 `display:none` 的设置面板里**，部分浏览器（尤其 WebView）点按钮弹不出系统选择器。
3. 失败提示只显示 **2.2 秒**，长文案很容易看漏，用户感知就是「点了没任何反应」。

**做了什么**：

1. **自研 `.doc` 解析（零依赖、纯本地）** — 逐层读 OLE2 复合文档（CFB）：头部 → DIFAT → FAT → 目录项 → 流；正文从 `WordDocument` 流的 FIB 取 `ccpText` / `fcClx` / `lcbClx`，再到 `1Table`（或 `0Table`）流解析 Clx（先跳过 Prc 分片属性，取 Pcdt 的 PlcPcd），按 CP 区间把分片拼成文本。**压缩分片走本地代码页（含 GBK），非压缩分片走 UTF-16LE**，中文正常。小流（<4096 字节）走根存储的 **mini stream / MiniFAT**（真实短稿就是这个布局）。Word 6/95 与结构残缺文件退化为 `fcMin..fcMac` 近似读取。Word 控制符翻译：`0x0D`→换行、`0x07`→制表、`0x13/0x14/0x15` 包起来的**域代码整段丢弃**、图片锚点等控制符剔除。
2. **加密文档明确报错** — 读 FIB 的 `fEncrypted` 位（bit8），设了打开密码直接提示「先取消密码保护再导入」（新增键 `importFailLocked`），不是含糊的「解析失败」。
3. **扩展名降级为提示，改按文件头魔数选解析器** — `xxx.doc` 里其实是 **docx（ZIP）/ RTF / HTML / 纯文本**都能正确导入；反过来 `xxx.docx` 里其实是老 `.doc` 也能读。国内不少系统「导出 Word」实际输出的是 HTML 或 RTF，这一条把它们都接住了。
4. **新增 RTF 解析** — 按花括号组扫描，跳过 `fonttbl / colortbl / stylesheet / pict / fldinst` 等目标组，`\'hh` 按 `\ansicpg`（936/950/932/949/1251/1252）解码，`\uN` 取 Unicode，`\par/\line/\tab` 转成换行制表符。
5. **新增伪 HTML `.doc` 解析** — 只去标签取文字，`<script>/<style>/<head>` 整段丢弃，实体解码；不插 DOM、不执行脚本、不加载外部资源。
6. **二进制防护** — `.doc/.rtf` 的魔数都不认识、内容又不可打印时直接报「解析失败」，**不会把乱码灌进用户讲稿**（新函数 `importLooksTextual`）。
7. **入口修复** — file input 从设置面板搬到 `<body>` 级、并且**放在主脚本之前**（`init()` 里要绑定它，放在脚本之后会导致 `getElementById` 拿不到、点按钮完全无反应）；设置面板按钮与编辑条按钮共用一个 input，编辑条那个 `<label for>` 改成真按钮 `#btnQuickImport`。
8. **失败提示延长到 4.6 秒**（`toast(msg, ms)` 新增可选时长），文案也改成可操作的：`.doc` 相关提示、`importFailType` 改成「请用 TXT / DOC / DOCX」。七语同步，键数 **193 → 194**。

**怎么验证**：`npm test` **138/138**；`node test_i18n_real.mjs` **32/32**；`npm run smoke:worker` **18/18**；`npm run test:ios` **75/75**。新增 12 项导入用例（`p8-import/test-import.mjs` 27 项）：

- `.doc` 端到端（常规扇区链）：压缩 ASCII + UTF-16 中文 → `Hello 中文讲`
- `.doc` 端到端（**mini stream** 布局 + Clx 前的 Prc 属性块）→ `Short 短稿`
- Word 控制符：域代码丢弃、段落/单元格翻译
- 加密 `.doc` → `locked`；非 Word 的 OLE 容器 → `parse`；CFB 头截断 → `parse`
- `.doc` 其实是 docx / RTF / HTML / 纯文本，四个方向都能导入
- RTF（`ansicpg936` 中文、`\uN` 转义、`.rtf` 与伪装成 `.doc` 两种后缀）
- 伪 HTML `.doc`：样式与脚本不进正文
- **模拟真实交互**：给 input 塞入 `.doc` 文件 → 派发 `change` → 讲稿真的落库（title/content 正确、input 被清空可连选）

样本由 `tools/make-doc-fixture.mjs` 现造：按 CFB 规范逐字节写出头部 / FAT / 目录 / `WordDocument` / `1Table`，两种布局（常规扇区链与 mini stream），不把二进制塞进仓库。

**体积**：`index.html` **223,844 → 243,022 字节（+19,178）**；gzip **72,717 → 78,192 字节（+5,475）**。占 Pages 单文件 25 MiB 上限的 **0.93%**。

**涉及文件**：`index.html`、`tools/make-doc-fixture.mjs`（新增）、`p8-import/test-import.mjs`、`p3-payments/test-checkout.mjs`、`p9-quota/test-quota.mjs`、`verify-ios-editor.mjs`、`README.md`、`【产品宪法】…md`、`CHANGELOG.md`。

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
