# ScriptDeck · 提词器 Telegram Mini App — 部署与验收手册

> **产品对外品牌名：`ScriptDeck`**（副标题 `Teleprompter & Cue Cards`）。本文档中出现的 `teleprompter-credits`（D1 库）、`teleprompter-monolith`（Worker）、`teleprompter`（Pages 项目名）均为**内部技术标识，不随品牌改名**——改名意味着重建数据库、迁移数据、更换 Worker URL，用户不可见且纯属额外风险。前端所有用户可见的品牌位（标题、副标题、分享卡片水印、分享文案）已统一为 `ScriptDeck`。

> 范围：P0（脚手架 + initData 验签）+ P1（核心提词器零后台 MVP）+ P2（跨 App 统一积分账本）+ P3（Telegram Stars 支付账本）+ P4（悬赏改稿）+ P5（病毒增长）+ P6（增强模块）+ P7（合规 + 多语言 EN/JP/KR + 平台对账 + 举报）。
> 产物：`index.html`（单文件提词器，含多语切换 / 可见免责声明 / 举报入口）、根目录 `worker.js`（**单体后端**：合并 P0+P2–P7）、根目录 `schema.sql` 与 `wrangler.toml`、本文件；各模块业务代码见 `p2-credits/`…`p7-compliance/`。

> ★ **已合并为单体后端（Monolith）**：P0 验签 + P2 积分 + P3 支付 + P4 悬赏 + P5 增长 + P6 增强 + P7 合规，现在由**一个** Cloudflare Worker（`worker.js`）、**一个** D1 库（`teleprompter-credits`）、**一个** `wrangler.toml`、**一个** `schema.sql` 统一部署。Telegram Mini App 只需填**一个**后端 URL（`index.html` 的 `CONFIG.API_BASE`）。这彻底消除了"多独立 Worker 分头部署、日后改动互相漂移 / clash"的风险。
>
> ⚠️ **部署以 §3 单体部署为准**：下文 §8–§13 各模块里出现的 `p2-credits/schema.sql`、`*/wrangler.toml` 等逐模块路径**已不再单独存在**（已合并到根目录）。不要再逐模块执行 `wrangler deploy`；那些章节仅作各模块逻辑与前端客户端用法说明。

---

## 0. 前置条件

| 项 | 说明 |
|---|---|
| 本地 | 浏览器（Chrome/Edge）做 UI 测试；可选 Node.js 跑 `node --check worker.js` |
| BotFather | 在 Telegram 搜索 `@BotFather`，创建 bot 并拿到 **bot token** |
| Cloudflare | 免费账号（托管静态 `index.html` 用 Pages，验签用 Worker） |
| 可选 | `wrangler` CLI（`npm i -g wrangler`，`wrangler login`） |

---

## 1. BotFather 配置（一次性）

1. 打开 Telegram，搜索 `@BotFather`，发送 `/newbot`。
2. 按提示设置 bot 名称与用户名（用户名即 `@your_bot`，稍后用于分享深链）。
3. 记下 **bot token**（形如 `123456789:AAE...`）。
4. 给 bot 绑定 Mini App：
   - 发送 `/newapp` 给 BotFather → 选择刚建的 bot → 填标题、简介、上传一张图标（640×360 PNG）。
   - **Web App URL** 填第 2 步里 Cloudflare Pages 托管的 `index.html` 地址（必须是 `https://`）。
   - 完成后 bot 会获得「Open」/菜单按钮入口，也可通过 `https://t.me/<your_bot>/<appname>` 打开。
5. 把 bot token 填进 `worker.js` 的环境变量（见第 3 步）。

> 也可在 BotFather 用 `/setmenubutton` 设置菜单按钮直接打开 Mini App。

---

## 2. 静态站点部署（Cloudflare Pages 托管 `index.html`）

### 方式 A：Dashboard 拖拽（最省事）
1. 登录 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**。
2. 项目名随意（如 `teleprompter`）。
3. 把本目录下的 `index.html` 拖入上传框 → **Deploy**。
4. 部署完会得到 `https://teleprompter.pages.dev`（或自定义域）。复制该地址，回到 BotFather 第 1.4 步填为 Mini App URL。

