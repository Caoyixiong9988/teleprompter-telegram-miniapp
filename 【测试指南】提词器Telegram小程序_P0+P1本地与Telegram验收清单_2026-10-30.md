# 【测试指南】ScriptDeck（提词器）Telegram 小程序 — P0+P1 验收清单

> **对外品牌名：`ScriptDeck`**，副标题 `Teleprompter & Cue Cards`。本文中「提词器」为品类描述词。
> 文档性质：P0（脚手架）+ P1（核心提词器零后台 MVP）的**测试与验收手册**。
> 配套交付物（由自动化任务 `a8730338-968b-4629-a025-9c3d35e8a529` 于 2026-10-30 23:00 生成）：
> - `提词器Telegram小程序/index.html`（核心提词器 MVP）
> - `提词器Telegram小程序/worker.js`（initData HMAC 验签）
> - `提词器Telegram小程序/README_deploy.md`（BotFather + Cloudflare 部署说明）
> 本指南告诉你**怎么把上面三份产物测通**。部署步骤以 README_deploy.md 为准，本指南聚焦"测什么、怎么测、Pass/Fail 判据"。
> 范围边界：P0+P1 **不含** 付费 / Stars / 悬赏 / 跨 App 积分（那些是 P2–P7）。

---

## 0. 测试前准备（一次性）

| 项 | 说明 |
|---|---|
| 运行环境 | ① 本地浏览器（Chrome/Edge，测 UI）② Telegram Desktop（测真机 Mini App）③ 可选的 Node.js（跑 `node --check worker.js`） |
| BotFather | 已创建 bot 并拿到 **bot token**（自动化只生成占位配置，token 需你填） |
| Cloudflare | 免费账号；用于托管静态 `index.html`（Pages）与 `worker.js`（Worker） |
| 测试账号 | 你自己的 Telegram 账号即可；建议再备一个"第二账号"测 initData 验签的多用户差异 |

---

## 1. 本地静态测试（无需 Telegram，先过 UI）

> 直接双击或用本地服务器打开 `index.html`。注意：脱离 Telegram 环境时，`Telegram.WebApp` 对象不存在，相关调用会被 try/catch 兜底，**UI 仍应正常渲染**——这是预期行为。

**怎么开**：
- 最简单：浏览器直接打开 `index.html`。
- 更稳（避免 file:// 限制）：在 `提词器Telegram小程序/` 目录跑 `python -m http.server 8080`，访问 `http://localhost:8080`。

**测试项（逐项打勾）**：
- [ ] 页面加载无 JS 报错（F12 控制台无 red error）。
- [ ] 顶部出现提词器主界面，控件齐全（播放/暂停/重置、速度滑块、字号/颜色、镜像开关、脚本输入框）。
- [ ] **滚动引擎**：粘贴一段文字 → 点播放 → 文字向上匀速滚动；调速滑块实时改变速度；暂停/重置生效。
- [ ] **脚本编辑器 + 本地持久化**：输入文字 → 刷新页面 → 文字仍在（localStorage 生效）。
- [ ] **镜像模式**：开启后文字水平翻转（用于物理提词支架）。
- [ ] **字号/颜色/对齐**：改动即时生效、可读。
- [ ] **结果卡（成片卡/脚本卡）**：点"生成卡片"→ 出现含文稿片段 + 应用水印 + 推荐码占位 的卡片；点"分享到聊天"在浏览器环境应**优雅失败**（弹提示"需在 Telegram 内使用"），不崩。
- [ ] 移动端视图：浏览器开 DevTools 手机模拟，布局不破版、按钮可点。

---

## 2. initData 验签 Worker 测试（P0 核心）

> `worker.js` 负责服务端校验 Telegram 传入的 `initData`（防伪造身份白嫖）。这一步必须真部署到 Cloudflare 才能完整测。

**部署**（详见 README_deploy.md）：把 `worker.js` 部署为 Cloudflare Worker，并在环境变量/配置里填入你的 bot token secret。

