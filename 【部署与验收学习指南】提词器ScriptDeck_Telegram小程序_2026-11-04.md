# 部署与验收学习指南 — ScriptDeck 提词器 Telegram Mini App

> 这份文档是给你**回来后边学边做**用的"操作手册"。
> 技术原理和命令的完整版在 `README_deploy.md`；这份只讲**你按顺序该做什么、勾什么、怎么判定"可以交付"**。
> 配套验收清单还有一份 `【测试指南】…P0+P1本地与Telegram验收清单_2026-10-30.md`，本文第 3 节是它的"补全版"（补齐 Pro 六项真机验收）。

---

## 0. 先看清现在的状态（很重要，别以为还没写完）

| 项目 | 状态 |
|---|---|
| 前端 `index.html` | ✅ 已完成，含五语（中/英/日/韩/俄）、提词核心、成片卡、设置、举报、Pro 六项 |
| 后端 `worker.js`（单体，合并 P0–P7） | ✅ 代码完成，未部署 |
| 数据库 `schema.sql`（D1） | ✅ 表已建好（含 Pro 订阅表 `users_pro`、云同步 `scripts`、遥控 `remote_sessions` 等） |
| 本地测试 | ✅ 后端 `npm test` **63/63**、前端 `node --test test_i18n_real.mjs` **32/32** |
| **真正 `wrangler deploy`** | ❌ **还没做**（这是你回来要做的第一步） |
| `wrangler.toml` 的 `database_id` / `BOT_USERNAME` | ❌ 还是占位 `__D1_DATABASE_ID__` / `__BOT_USERNAME_PLACEHOLDER__` |
| `BOT_TOKEN` / `ADMIN_SECRET` / `WEBHOOK_SECRET` | ❌ 还没用 `wrangler secret put` 注入 |
| `index.html` 的 `CONFIG.API_BASE` | ❌ 还是空字符串（现在前端跑在"本地纯前端模式"） |

**结论**：代码全写完了，等于"造好的车停在车库"。你回来的任务是**把车开出车库（部署）+ 试驾一圈确认没毛病（验收）**。

---

## 1. 回来前先备齐这些（一次性）

| 要准备的东西 | 怎么弄 | 用途 |
|---|---|---|
| Cloudflare 免费账号 | 官网注册 | 托管前端（Pages）+ 运行后端（Worker + D1 数据库） |
| Node.js（含 npm） | nodejs.org 下载装好 | 跑 `wrangler` 命令行、跑本地测试 |
| `wrangler` CLI | 装好 Node 后执行 `npm i -g wrangler`，再 `wrangler login` | 部署 Worker / D1 / Pages 的命令工具 |
| Telegram 账号 + BotFather | 在 Telegram 搜 `@BotFather` | 建 bot、拿 token、挂 Mini App |
| 一部 Android 手机 或 桌面 Chrome | 真机验收用 | iOS 的语音跟随**不可用**（会显示提示），需用 Android/桌面对照验证"可用"的那一侧 |
| （可选）第二台 Telegram 账号 | 用来测"多用户 / 分享深链" | 验收加分项 |

> 装完工具后先验证：`node -v`、`wrangler --version` 都能出数字，就 OK。

---

## 2. 部署学习路线（严格按顺序，做完一步再下一步）

### 步骤 2.1 — 建 Telegram bot + 挂 Mini App（BotFather）
1. Telegram 里搜 `@BotFather` → 发 `/newbot` → 按提示取名字和用户名（用户名形如 `@你的bot`，记下来）。
2. 发 `/newapp` → 选刚建的 bot → 填标题、简介、传一张 640×360 的图标。
3. **Web App URL 这一项先空着**，等 2.3 拿到 Pages 地址再回来填。
4. 记下 **bot token**（形如 `123456789:AAE...`）。

### 步骤 2.2 — 部署静态前端（Cloudflare Pages，最简单的方式）
> 前端就是单个 `index.html`，不需要后端也能跑 UI。

- 登录 Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Upload assets**。
- 项目名随意（如 `scriptdeck`）。
- 把本目录下的 `index.html` 拖进去 → **Deploy**。
- 部署完会得到 `https://scriptdeck.pages.dev`（或你绑的自定义域名）。**复制这个地址**。

> 命令行党也可以用：`wrangler pages deploy . --project-name scriptdeck`（在含 index.html 的目录执行）。

### 步骤 2.3 — 部署后端单体（一个 Worker + 一个 D1 数据库）
后端是 `worker.js`，和所有数据表都用**同一个** D1 库，只部署**一次**。

**(a) 建库（只做一次）**
```bash
wrangler d1 create teleprompter-credits
# 命令会返回一个 database_id，复制它
```

**(b) 把 id 填进配置**
打开根目录 `wrangler.toml`，把第 13 行的：
```
database_id = "__D1_DATABASE_ID__"
```
改成你刚拿到的真实 id。同时把第 17 行的：
```
BOT_USERNAME = "__BOT_USERNAME_PLACEHOLDER__"
```
改成你在 BotFather 取的用户名（**不含 @**，例如 `scriptdeck_bot`）。