### 方式 B：wrangler 命令行
```bash
# 在本目录（含 index.html）执行
npm i -g wrangler
wrangler login
wrangler pages deploy . --project-name teleprompter
```

### 方式 C：连 Git 仓库（自动重建）
把 `index.html` 推到 GitHub/GitLab 仓库，在 Pages 里 **Connect to Git** 选该仓库，构建命令留空、输出目录填 `.`（或含 index.html 的目录）。

---

## 3. 后端单体部署（`worker.js` + 单一 D1）

> 单体后端把 P0 验签 + P2 积分 + P3 支付 + P4 悬赏 + P5 增长 + P6 增强 + P7 合规合并到一个 Worker；路由按前缀分发到各模块 handler（各模块业务逻辑零改动）。详见根目录 `worker.js` 顶部注释。

### 3.1 配置文件 `wrangler.toml`（根目录，已就绪）
```toml
name = "teleprompter-monolith"
main = "worker.js"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "teleprompter-credits"
database_id = "__D1_DATABASE_ID__"   # `wrangler d1 create teleprompter-credits` 拿到后填入

[vars]
BOT_USERNAME = "__BOT_USERNAME_PLACEHOLDER__"   # 与 BotFather 用户名一致（分享深链）
```
> 注：根 `worker.js` 现为 **Modules 格式**（`export default { fetch }` + ESM 导入 `shared/verify.js` 等）。`BOT_TOKEN` / `ADMIN_SECRET` / `WEBHOOK_SECRET` 一律走 secret（见 §3.3），不再像旧 P0 那样以全局变量注入。

### 3.2 建库 + 初始化表（单一 D1，全量建表、幂等安全）
```bash
# 建库（一次性）
wrangler d1 create teleprompter-credits
#   拿到 database_id 填进根 wrangler.toml 的 database_id

# 初始化全部表（本地 + 远程各跑一次；schema 已合并到根 ./schema.sql）
wrangler d1 execute teleprompter-credits --local  --file=./schema.sql
wrangler d1 execute teleprompter-credits --remote --file=./schema.sql
```

### 3.3 部署（secret 方式，推荐）
```bash
wrangler login
wrangler secret put BOT_TOKEN        # BotFather token（initData 验签 + 调 Bot API 开发票/设 webhook）
wrangler secret put ADMIN_SECRET     # /payments/verify、/bounty/verify、/growth/verify 运营对账门禁
wrangler secret put WEBHOOK_SECRET   # setWebhook 的 secret_token（/payments/webhook 验签）
wrangler deploy                      # 读根 wrangler.toml → https://teleprompter-monolith.<sub>.workers.dev
```

把 Bot 的 Stars 支付 webhook 指向单体 Worker：
```bash
curl -F "url=https://teleprompter-monolith.<sub>.workers.dev/payments/webhook" \
     -F "secret_token=$WEBHOOK_SECRET" \
     https://api.telegram.org/bot<BOT_TOKEN>/setWebhook
```

### 3.4 让前端使用该地址（只需填一个根 URL）
打开 `index.html`，修改顶部 `CONFIG`：
```js
const CONFIG = {
  API_BASE: 'https://teleprompter-monolith.<sub>.workers.dev', // 单体后端根地址
  BOT_USERNAME: 'your_bot'   // 与 BotFather 用户名一致，用于分享深链
};
```
> `/verify`、`/compliance/report` 等所有端点都由 `API_BASE` 经 `apiUrl()` 自动派生，**不再需要分别为每个服务填 URL**。留空 `API_BASE` 时，前端不会发起后端请求（适合本地/浏览器先测 UI）。真机验收前务必填好。

---

## 4. 本地快速自测（无需 Telegram）

```bash
cd 提词器Telegram小程序
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```
- 脱离 Telegram 时 `Telegram.WebApp` 不存在，相关调用被 try/catch 兜底，**UI 仍正常渲染**（预期行为）。
- 控制台执行 `node --check worker.js` 确认无语法错误。

