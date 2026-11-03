# 变更记录（CHANGELOG）

> 用途：给非技术视角一份"每次改了什么"的可读清单，随代码一起备份到 Gitee。
> 规则：**每次 push 前在最上面追加一条**，最新在最前。每条包含：类型 / 改了什么 / 为什么 / 怎么验证 / 涉及文件。
> 详细的排查过程记在本地 `.workbuddy/memory/`（不进仓库），这里只留结论。
>
> 类型：`feat` 新功能 · `fix` 修缺陷 · `copy` 文案/合规口径 · `docs` 文档 · `refactor` 重构 · `chore` 杂项

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