**(c) 建表（本地 + 远程各跑一次，幂等安全可重复跑）**
```bash
wrangler d1 execute teleprompter-credits --local  --file=./schema.sql
wrangler d1 execute teleprompter-credits --remote --file=./schema.sql
```

**(d) 注入三个密钥（交互式，不会落盘到代码里）**
```bash
wrangler secret put BOT_TOKEN       # 填 BotFather 的 token
wrangler secret put ADMIN_SECRET    # 自己随便编一段长随机串，用于对账后台门禁
wrangler secret put WEBHOOK_SECRET  # 自己随便编一段长随机串，用于支付回调验签
```

**(e) 真正部署**
```bash
wrangler login      # 浏览器弹窗授权一次
wrangler deploy     # 读 wrangler.toml → 上线，得到 https://teleprompter-monolith.<你的子域>.workers.dev
```
把上面这个 `workers.dev` 地址**复制**下来。

**(f) 把 Telegram 支付回调指到你的 Worker（用 Stars 付费才需要）**
```bash
curl -F "url=https://teleprompter-monolith.<你的子域>.workers.dev/payments/webhook" \
     -F "secret_token=你填的WEBHOOK_SECRET" \
     https://api.telegram.org/bot<你的BOT_TOKEN>/setWebhook
```

### 步骤 2.4 — 把后端地址填进前端，重新部署前端
打开 `index.html`，找到第 503 行附近的 `CONFIG`：
```js
const CONFIG = {
  API_BASE: '',                 // ← 改成你的 Worker 地址
  BOT_USERNAME: '',             // ← 改成你的 bot 用户名（不带 @）
  ...
};
```
改成：
```js
const CONFIG = {
  API_BASE: 'https://teleprompter-monolith.<你的子域>.workers.dev',
  BOT_USERNAME: 'scriptdeck_bot',   // 你的真实用户名
  ...
};
```
改完**重新走一次 2.2**（把新 index.html 再 Upload 到 Pages）。

> ⚠️ 小知识：改 `CONFIG.API_BASE` 之前，前端跑在"本地纯前端模式"——Pro 功能旁边会多一个"本地预览"按钮，可以**不花钱**看 Pro 效果，方便你验收。填上真实地址后，这个预览按钮会自动消失，Pro 改走真实付费判定。

### 步骤 2.5 — 回到 BotFather 补全 Mini App URL
把 2.2 拿到的 Pages 地址（`https://scriptdeck.pages.dev`）填回 BotFather 第 2.1 步留空的 **Web App URL**。保存。

**到这里，部署全部完成。** 接下来进入验收。

---

## 3. 验收清单（"验收"= 确认能交付给用户）

> 判据：每一项打勾 = Pass。全部打勾 = 可以交付。
> 注意：jsdom / 本地环境**没有真麦克风、没有真 Telegram**，所以带 ⭐ 的项**必须真机/真部署后才能验**，本地测不了。

### 3.1 本地 UI（回北京前也能先过一部分，但建议真机一起做）
- [ ] 浏览器开 `index.html`（或 `python -m http.server 8080` 后访问 `localhost:8080`），**F12 控制台无红色报错**。
- [ ] 控件齐全：播放/暂停/重置、速度滑块、字号/颜色/对齐、镜像开关、脚本输入框、成片卡按钮、设置（齿轮）、语言切换。
- [ ] 粘贴文字 → 播放 → 文字向上匀速滚动；拖速度滑块实时变快变慢；暂停/重置有效。
- [ ] 刷新页面，脚本还在（localStorage 持久化）。
- [ ] 镜像开关开启后文字水平翻转。
- [ ] 字号/颜色/对齐改动即时生效、可读。
- [ ] 右上角语言切换：中文 / EN / 日本語 / 한국어 / Русский，切换后全站文案跟着变（默认示例稿也跟着变语言）。

### 3.2 Telegram 真机（Desktop 端，⭐ 必须真部署）
- [ ] 从 Telegram Desktop 打开 Mini App → 自动占满窗口、无白边。
- [ ] 提词 / 调速 / 编辑 / 持久化 / 镜像 / 字号色 全部可用。
- [ ] 生成成片卡 → 点"分享到聊天" → 弹出 Telegram **原生分享框** → 发给好友，对方收到带推荐码的消息。
- [ ] 身份验签打通：填好 `API_BASE` 后，页面右上角显示"身份已验证 ✓"（说明 `worker.js` 的 `/verify` 返 `valid:true`）。
- [ ] 横竖屏切换布局正常；退出重进脚本还在。

### 3.3 Pro 六项逐条验收（⭐ 多数需真机/真部署）
> Pro 六项已全部实现。验收时建议：先在"本地预览模式"看效果，再在真机用真实 Stars 买一次 Pro 看门禁是否真的放开。