逐项核对（详见《【测试指南】提词器Telegram小程序_P0+P1本地与Telegram验收清单》）：
- [ ] 页面无 JS 报错；控件齐全（播放/暂停/重置、速度、设置、卡片）。
- [ ] 粘贴文字 → 播放 → 匀速向上滚动；调速实时生效；暂停/重置有效。
- [ ] 脚本刷新后仍在（localStorage）。
- [ ] 镜像开关翻转文字。
- [ ] 字号/颜色/对齐即时生效。
- [ ] 生成卡片出现（文稿片段 + 水印 + 推荐码深链）；浏览器中点「分享到聊天」应**优雅提示**"需在 Telegram 内打开"，不崩。

---

## 5. Telegram 真机验收（Desktop）

前置：BotFather 已设好 Mini App URL（指向 Pages 的 `https://` 地址）。

- [ ] 从 Telegram Desktop 打开 Mini App → 自动 `expand()` 占满窗口，无白边。
- [ ] 提词/调速/编辑/持久化/镜像/字号色全部可用。
- [ ] 生成卡片 → 「分享到聊天」→ 弹出 Telegram **原生分享对话框** → 选会话发送成功，对方收到带推荐码的消息。
- [ ] initData 验签打通：`CONFIG.VERIFY_URL` 填好后，前端 POST `initData` → 返回 `valid:true`（页面右上角显示"身份已验证 ✓"）。
- [ ] 横竖屏切换布局正常；退出重进脚本仍在。

### 验签边界自测
- 合法 initData → `valid:true`。
- 篡改 hash 任一字符 → `valid:false`（reason: `bad_hash`）。
- POST 空 body → `valid:false`（reason: `empty`/`bad_body`），不 500。
- **未填 BOT_TOKEN**：返回 `valid:false`（reason: `token_not_configured`）——属预期，填好即正常。

---

## 6. 已知限制（本阶段范围外）

- ✅ 跨 App 统一积分（P2）已完成（见第 8 节）；本地测试 5/5 通过，待统一单体部署（见 §3）。
- ✅ Telegram Stars 支付账本（P3）已完成（见第 9 节）；本地测试 11/11 通过，待统一单体部署（见 §3）。
- ✅ 悬赏改稿（P4）已完成（见第 10 节）；本地测试 6/6 通过，待统一单体部署（见 §3）。
- ✅ 病毒增长（P5）已完成（见第 11 节）；本地测试 12/12 通过，待统一单体部署（见 §3）。
- ✅ 增强模块（P6：云端同步 / 双设备遥控 / 语音跟随 / 模板库）已完成（见第 12 节）；本地测试 17/17 通过，待统一单体部署（见 §3）。
- ✅ 合规 + 多语言（P7：五语框架 zh/en/ja/ko/ru + 可见免责声明 + 平台 Stars 对账 + 举报入口）已完成（见第 13 节）；本地测试 6/6 通过，待统一单体部署（见 §3）。
- ❌ bot token 为占位，需你填入；未填时验签恒为 false。

---

## 7. 故障排查

1. **真机白屏 / 打不开**：确认 BotFather 的 Mini App URL 是 Cloudflare Pages 的 `https://` 地址（非 localhost）。
2. **验签一直 false**：核对根 `wrangler.toml` 的 secret `BOT_TOKEN`（通过 `wrangler secret put BOT_TOKEN` 注入）与 BotFather token 完全一致；确认服务器时钟同步（auth_date 容差 24h）。
3. **分享无反应**：确认是在 Telegram 内打开（浏览器本就只应优雅失败）。
4. **localStorage 不持久**：勿用无痕模式；`index.html` 须经 http(s) 访问（file:// 下部分浏览器限制）。

---

## 8. P2 统一积分账本（跨 App 共用后端）

> 范围：三款出海小程序（提词器 / 决策助手 / 表情包）共用的**统一积分总账**。
> 靠 Telegram `user_id`（跨 bot 恒定）打通：同一账号在任一 App 赚的积分，可在另一 App 花。
> 代码位置：`p2-credits/`。**本地测试已通过（`node --test p2-credits/test-credits.mjs`，5/5）**，待统一单体部署（见 §3）。

