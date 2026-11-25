# BotFather 媒体预览 · 逐项上传清单

> 对象：`@Dfb9988bot`　素材目录：`media-preview/`（桌面备份：`C:/Users/maste/Desktop/ScriptDeck-Media-Preview/`）
> 原则：先启用 Main Mini App，再传媒体；先传英文（兜底包），再传其他语言；每组内按编号顺序上传。

---

## 0. 前置检查（不做这步，媒体预览入口不出现）

- [ ] 打开 Telegram → 搜索 `@BotFather` → 发送 `/mybots` → 选择 `@Dfb9988bot`
- [ ] **Bot Settings → Configure Mini App → Enable Mini App**，URL 填：
  `https://teleprompter-49y.pages.dev/`
- [ ] 回到 Bot Settings → Menu Button，确认按钮 URL 也是同一个地址、按钮文字为 `ScriptDeck`（或你想要的短名称）
- [ ] 启用成功后，Bot 资料页应出现 **Launch app** 按钮；只有这时才往下走

> 官方规则：媒体预览（截图 + 视频）只有启用 Main Mini App 后才能上传；预览按用户 App 语言展示，没有对应语言包时回退到默认（英文）包。

---

## 1. 默认语言包（en）— 必传，其他语言的兜底

素材路径：`screens/en/`、`video/en.mp4`

| 顺序 | 文件 | 画面内容 | 展示目的 |
|---|---|---|---|
| 1 | `01-main.png` | 主界面：英文示例讲稿 + 顶部标题 + 字数徽标 | 第一眼看清「这是一个提词器」 |
| 2 | `02-highlight.png` | 播放态：正文逐词黄块高亮 + 进度条 | 核心功能：跟读不迷路 |
| 3 | `03-library.png` | 讲稿库面板：3 篇讲稿列表 | 多讲稿管理 |
| 4 | `04-settings.png` | 设置面板：字号/颜色/速度/讲稿设置 | 可定制，不是一次性工具 |
| 5 | `05-card.png` | 成片卡弹层 | 完成后的分享物 |
| 6 | `06-finish.png` | 完成卡弹层：署名 + 读完篇数 + 邀请链接 | 成就与拉新闭环 |
| 7 | `video/en.mp4` | 8.6 秒演示：输入稿 → 播放高亮 → 讲稿库 → 完成卡 | 动态展示流畅度（H.264/无音轨） |

- [ ] 按上表顺序上传 en 的 6 张截图 + 1 段视频
- [ ] 若 BotFather 界面把视频和截图分开添加：先把 6 张截图按序传完，再传视频（视频会排在末尾）

## 2. 中文包（zh）

素材路径：`screens/zh/`、`video/zh.mp4`

- [ ] `01-main.png` → `06-finish.png` 按顺序上传（画面与 en 一一对应，界面与示例稿均为中文）
- [ ] `video/zh.mp4` 上传（8.6 秒中文界面演示）

## 3. 其余语言包（只传截图，顺序同 en）

| 语言 | 目录 | 操作 |
|---|---|---|
| 日本語（海外主战场） | `screens/ja/` | [ ] 01 → 06 共 6 张 |
| 한국어（海外主战场） | `screens/ko/` | [ ] 01 → 06 共 6 张 |
| Français | `screens/fr/` | [ ] 01 → 06 共 6 张 |
| Deutsch | `screens/de/` | [ ] 01 → 06 共 6 张 |
| Русский | `screens/ru/` | [ ] 01 → 06 共 6 张 |

> 这五种语言没有对应演示视频。若只传截图，用户看到的是该语言的 6 张图，视频位可能空缺；如果希望日/韩用户也有视频，可以先用 `video/en.mp4`（英文界面）占位，或让我补生成 ja/ko 视频。

---

## 4. 上传后验收（必须真机确认）

- [ ] 打开 `@Dfb9988bot` 的**资料页**（点头像，不是聊天页）：能看到 **Launch app** 按钮 + 媒体轮播
- [ ] 点 Launch app：直接进入 ScriptDeck Mini App（不是 Bot 聊天页）
- [ ] Telegram 界面语言切到 English：看到 en 套（含视频）
- [ ] 切到简体中文：看到 zh 套（含中文视频）
- [ ] 切到日本語：看到 ja 套截图
- [ ] 用一个**没启动过该 Bot** 的账号搜索：Apps 标签搜不到属正常（官方只对已启动过该应用的用户显示）
- [ ] 媒体不出现时：确认 Main Mini App 已启用 → 杀掉 Telegram 进程重开 → Settings → Data and Storage → Storage Usage → Clear cache

---

## 5. 备注

- 截图里的邀请链接是 `https://t.me/Dfb9988bot?startapp=preview`，Bot 名真实有效，`preview` 只是演示用推荐码。
- 若需要重生成素材：`cd 项目根 && node media-preview/generate.mjs`；只重录视频加 `--video-only`。
- 素材已随提交 `0576d83` 进入 Gitee / GitHub，桌面另有一份完整备份。
