# ScriptDeck · 提词器 Telegram Mini App

> **产品对外品牌名：`ScriptDeck`**（副标题 `Teleprompter & Cue Cards`，中/日/韩各为「提词器」「プロンプター＆キューヶード」「텔레프롬프터 & 큐 카드」）。
> 命名理由：App Store / Google Play 上 `Teleprompter`、`EasyPrompt`、`CueFlow`、`CueDeck`、`Promptr`、`EasyCue`、`Sayline` 等同品类名称已被占用（含 100k+ 安装的竞品），`ScriptDeck` 经检索**同品类无同名 App**。
> ⚠️ **内部技术标识沿用 `teleprompter`，不随品牌改名**：D1 库 `teleprompter-credits`、Worker `teleprompter-monolith`、npm 包名、以及 `index.html` 的 `LS_KEY = 'teleprompter_state_v1'`（改了会导致老用户已存讲稿全部丢失）。这些用户不可见，改动只会有额外风险。

面向海外市场（美 / 日 / 韩）的 Telegram 小程序提词器。本仓库为**私有源码备份**，包含 P0–P6 全部模块。

> **合规声明**：本产品为「工具类」应用，只提供提词显示与创作辅助，**不做内容承诺或结果保证、不做赌博、不做 P2P 转账**；所有积分与支付均为平台中介的官方服务（Telegram Stars）。

> **变更记录**：每次改动见 [CHANGELOG.md](./CHANGELOG.md)（随代码一起备份到 Gitee）。

## 当前进度

| 阶段 | 模块 | 状态 | 本地测试 |
|---|---|---|---|
| P0 | initData 验签（`worker.js`） | ✅ | — |
| P1 | 核心提词器（`index.html` 单文件） | ✅ | — |
| P2 | 跨 App 统一积分账本 | ✅ | 5/5 |
| P3 | Telegram Stars 支付账本 | ✅ | 11/11 |
| P4 | 悬赏改稿（escrow） | ✅ | 6/6 |
| P5 | 病毒增长 / 邀请 | ✅ | 12/12 |
| P6 | 增强（云同步 / 远程控制 / 语音跟随 / 模板） | ✅ | 17/17 |

合计 **51 / 51** 本地测试通过。

## 目录结构

```
.
├── index.html            # 单文件提词器（P1）
├── worker.js             # initData 验签（P0）
├── p2-credits/           # 跨 App 统一积分账本
├── p3-payments/          # Telegram Stars 支付
├── p4-bounty/            # 悬赏改稿
├── p5-growth/            # 病毒增长
├── p6-enhance/           # 增强模块（云同步/远程/语音/模板）
└── README_deploy.md      # 部署手册（Cloudflare Workers + D1）
```

## 本地测试

各模块自带测试，进入对应目录运行：

```bash
cd p2-credits && node --test
cd p3-payments && node --test
cd p4-bounty  && node --test
cd p5-growth  && node --test
cd p6-enhance && node --test
```

## 部署

见 **[README_deploy.md](README_deploy.md)**（Cloudflare Workers + D1，各模块共用同一 D1 库）。

密钥（`BOT_TOKEN` / `ADMIN_SECRET` / `WEBHOOK_SECRET`）一律通过 `wrangler secret put` 注入，**切勿写进代码或提交到仓库**。

## 备份

本仓库为私有仓，已配置 SSH。日常备份二选一：

- **双击** 仓库根目录的 `backup.bat`（一键 add / commit / push）；
- 或手动执行：

```bash
git add -A && git commit -m "backup" && git push
```