### 8.1 合规边界（红线，见功能清单第 7/8 节）
- 内部积分 **≠ Telegram Stars、≠ 法定货币**，界面与声明须明确区分。
- **不可提现**为法币 / 加密货币（42 号文 / 237 号文红线）。
- **不可在用户间当货币转账**（积分只由平台 grant，用户只能 consume）—— 代码**刻意不提供 transfer()**。
- 不可用于赌博（只换明确功能，不押注）。

### 8.2 文件清单
| 文件 | 作用 |
|---|---|
| `shared/ledger-core.js` | 纯账本逻辑：grant / consume / getBalance / getLedger（依赖 store 接口，不依赖 Cloudflare）；被 P2–P7 共用 |
| `shared/verify.js` | initData HMAC 验签（共用模块，被 P0–P7 共用，取代各 App 内联实现） |
| `p2-credits/credits-worker.js` | Cloudflare Worker（Modules + D1）：`/credits/balance`、`/ledger`、`/consume`、`/grant` |
| `p2-credits/inmemory-store.js` | 测试用内存 Store |
| 部署 / 建表 | 已合并到根目录 `wrangler.toml` + `schema.sql`，见 §3 单体部署 |
| `p2-credits/credits-client.js` | 三款 App 共用的浏览器客户端助手（`createCredits()`） |
| `p2-credits/test-credits.mjs` | 本地测试（核心逻辑 + Worker 端到端 + 合规断言） |

### 8.3 部署（已统一，见 §3）
> 已合并为单体后端：**建库 / 建表 / 填 secret / 部署** 全部在根目录一次性完成，见 §3 单体部署。`p2-credits/wrangler.toml` 与 `p2-credits/schema.sql` 已并入根目录，请勿再单独执行本节旧命令。

### 8.4 前端接入（任一款 App）
```html
<script type="module">
  import { createCredits } from './p2-credits/credits-client.js';
  const credits = createCredits({
    baseUrl: 'https://teleprompter-credits.<sub>.workers.dev'
    // getInitData 默认自动读 Telegram.WebApp.initData
  });
  const { balance } = await credits.getBalance();
  // 兑换权益（余额不足抛 code='insufficient_funds'）
  await credits.consume({ amount: 100, reason: 'pro_unlock', refType: 'pro' });
</script>
```

### 8.5 本地自测（无需 Cloudflare）
```bash
node --check p2-credits/credits-worker.js     # 语法
node --test p2-credits/test-credits.mjs        # 5/5 应全绿
```

---

## 9. P3 支付账本（Telegram Stars）

> 范围：把 P2 的统一积分与 **Telegram Stars 官方支付**打通——用户用 Stars 买积分包，Worker 在支付成功时**原子地**记录支付并发放积分。
> 这是后续 P4 悬赏改稿（用积分发赏）付费侧的基础设施。
> 代码位置：`p3-payments/`。**本地测试已通过（`node --test p3-payments/test-payments.mjs`，11/11）**，待统一单体部署（见 §3）。

### 9.1 合规边界（红线，与 P2 一致，凌驾一切）
- **Stars 只经 Telegram 官方支付流转**，绝不经手法定货币 / 加密货币；一切扣款由 Telegram 完成。
- 内部积分 **≠ Telegram Stars、≠ 法定货币**；界面与声明须明确区分，且**不可提现**。
- 积分只由平台在支付成功后发放，用户只消耗（P2 已刻意不提供 transfer）——**无 P2P 转账、无赌博、无预测 / 算命**。
- 商品描述只谈"功能解锁 / 创作额度"（Pro 主题、去水印导出、生成次数等），不出现运势、预测类字眼（美国 App Store 合规）。

### 9.2 文件清单
| 文件 | 作用 |
|---|---|
| `p3-payments/payments-core.js` | 纯逻辑：商品目录 + `processSuccessfulPayment`（幂等发积分，依赖 store） |
| `p3-payments/payments-worker.js` | Cloudflare Worker（Modules + D1）：`/webhook`、`/invoice`、`/history`、`/verify`、`/admin/summary`、`/admin`（平台 Stars 对账，ADMIN_SECRET 门禁） |
| `p3-payments/inmemory-payments-store.js` | 测试 / 本地 dev 用的内存 Store（积分发放**复用 P2 ledger-core.grant**） |
| `p3-payments/payments-client.js` | 三款 App 共用的浏览器客户端（`createPayments()`） |
| 部署 / 建表 | 已合并到根目录 `wrangler.toml` + `schema.sql`，见 §3 单体部署 |
| `p3-payments/test-payments.mjs` | 本地测试（支付记录 + 发积分 + 幂等等 11 项断言） |

