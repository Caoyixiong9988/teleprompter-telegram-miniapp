import { defineConfig } from '@playwright/test';

// A 层未测按钮的真浏览器回归套件。
// 页面是单文件 index.html，用 file:// 直接打开；后端用 page.route 拦截，不依赖真实 Worker。
export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium' },
    // WebKit 用 npx playwright install webkit 安装后可用：
    // 逐项差异用 npm run test:e2e:all 观察，主门禁默认跑 chromium。
    { name: 'webkit' },
  ],
});