| # | Pro 权益 | 怎么验收（Pass 判据） | 备注 |
|---|---|---|---|
| 1 | 去水印 · 高清成片卡 | 非 Pro 生成卡片带水印、尺寸 1080×1350；开通 Pro 后无水印、尺寸 2160×2700 | 本地预览即可看差异 |
| 2 | 多讲稿 + 云同步 | 新建多篇讲稿、切换、删除；开云同步后换设备/刷新，讲稿从云端回来 | ⭐ 需真后端 |
| 3 | 双设备遥控 | 一台开"遥控"生成深链，另一台（或同机第二个窗口）点开深链 → 能远程 播放/暂停/调速，主控屏实时反映 | ⭐ 需真后端；深链用 `startapp=remote_<token>` |
| 4 | 字幕 / 文本导出 SRT·TXT | 成片卡页点"导出 SRT""导出 TXT" → 下载到本地文件；时间码为按语速的**估算值**（文案已注明供剪辑参考） | 本地即可验下载 |
| 5 | 语音跟随滚动 | **Android / 桌面 Chrome**：开 🎤 → 说话文字随语速走、停顿即停 ✅；**iOS（iPhone/iPad）**：面板明确提示"iOS 暂不可用，请改用 Android 或桌面 Chrome"，且**不崩溃** | ⭐ 必须真机；iOS 按设计就是"显示提示而非可用" |
| 6 | （无限讲稿已并入 #2） | — | 见 #2 |

> 关于 iOS 语音跟随：这是**平台能力限制**（iOS 的 Telegram 内置浏览器 WKWebView 不提供语音识别 API），不是我们代码没写完。验收时确认"iOS 上正确显示提示、功能优雅降级"即可，不要误以为是 Bug。

### 3.4 支付与后台对账（⭐ 需真 Stars，可选但建议）
- [ ] 在 Pro 页用 Telegram Stars 买一次月费（400⭐）或年费（4000⭐）→ 支付成功后 Pro 权益即时解锁。
- [ ] 用 `ADMIN_SECRET` 访问 `https://teleprompter-monolith.<子域>.workers.dev/admin` → 看到"收到 Stars 总额 / 兑换积分 / 最近交易"对账面板。
- [ ] 退款口径：已在合规文案设为"14 天无理由退款"，界面/关于页有说明。

---

## 4. 常见坑 / 故障排查（回来照着查）

1. **真机白屏 / 打不开**：BotFather 的 Mini App URL 必须是 Cloudflare Pages 的 `https://` 地址，不能是 `localhost`；且 Pages 要重新传过填了 `API_BASE` 的 `index.html`。
2. **验签一直 false / 不显示"已验证"**：`wrangler secret put BOT_TOKEN` 的值必须和 BotFather 的 token **逐字符一致**；服务器时钟正常（auth_date 容差 24h）。
3. **Pro 门禁没放开**：确认 `API_BASE` 已填、`/payments/pro-status` 能通、且你确实买过 Pro（或先用本地预览模式看效果）。
4. **分享没反应**：必须是在 Telegram **内**打开；浏览器里本就只应"优雅提示需在 Telegram 内使用"。
5. **iOS 语音跟随点不开/报错**：预期行为 = 显示提示框。若直接崩，才是问题（正常是 `speechSupported()` 返 false → 只显示提示）。
6. **localStorage 不持久**：别用无痕模式；`index.html` 必须经 http(s) 访问（`file://` 下部分浏览器限制）。

---

## 5. 验收通过的"签字线"（给你一个可以交付的判定）

✅ **以下全部满足，即可交付用户**：
- 部署完成：Pages 上线 + Worker 上线 + D1 建表 + 三个 secret 已注入 + `CONFIG.API_BASE` 已填且 Pages 已重传。
- 第 3.1、3.2 节每一项打勾。
- 第 3.3 节 Pro 六项：本地预览模式全部可见效果；真机至少验证 ①去水印差异 ②云同步 ③双设备遥控 ④SRT/TXT 下载 ⑤Android/桌面语音跟随可用 + iOS 提示正确显示。
- 第 3.4 节：至少一次真实 Stars 购买 → Pro 解锁 → 后台对账能看到这笔。

❌ **出现任一情况，先别交付，回来找我**：
- 真机白屏或控制台报错。
- 验签不通（右上角不显示"已验证"）。
- Pro 付费后权益没解锁。
- iOS 上语音跟随不是"显示提示"而是崩溃。

---

## 6. 你回来后建议的执行顺序（一句话版）

> 装工具 → BotFather 建 bot → Pages 传 index.html → `wrangler d1 create` + 填 id/用户名 → `d1 execute` 建表 → `secret put` 三个密钥 → `wrangler deploy` → 设 webhook → 把 `API_BASE` 填进 index.html 并重传 Pages → 回 BotFather 补全 Mini App URL → 按第 3 节逐项验收打勾。

---

*本指南对应代码状态：截至 2026-11-04，Pro 六项全部落地、本地测试全绿（后端 63/63、前端 32/32），尚未执行真实 `wrangler deploy`。详细的命令与原理见同目录 `README_deploy.md`；P0+P1 专项验收见 `【测试指南】…2026-10-30.md`。*