> 复用说明：`p3-payments/` **不重造** initData 验签与账本逻辑——直接 `import` 自 `shared/verify.js` 与 `shared/ledger-core.js`。D1 下"支付行 + 积分发放"用 `db.batch()` 一次性原子提交；内存 Store 下直接复用 `ledger-core.grant`。两者都靠 `tg_payment_charge_id` 唯一约束保证**重复回调不重复发放**。

### 9.3 部署（已统一，见 §3）
> 已合并为单体后端：`/payments/*` 路由随根 `worker.js` 一起部署（见 §3）。`p3-payments/wrangler.toml` 与 `p3-payments/schema.sql` 已并入根目录，请勿再单独执行本节旧命令。支付 webhook 的配置见 §3.3。

### 9.4 前端接入（任一款 App）
```html
<script type="module">
  import { createPayments } from './p3-payments/payments-client.js';
  const pay = createPayments({
    baseUrl: 'https://teleprompter-payments.<sub>.workers.dev'
    // getInitData 默认自动读 Telegram.WebApp.initData
  });

  // 1) 取发票链接 → 用 Telegram 官方支付拉起 Stars 收银台
  const { invoiceLink, productId, stars, credits } =
    await pay.createInvoice({ productId: 'credits_pro' });   // credits_starter|pro|ultra
  Telegram.WebApp.openInvoice(invoiceLink, (ok) => {
    if (ok) { /* 支付成功由 webhook 自动发积分；刷新积分余额即可 */ }
  });

  // 2) 查自己的 Stars 支付历史
  const { history } = await pay.getHistory();
</script>
```

### 9.5 本地自测（无需 Cloudflare）
```bash
node --check p3-payments/payments-worker.js     # 语法
node --test  p3-payments/test-payments.mjs       # 12/12 应全绿
# 覆盖：成功支付记录+发积分 / 重复 charge_id 不二次发放 /
#       pre_checkout 应答 ok / 未授权 webhook 401 + 缺 ADMIN_SECRET 403 /
#       非法 initData 在 /invoice、/history 被拒 401 /
#       平台对账 /admin 无 ADMIN_SECRET 返回 403
```

---

## 10. P4 悬赏改稿（平台托管 + 释放奖励，无 P2P）

> 范围：创作者经济——发布者用积分发赏（平台托管 escrow），他人投稿改写，发布者选定中标并释放奖励。
> 奖励全程平台托管（escrow）→ 仅 award 释放给中标者；**绝不做 P2P 转账 / 赌博 / 预测**。
> 代码位置：`p4-bounty/`。**本地测试已通过（`node --test p4-bounty/test-bounty.mjs`，6/6）**，待统一单体部署（见 §3）。

### 10.1 合规边界（红线，美国 App Store 合规）
- 悬赏 = 任务奖励（task reward），由发布者用积分托管；中标后平台发放，**积分只由平台 grant，用户只 consume / 托管**。
- **绝不实现** 钱包到钱包 P2P 转账（transfer）、提现（withdraw）、押注 / 彩票（gamble / lottery）、预测 / 算命。
- 代码刻意不导出 `transfer / withdraw / gamble / predict / fortune`（测试已断言）。

### 10.2 文件清单
| 文件 | 作用 |
|---|---|
| `p4-bounty/bounty-core.js` | 纯逻辑：createBounty（托管 escrow）/ submitRevision / awardBounty（幂等释放）/ getBounty / listOpenBounties |
| `p4-bounty/bounty-worker.js` | Cloudflare Worker（Modules + D1）：`/bounty/create`、`/bounty/list`、`/bounty/submit`、`/bounty/award`、`/bounty/detail`、`/bounty/verify` |
| `p4-bounty/inmemory-bounty-store.js` | 测试 / 本地 dev 用的内存 Store（积分托管**复用 P2 ledger-core.consume / grant**） |
| `p4-bounty/bounty-client.js` | 三款 App 共用的浏览器客户端（`createBounty()`） |
| 部署 / 建表 | 已合并到根目录 `wrangler.toml` + `schema.sql`，见 §3 单体部署 |
| `p4-bounty/test-bounty.mjs` | 本地测试（托管 / 余额不足 / owner 自投拒 / 释放幂等 / 越权 / 合规断言 / Worker 端到端）6 项 |

