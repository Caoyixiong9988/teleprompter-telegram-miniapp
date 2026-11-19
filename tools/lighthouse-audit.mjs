/**
 * lighthouse-audit.mjs — 网页质量审计（性能 / 无障碍 / 最佳实践 / SEO / PWA）
 *
 * 自包含：临时静态服务器托管单文件 index.html → 启动 Playwright 的 Chromium
 * → Lighthouse 审计 → 输出 JSON + HTML 报告到 lighthouse-report/ → 全部关闭。
 * 线上审计：传 URL 参数即可，例如 node tools/lighthouse-audit.mjs https://teleprompter-49y.pages.dev/
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const ROOT = path.resolve('.');
const OUT_DIR = path.join(ROOT, 'lighthouse-report');
const targetArg = process.argv[2];

let server = null;
let url = targetArg;
if (!url) {
  // 本地静态服务器（只服务 index.html，够单文件应用用）
  const html = fs.readFileSync(path.join(ROOT, 'index.html'));
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port + '/';
}
console.log('[lh] 审计目标: ' + url);

const chromePath = chromium.executablePath();
const chrome = await chromeLauncher.launch({
  chromePath,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
});

let runnerResult;
try {
  runnerResult = await lighthouse(url, {
    port: chrome.port,
    logLevel: 'error',
    output: ['json', 'html'],
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 1, disabled: false },
    formFactor: 'mobile',
    throttlingMethod: 'simulate',
  });
} finally {
  await chrome.kill();
  if (server) server.close();
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const jsonPath = path.join(OUT_DIR, `report-${ts}.json`);
const htmlPath = path.join(OUT_DIR, `report-${ts}.html`);
fs.writeFileSync(jsonPath, runnerResult.report.find((r) => r.type === 'json')?.data || runnerResult.report[0]);
fs.writeFileSync(htmlPath, runnerResult.report.find((r) => r.type === 'html')?.data || '');

const lhr = runnerResult.lhr;
console.log('\n===== Lighthouse 评分（0-100）=====');
for (const [key, cat] of Object.entries(lhr.categories)) {
  console.log(`  ${cat.title.padEnd(20)} ${Math.round(cat.score * 100)}`);
}
console.log('\n===== 关键指标 =====');
for (const k of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index']) {
  const a = lhr.audits[k];
  if (a) console.log(`  ${a.title.padEnd(34)} ${a.displayValue || a.numericValue}`);
}
console.log('\n报告: ' + jsonPath);
console.log('报告: ' + htmlPath);
