import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const PAGE_URL = pathToFileURL(path.resolve('index.html')).href;
const BASELINE = JSON.parse(readFileSync(path.resolve('e2e/a11y-baseline.json'), 'utf8'));

// 与其它 spec 一致：阻断外部 Telegram SDK，避免测试依赖外网、CI 与本地行为分歧。
test.beforeEach(async ({ page }) => {
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.abort());
});

// 基线经 Chromium + WebKit 双引擎验证：axe 读 CSS 计算值，两者违规数一致。
// 若将来某引擎出现分歧，可在此按 browserName 分基线。

/**
 * 无障碍（WCAG）硬门禁：用 axe-core 扫真实渲染的 DOM。
 *
 * 2026-11-19 首审的 serious/critical 违规已全部修复，a11y-baseline.json 已清零。
 * 现在基数为 0，任何 serious/critical 违规都会被判为「新增」并让测试失败——
 * 从「只防退化」升级为「零违规」硬门禁。
 */
function checkAgainstBaseline(label, blocking, baselineKey) {
  const current = {};
  for (const v of blocking) current[v.id] = v.nodes.length;
  const base = BASELINE[baselineKey] || {};
  const regressions = [];
  for (const [id, count] of Object.entries(current)) {
    const b = base[id] ?? 0;
    if (count > b) regressions.push(`${id}: ${b} → ${count}`);
  }
  const cleared = Object.keys(base).filter((id) => !current[id]);
  console.log(`[axe] ${label}: ${JSON.stringify(current)} | 基线 ${JSON.stringify(base)}`);
  if (cleared.length) console.log(`[axe] ${label}: 已消除 ${cleared.join(', ')} 🎉`);
  expect(regressions, `${label} 无障碍退化: ${regressions.join('; ')}`).toHaveLength(0);
}

async function scan(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

test('A11y-1 主界面无障碍不退化', async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.waitForTimeout(300);
  checkAgainstBaseline('主界面', await scan(page), 'main');
});

test('A11y-2 设置面板无障碍不退化', async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const el = document.getElementById('setSheet') || document.getElementById('settingsSheet');
    if (el) el.classList.remove('hidden');
  });
  await page.waitForTimeout(100);
  checkAgainstBaseline('设置面板', await scan(page), 'settings');
});

test('A11y-3 所有可见交互按钮都有可访问名称', async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.waitForTimeout(200);
  const nameless = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      if (el.closest('.hidden')) continue;
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      const title = el.getAttribute('title') || '';
      if (!label && !title) out.push(el.id || el.className || el.outerHTML.slice(0, 80));
    }
    return out;
  });
  console.log('[axe] 无可访问名称的可见按钮: ' + JSON.stringify(nameless));
  expect(nameless, nameless.join(', ')).toHaveLength(0);
});