### 10.3 部署（已统一，见 §3）
> 已合并为单体后端：`/bounty/*` 路由随根 `worker.js` 一起部署（见 §3）。`p4-bounty/wrangler.toml` 与 `p4-bounty/schema.sql` 已并入根目录，请勿再单独执行本节旧命令。

### 10.4 前端接入
```html
<script type="module">
  import { createBounty } from './p4-bounty/bounty-client.js';
  const bounty = createBounty({ baseUrl: 'https://teleprompter-bounty.<sub>.workers.dev' });
  const { id } = await bounty.createBounty({ title: '帮我改这段口播稿', scriptText: '...', rewardCredits: 100 });
  const { bounties } = await bounty.listBounties({ limit: 20 });
  await bounty.submitRevision({ bountyId: id, revisedText: '改写后的文稿' });
  await bounty.award({ bountyId: id, submissionId: subId });   // 仅 owner；幂等
</script>
```

### 10.5 本地自测（无需 Cloudflare）
```bash
node --check p4-bounty/bounty-worker.js
node --test  p4-bounty/test-bounty.mjs      # 6/6 应全绿
```

---

## 11. P5 病毒增长（推荐归因 / 排行榜 / 礼物 / 分享，平台中介）

> 范围：获客增长——推荐归因（双方各得平台奖励）、群 / 全站排行榜、平台中介的积分礼物、分享深链。
> 所有积分变动**平台中介**（consume + grant，非转账）；**无 transfer / withdraw / 赌博 / 预测**。
> 代码位置：`p5-growth/`。**本地测试已通过（`node --test p5-growth/test-growth.mjs`，12/12）**，待统一单体部署（见 §3）。

### 11.1 合规边界
- 推荐奖励由平台发放（非转账）；礼物为平台中介的 consume + grant，**绝不做钱包互转**。
- 分享为 UGC 有机传播；**不含** 赌博 / 预测 / 算命。

### 11.2 文件清单
| 文件 | 作用 |
|---|---|
| `p5-growth/growth-core.js` | 纯逻辑：attributeReferral / getLeaderboard / sendGift / buildSharePayload |
| `p5-growth/growth-worker.js` | Cloudflare Worker（Modules + D1）：`/growth/referral`、`/growth/leaderboard`、`/growth/gift`、`/growth/share`、`/growth/verify` |
| `p5-growth/inmemory-growth-store.js` | 测试 / 本地 dev 用的内存 Store（积分发放**复用 P2 ledger-core**） |
| `p5-growth/growth-client.js` | 三款 App 共用的浏览器客户端（`createGrowth()`） |
| 部署 / 建表 | 已合并到根目录 `wrangler.toml` + `schema.sql`，见 §3 单体部署 |
| `p5-growth/test-growth.mjs` | 本地测试（归因 + 排行榜 + 礼物 + 幂等 + 合规断言 + Worker 端到端）12 项 |

### 11.3 部署（已统一，见 §3）
> 已合并为单体后端：`/growth/*` 路由随根 `worker.js` 一起部署（见 §3）。`p5-growth/wrangler.toml` 与 `p5-growth/schema.sql` 已并入根目录，请勿再单独执行本节旧命令。

### 11.4 前端接入
```html
<script type="module">
  import { createGrowth } from './p5-growth/growth-client.js';
  const growth = createGrowth({ baseUrl: 'https://teleprompter-growth.<sub>.workers.dev' });
  const { referralCode, attributed } = await growth.attributeReferral({ referralCode });
  const { leaderboard } = await growth.getLeaderboard({ group: 'G123', limit: 10 });
  await growth.sendGift({ toUserId: '987654', amount: 20, reason: 'nice_work' }); // 余额不足抛 insufficient_funds
</script>
```

