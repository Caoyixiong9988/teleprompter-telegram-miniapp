#!/usr/bin/env sh
# 安装本地 Git 测试门禁钩子（只需执行一次）。
# 用法：在仓库根目录运行  sh scripts/install-hooks.sh
set -e

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "错误：当前目录不是 git 仓库。" >&2
  exit 1
}
cd "$ROOT"

git config core.hooksPath .githooks
chmod +x .githooks/pre-push

echo "已安装测试门禁：core.hooksPath = $(git config --get core.hooksPath)"
echo "此后每次 git push 都会自动跑全套测试；失败则拦截推送。"
echo "绕过：SKIP_TESTS=1 git push（全部跳过） / SKIP_E2E=1 git push（只跳 E2E）。"
