# GitHub 注册与云端测试门禁（本人操作指引）

> 为什么需要你本人操作：注册 GitHub 要验证邮箱（登录你的 Outlook 收件箱点确认链接）、
> 通过人机验证 CAPTCHA、同意服务条款。这些是账号安全机制，任何自动化工具都不应也不能代做——
> 强行绕过违反 GitHub 服务条款，账号可能被封。
>
> 好消息：**本地门禁已经装好并生效**，不注册 GitHub 也能享受"每次 push 自动跑测试"。
> 本文件只在你想额外获得"云端留痕 + 徽章"时才需要。

## 一、本地门禁（已完成，无需操作）

- 钩子位置：`.githooks/pre-push`，已通过 `core.hooksPath=.githooks` 启用。
- 效果：每次 `git push` 自动跑「单元测试 → i18n → jsdom → E2E(Chromium)」，任一失败即拦截推送。
- 换电脑后只需跑一次：`sh scripts/install-hooks.sh`
- 紧急绕过：`SKIP_TESTS=1 git push`（全跳） / `SKIP_E2E=1 git push`（只跳约 6.6 分钟的 E2E）。

## 二、注册 GitHub（约 5 分钟，本人操作）

1. 打开 https://github.com/signup
2. 用你的邮箱 `masterzen2019@outlook.com` 注册（一个邮箱只能注册一个 GitHub 账号）。
3. 设置用户名（建议与 Gitee 一致或接近，例如 `cao-yixiong`；用户名会出现在你的主页地址里）。
4. 设置强密码 → 通过人机验证 → 点 **Create account**。
5. 去 Outlook 收件箱找到 GitHub 验证邮件，点确认链接完成验证。
6. （可选但推荐）开启两步验证：Settings → Password and authentication → Enable 2FA。

> 若注册页提示该邮箱已被使用：说明你以前注册过但忘了，用登录页的 "Forgot password" 找回即可。

## 三、把仓库迁到 GitHub

注册完成后，任选一种：

**方式 A：镜像推送（推荐，保留 Gitee 作为国内副本）**

```bash
cd 项目目录
git remote add github https://github.com/<你的用户名>/teleprompter-telegram-miniapp.git
# 先在 GitHub 网页上点 New repository 创建空仓库（不要勾选 README/.gitignore，保持空）
git push github master
```

此后两边都保留：`git push origin master`（Gitee）、`git push github master`（GitHub）。

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
- 若未来换成 Gitee Go（Gitee 自带 CI），需另写 `.gitee/workflows/*.yml`，本文件不涉及。