### 11.5 本地自测
```bash
node --check p5-growth/growth-worker.js
node --test  p5-growth/test-growth.mjs      # 12/12 应全绿
```

---

## 12. P6 增强模块（云端同步 / 双设备遥控 / 语音跟随 / 模板库）

> 范围：增强提词器体验——A 台词云端同步、B 双设备远程控制（Telegram token 中转，绕过蓝牙）、C 语音跟随（Web Speech 纯逻辑可测）、D 台词模板库（合规、禁预测占卜）。
> P6 **不引入积分 / 账本**（仅 A/B 走 initData 验签，D 模板库公开）。**无任何 P2P / 赌博 / 预测**。
> 代码位置：`p6-enhance/`。**本地测试已通过（`node --test p6-enhance/test-*.mjs`，17/17）**，待统一单体部署（见 §3）。

### 12.1 合规铁律（美国 App Store）
- 模板库只放"中性口播框架"，**绝不含** 算命 / 运势 / 预测 / 吉凶 / 卦 / 风水 / 占卜。
- 远程控制只是设备间播放指令中转（play / pause / speed），绝不涉及转账 / 赌博 / 预测。

### 12.2 文件清单
| 文件 | 作用 |
|---|---|
| `p6-enhance/enhance-worker.js` | Cloudflare Worker（Modules + D1）：`/scripts`(GET/POST/DELETE)、`/remote/create`、`/remote/command`、`/remote/state`、`/templates` |
| `p6-enhance/speech-follow.js` | 语音跟随纯逻辑（clamp 等可单测，无浏览器依赖） |
| `p6-enhance/templates.js` | 中性口播模板数据（合规审查过，无预测 / 占卜词） |
| `p6-enhance/scripts-client.js` | 云端同步客户端（`createScripts()`：list / save / delete） |
| `p6-enhance/remote-client.js` | 双设备遥控客户端（`createRemote()`：create / command / state） |
| `p6-enhance/templates-client.js` | 模板库客户端（`createTemplates() / getTemplates()`） |
| 部署 / 建表 | 已合并到根目录 `wrangler.toml` + `schema.sql`，见 §3 单体部署 |
| `p6-enhance/test-*.mjs` | 本地测试（脚本 CRUD / 遥控会话 / 语音 clamp / 模板 / 合规）共 17 项 |

### 12.3 部署（已统一，见 §3）
> 已合并为单体后端：`/scripts`、`/remote`、`/templates` 路由随根 `worker.js` 一起部署（见 §3）。`p6-enhance/wrangler.toml` 与 `p6-enhance/schema.sql` 已并入根目录，请勿再单独执行本节旧命令。

### 12.4 前端接入
```html
<script type="module">
  import { createScripts } from './p6-enhance/scripts-client.js';
  import { createRemote } from './p6-enhance/remote-client.js';
  import { getTemplates } from './p6-enhance/templates-client.js';
  const scripts = createScripts({ baseUrl: 'https://teleprompter-monolith.<sub>.workers.dev' });
  await scripts.saveScript({ title: '我的口播', content: '...' });   // 自动带 initData 验签
  const { templates } = await getTemplates('https://teleprompter-monolith.<sub>.workers.dev');
</script>
```

### 12.5 本地自测
```bash
node --check p6-enhance/enhance-worker.js
node --test  p6-enhance/test-speech.mjs p6-enhance/test-scripts.mjs p6-enhance/test-remote.mjs p6-enhance/test-templates.mjs   # 17/17 应全绿
```

---

## 13. P7 合规 + 多语言（EN/JP/KR/RU）+ 平台对账 + 举报

> 范围：把"美国 App Store 合规红线"落到代码与界面——① 多语框架 zh/en/ja/ko/ru；② 可见的强免责声明（设置页 + 独立"关于"页，五语）；③ 平台侧"收到的 Stars"对账（ADMIN_SECRET 门禁的只读仪表盘 + JSON 汇总）；④ 举报 / 反馈入口。
> 合规红线（凌驾一切）：不预测、不算命、不占卜；积分 ≠ Stars ≠ 法币；无 P2P 转账、无赌博。本模块刻意提供 `complianceScan()` 做危险词自检。
> 代码位置：`p7-compliance/`。**本地测试已通过（`node --test p7-compliance/test-compliance.mjs`，6/6）**，待统一单体部署（见 §3）。