**测试项**：
- [ ] Worker 上线后，`/verify` 端点返回 200 且 JSON 结构正确（如 `{"valid":true/false}`）。
- [ ] **合法 initData**：从 Telegram 真机打开 Mini App 后，前端把 `Telegram.WebApp.initData` POST 给 `/verify` → 返回 `valid:true`。
- [ ] **伪造/篡改 initData**：手动改一个字符或过期时间戳再 POST → 返回 `valid:false`（证明 HMAC 校验生效）。
- [ ] **空/缺字段**：POST 空 body → 返回 `valid:false`，不 500。
- [ ] （可选）`node --check worker.js` 通过，无语法错。

> 说明：Telegram 官方文档提供一组**测试用 initData**（固定哈希），可先用工蜂/本地脚本验一遍 HMAC 逻辑再上云。

---

## 3. Telegram 真机测试（Desktop，最终验收）

**前置**：BotFather 里给 bot 设好 Mini App URL（指向 Cloudflare Pages 托管的 `index.html`）；或直接用 `t.me/<bot>?startapp` / bot 内 "Open App" 按钮。

**测试项**：
- [ ] 从 Telegram Desktop 打开 Mini App → 页面自动 `expand()` 占满窗口，无白边/滚动条异常。
- [ ] 核心提词功能在**真机 in-app 浏览器**内全部可用（滚动/调速/编辑/持久化/镜像/字号色）。
- [ ] **结果卡分享**：生成卡片 → 点"分享到聊天" → 弹出 Telegram 原生分享对话框 → 选一个会话发送成功，对方收到带推荐码的消息。
- [ ] **initData 验签打通**：前端取到 `initData` 并 POST `/verify` → 返回 `valid:true`（控制台可见）。
- [ ] 横屏/竖屏切换布局正常。
- [ ] 退出重进：localStorage 脚本仍在；initData 每次刷新重新生成但验签稳定通过。

---

## 4. 验收判定表（交付时逐行核对）

| 编号 | 功能 | 本地浏览器 | Telegram 真机 | 判定 |
|---|---|---|---|---|
| F1 | 滚动引擎（播放/暂停/重置/调速） | □ | □ | Pass / Fail |
| F2 | 脚本编辑 + localStorage 持久化 | □ | □ | Pass / Fail |
| F3 | 镜像模式 | □ | □ | Pass / Fail |
| F4 | 字号/颜色/对齐控制 | □ | □ | Pass / Fail |
| F5 | 结果卡生成（水印+推荐码占位） | □ | □ | Pass / Fail |
| F6 | 分享到聊天（原生对话框） | N/A（本地优雅失败） | □ | Pass / Fail |
| F7 | initData 验签（合法通/伪造拒） | □（部署后） | □ | Pass / Fail |
| F8 | Mini App 自适应展开、布局不破 | □ | □ | Pass / Fail |

**通过标准**：F1–F5、F7、F8 全部 Pass，且 F6 在真机 Pass，即视为 P0+P1 验收合格，可推进 P2+。

---

## 5. 已知限制（P0+P1 范围内，不必测也不必修）

- ❌ 无付费 / Stars / 订阅（P3）。
- ❌ 无悬赏改稿（P4）。
- ❌ 无病毒增长（群榜/送读稿）、无原生 Affiliate 钩子（P5）。
- ❌ 无跨 App 统一积分（P2）。
- ❌ bot token 为占位，需你填真实值；未填时验签会返回 false（属预期）。
- ❌ 多语言（EN/JP/KR）本阶段未做，文案为中文。

---

## 6. 若测试失败，先查这 4 处

1. **真机打不开 / 白屏**：先确认 BotFather 的 Mini App URL 指向的是 Cloudflare Pages 的 `https://` 地址（非 localhost）。
2. **initData 验签一直 false**：检查 worker 里的 bot token secret 是否与 BotFather 的 token 完全一致；检查时钟是否同步（HMAC 含时间戳，偏差过大判失效）。
3. **分享按钮无反应**：确认是在 Telegram 内打开（非浏览器）；浏览器环境本就只应优雅失败。
4. **localStorage 不持久**：确认未用无痕模式；确认 `index.html` 经 http(s) 访问（file:// 下部分浏览器限制 localStorage）。

---

*本指南为 P0+P1 专用验收手册；P2–P7（积分/支付/悬赏/增长）的测试将在对应阶段文档中补充。*
