# GitHub 注册与云端测试门禁（本人操作指引）

> 最后核对：2026-11-19。
>
> 为什么需要你本人操作：注册 GitHub 要验证邮箱（登录**注册邮箱**收件箱点确认链接）、
> 通过人机验证 CAPTCHA、同意服务条款。这些是账号安全机制，任何自动化工具都不应也不能代做——
> 强行绕过违反 GitHub 服务条款，账号可能被封。
>
> 好消息：**本地门禁已经装好并生效**，不注册 GitHub 也能享受"每次 push 自动跑测试"。
> 本文件只在你想额外获得"云端留痕 + 徽章"时才需要。
>
> 门禁里具体跑了哪些 Playwright 用例、如何新增用例，见 [Playwright测试矩阵与执行手册.md](./Playwright测试矩阵与执行手册.md)。

## 一、本地门禁（已完成，无需操作）

- 钩子位置：`.githooks/pre-push`，已通过 `core.hooksPath=.githooks` 启用。
- 效果：每次 `git push` 自动跑「单元测试 → jsdom(iOS 编辑器) → i18n 七语 → E2E(Chromium)」，任一失败即拦截推送（全套约 6.6 分钟）。
- 换电脑后只需跑一次：`sh scripts/install-hooks.sh`。它会同时设置 `core.hooksPath` 和 **SSH 30 秒保活**——后者是因为 6.6 分钟门禁期间 SSH 空闲会被 Gitee 断开，导致 push 报 `exit 141`、`Connection closed by remote host`；没它的话门禁全绿也推不上去。
- 紧急绕过：`SKIP_TESTS=1 git push`（全跳） / `SKIP_E2E=1 git push`（只跳约 6.6 分钟的 E2E，仍跑单元 + jsdom + i18n）。

## 二、注册 GitHub（约 5 分钟，本人操作）

> **重要（2026-11 实测）：不要用 Outlook / Hotmail 邮箱注册。**
> GitHub 自 2026 年 9 月起暂停用 `@outlook.com` / `@hotmail.com` 注册新账号（域名级反滥用熔断，
> 官方客服在社区确认，无例外通道、无恢复时间表）。表现为填完邮箱即提示
> "Email domain could not be verified"，验证邮件根本不会发出；换浏览器、清缓存、查垃圾箱、换网络都无效。
> 已有账号不受影响。因此 `masterzen2019@outlook.com` 无法用于新注册。

1. 打开 https://github.com/signup
2. **换一个邮箱注册**：首选 Gmail（送达最稳）；QQ / 163 也可以，但偶尔送达慢；企业邮箱也行。一个邮箱只能注册一个 GitHub 账号。
3. 设置用户名（建议与 Gitee 一致或接近，例如 `cao-yixiong`；若被占用就换一个。用户名会出现在主页地址 `github.com/<用户名>` 里）。
4. 设置强密码 → 通过人机验证 → 点 **Create account**。
5. 去注册邮箱收件箱找到 GitHub 验证邮件（若没有，翻垃圾邮件/推广分类），点确认链接完成验证。
6. **（重要）把 Outlook 邮箱加回去**：注册成功后进入 Settings → Emails → Add email address，
   添加 `masterzen2019@outlook.com` 并验证；随后在 Settings → Emails 里把它设为 **Primary email**（提交署名邮箱）。
   这样对外显示的 commit 邮箱仍是你的 Outlook，只需用 Gmail 完成"开户"这一步。
7. （可选但推荐）开启两步验证：Settings → Password and authentication → Enable 2FA。

> 若注册页提示该邮箱已被使用：说明你以前注册过但忘了，用登录页的 "Forgot password" 找回即可。
>
> **若提示 "Too many requests"（限流）**：立即停手，不要反复点、不要换 IP 硬试——连续重试会延长限流，
> 甚至把 IP 标记成风险。这不是封号，是 GitHub 的临时风控，等几小时到一天会自行恢复。
> 期间可以先把 Gmail 注册好，下次一次填完提交。

## 三、把仓库迁到 GitHub

> **认证提醒（必看）**：GitHub 从 2021 年起已禁用"账号密码"推送代码。用下面 HTTPS 地址 `git push` 时，
> 密码框要填 **Personal Access Token（PAT）**，不是登录密码。生成路径：
> 右上角头像 → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token，
> 勾选 `repo` 权限，复制保存好（只显示一次）。
> 更省事：直接装 GitHub Desktop 或 `gh` CLI 登录，由它们代管凭据，就不用手动贴 PAT。

注册完成后，任选一种：

**方式 A：镜像推送（推荐，保留 Gitee 作为国内副本）**

```bash
cd 项目目录
git remote add github https://github.com/<你的用户名>/teleprompter-telegram-miniapp.git
# 先在 GitHub 网页上点 New repository 创建空仓库（不要勾选 README/.gitignore，保持空）
git push github master
```

此后两边都保留：`git push origin master`（Gitee）、`git push github master`（GitHub）。
注意：本地已配置的 SSH 保活只作用于 SSH 协议，HTTPS 推送不受影响，也不受影响于它。

**方式 B：改为 GitHub 主仓库**

```bash
git remote set-url origin https://github.com/<你的用户名>/teleprompter-telegram-miniapp.git
git push origin master
```

## 四、云端门禁自动生效

仓库里有 `.github/workflows/test.yml`。当你把代码推到 GitHub 的 `master` 或 `main` 分支时，
GitHub Actions 会自动跑：npm ci → 单元测试 → i18n → jsdom → Worker 冒烟 → E2E(Chromium)。

查看结果：仓库页面顶部 **Actions** 标签 → 点最新的 workflow run。
首次运行需要 GitHub 授权 Actions（仓库 Settings → Actions → General → Allow all actions）。

可选：在 README 顶部加状态徽章（把 `<用户名>` 换成你的）：

```markdown
![Test gate](https://github.com/<用户名>/teleprompter-telegram-miniapp/actions/workflows/test.yml/badge.svg)
```

## 五、注意事项

- GitHub 公开仓库免费，私有仓库也有免费 Actions 额度（每月 2000 分钟），本项目的测试量远用不完。
- `.github/workflows/test.yml` 只在 GitHub 上生效；Gitee 不认它，所以本地钩子仍是 Gitee 推送的守门人。
- 若未来换成 Gitee Go（Gitee 自带 CI）：它是在 Gitee 网页上配置流水线，与本文件的 GitHub Actions 不通用；免费额度约每月 500 分钟，本文件不涉及。