### 13.1 交付清单
| 文件 | 作用 |
|---|---|
| `p7-compliance/i18n.js` | 五语文案框架（zh/en/ja/ko/ru）+ `t()` / `getLang()`（也供其他项目复用） |
| `p7-compliance/compliance-core.js` | 免责声明五语文案 + `submitReport`（举报）+ `complianceScan`（危险词自检） |
| `p7-compliance/compliance-worker.js` | Cloudflare Worker（Modules + D1）：`/compliance/disclaimer`、`/compliance/report` |
| `p7-compliance/inmemory-compliance-store.js` | 测试用内存 Store |
| `p7-compliance/compliance-client.js` | 浏览器客户端（`getDisclaimer` / `submitReport`） |
| 部署 / 建表 | 已合并到根目录 `wrangler.toml` + `schema.sql`，见 §3 单体部署 |
| `p7-compliance/test-compliance.mjs` | 本地测试（五语声明 / 举报记录 / 空 detail 拒 / 危险词自检）6 项 |

### 13.2 前端已落地（index.html 内联）
- **多语切换器**：右上角语言下拉（中文 / EN / 日本語 / 한국어 / Русский），选择持久化到 localStorage，自动渲染全站文案。
- **可见免责声明**：设置页内嵌声明块 + 独立"关于"页，三语随语言切换；明确"积分 ≠ Stars ≠ 法币，不可提现 / 转账 / 交易"。
- **举报 / 反馈**：设置页文本域 + 提交按钮，调用合规 Worker `/compliance/report`（未配 `CONFIG.COMPLIANCE_URL` 时仅本地提示）。

### 13.3 平台 Stars 对账（"管理收到的 Stars"）
P3 的 `payments-worker.js` 已新增（ADMIN_SECRET 门禁）：
- `GET /admin/summary` → JSON：`totalPayments` / `totalStarsReceived` / `totalCreditsGranted` / 最近 20 笔。
- `GET /admin` → HTML 仪表盘，可视化总笔数 / 收到 Stars 总额 / 兑换积分总量 / 最近交易。
> 内部积分 ≠ Stars ≠ 法币；不可提现、不可转账、不可交易。数据仅平台可见。

### 13.4 部署（已统一，见 §3）
> 已合并为单体后端：`/compliance/*` 路由随根 `worker.js` 一起部署（见 §3）。`p7-compliance/wrangler.toml` 与 `p7-compliance/schema.sql` 已并入根目录，请勿再单独执行本节旧命令。

### 13.5 前端接入
```html
<script type="module">
  import { makeComplianceClient } from './p7-compliance/compliance-client.js';
  const compliance = makeComplianceClient({ baseUrl: 'https://teleprompter-compliance.<sub>.workers.dev' });
  const d = await compliance.getDisclaimer('en');     // 五语声明（zh/en/ja/ko/ru）
  await compliance.submitReport({ type: 'abuse', detail: '...' });
</script>
```
> `index.html` 已内联等价多语框架，无需额外引入；仅在"设置 → 举报"真正上报时填写 `CONFIG.COMPLIANCE_URL`。

### 13.6 本地自测（无需 Cloudflare）
```bash
node --check p7-compliance/compliance-worker.js
node --test  p7-compliance/test-compliance.mjs      # 6/6 应全绿
# 覆盖：五语声明齐全 / 举报记录 / 空 detail 拒 / 占卜·预测危险词自检
```

---

*部署配方与 `worker.js` 验签逻辑为三款出海小程序（提词器 / 决策助手 / 表情包）共用模板，后续项目复制即可，仅换 bot token。P2 统一积分账本为「真·全共用」后端，建一次三款白嫖；P3 在其上叠加 Telegram Stars 官方支付；P4 悬赏改稿、P5 病毒增长、P6 增强模块、P7 合规多语均**复用同一 D1 库与验签**，建一次、三款共用。*
