# ScriptDeck · 提词器 Telegram Mini App

> **产品对外品牌名：`ScriptDeck`**（副标题 `Teleprompter & Cue Cards`，中/日/韩各为「提词器」「プロンプター＆キューヶード」「텔레프롬프터 & 큐 카드」）。
> 命名理由：App Store / Google Play 上 `Teleprompter`、`EasyPrompt`、`CueFlow`、`CueDeck`、`Promptr`、`EasyCue`、`Sayline` 等同品类名称已被占用（含 100k+ 安装的竞品），`ScriptDeck` 经检索**同品类无同名 App**。
> ⚠️ **内部技术标识沿用 `teleprompter`，不随品牌改名**：D1 库 `teleprompter-credits`、Worker `teleprompter-monolith`、npm 包名、以及 `index.html` 的 `LS_KEY = 'teleprompter_state_v1'`（改了会导致老用户已存讲稿全部丢失）。这些用户不可见，改动只会有额外风险。

面向海外市场（美 / 日 / 韩）的 Telegram 小程序提词器。本仓库为**私有源码备份**。

> **产品宪法**：[【产品宪法】所有APP共同底线.md](./【产品宪法】所有APP共同底线.md) 适用于当前及未来每一个 APP，优先级高于任何单个功能清单。核心是「用户可以跟自己玩，但不能跟别人玩」——不产生任何需要人工裁决的用户间关系。
>
> **P4 悬赏改稿已于 2026-11-10 下线**：运行时路由与建表均已移除，`p4-bounty/` 仅作存档。原因见产品宪法与 CHANGELOG。

> **合规声明**：本产品为「工具类」应用，只提供提词显示与创作辅助，**不做内容承诺或结果保证、不做赌博、不做 P2P 转账**；所有积分与支付均为平台中介的官方服务（Telegram Stars）。

> **变更记录**：每次改动见 [CHANGELOG.md](./CHANGELOG.md)（随代码一起备份到 Gitee）。

## 当前进度

| 阶段 | 模块 | 状态 | 说明 |
|---|---|---|---|
| P0 | initData 验签（`worker.js`） | ✅ | 单体 Worker 内建 |
| P1 | 核心提词器 + **从文件导入讲稿**（`index.html` 单文件） | ✅ | 导入为免费功能，零依赖纯本地 |
| P2 | 跨 App 统一积分账本 | ✅ | |
| P3 | Telegram Stars 支付账本 | ✅ | 后端账本就绪，**前端收银台未接** |
| P4 | ~~悬赏改稿（escrow）~~ | ⛔ 已下线 | 违反产品宪法；目录留作存档 |
| P5 | 病毒增长 / 邀请 | ✅ | |
| P6 | 增强（云同步 / 远程控制 / 语音跟随 / 模板） | ✅ | |
| P7 | 合规（免责声明 / 举报反馈） | ✅ | |
| P8 | 导入专项测试 | ✅ | 15/15 |

`npm test` → **85 / 85**；`node test_i18n_real.mjs` → **32 / 32**（五语键集各 164 键）。

> 以上均为**本地 mock 测试**。后端从未部署、Stars 支付前端从未接通、真机零验证——发布前必须补齐，见 [README_deploy.md](README_deploy.md) 与 CHANGELOG 顶部的「尚未验证」清单。

## 目录结构

```
.
├── index.html                    # 单文件提词器（P1 + 文件导入）
├── worker.js                     # 单体 Worker 路由（P0 验签）
├── schema.sql / wrangler.toml     # 单一 D1 建表与部署配置
├── shared/                       # 验签 / 积分账本共享核心
├── 【产品宪法】所有APP共同底线.md  # 跨 APP 最高优先级约束
├── CHANGELOG.md                  # 每次改动的可读清单
├── p2-credits/ p3-payments/       # 积分 / Stars 支付账本
├── p4-bounty/                    # 【已下线】仅存档，不挂路由不建表
├── p5-growth/ p6-enhance/         # 增长 / 增强模块
├── p7-compliance/                # 免责声明与反馈
├── p8-import/                    # 导入功能专项测试
├── test_i18n_real.mjs            # 前端 jsdom 回归（32 项）
└── README_deploy.md              # 部署手册（Cloudflare Workers + D1）
```

## 从文件导入讲稿（免费）

设置面板 →「讲稿内容」→「从文件导入讲稿」。纯本地解析，不上传、不联网、不需要 Pro。

- **支持**：TXT / MD / CSV / SRT / VTT / DOCX / ODT / XLSX（另含 `.text` / `.markdown` / `.log`）
- **不支持**：旧版 `.doc`、PDF、RTF、Pages / WPS —— 请在 Word 里另存为 `.docx` 或 `.txt`
- **限制**：单文件 ≤ 2 MB，提取后正文 ≤ 90 KiB
- **行为**：导入后**新建一篇讲稿**（标题取文件名），绝不覆盖当前内容；SRT / VTT 自动去掉时间码只留台词
- 中文 txt 若为 GBK 编码会自动识别，无需手工转换

## 本地测试

```bash
npm test                   # 后端 + 导入全部单测（85 项）
node test_i18n_real.mjs    # 前端真实 DOM 冒烟（32 项）
```

导入功能还需真机手工验收：Telegram Android / iOS / Desktop / Web 四端文件选择器、GBK 中文 txt、带表格与图片的 docx、大文件。清单见 CHANGELOG 顶部。

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
