/**
 * test-templates.mjs — P6(D) 台词模板库 本地测试（无需 Cloudflare）
 * 运行：node --test p6-enhance/test-templates.mjs
 *
 * 覆盖：
 *   1) 模板可加载，且涵盖关键 category（口播开场白 / 产品介绍 / 感谢结尾 / 教学分段）
 *   2) 合规断言：所有模板正文绝不出现算命/预测/运势/吉凶/卦/风水/占卜 等关键词
 *   3) Worker GET /templates（PUBLIC）返回模板列表
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TEMPLATES } from './templates.js';
import worker from './enhance-worker.js';
import { makeEnv, containsForbidden } from './test-helpers.mjs';

const REQUIRED_CATEGORIES = ['口播开场白', '产品介绍', '感谢结尾', '教学分段'];

test('1) 模板可加载，且关键 category 齐全', () => {
  assert.ok(Array.isArray(TEMPLATES) && TEMPLATES.length > 0, '模板数组非空');
  for (const t of TEMPLATES) {
    assert.ok(t.id && t.title && t.category && t.body, `模板 ${t.id || '?'} 字段完整`);
  }
  const cats = new Set(TEMPLATES.map((t) => t.category));
  for (const c of REQUIRED_CATEGORIES) {
    assert.ok(cats.has(c), `缺少模板分类：${c}`);
  }
});

test('2) 合规：模板正文绝不含算命/预测/运势等关键词', () => {
  for (const t of TEMPLATES) {
    const blob = [t.id, t.title, t.category, t.body].join(' | ');
    assert.equal(
      containsForbidden(blob),
      false,
      `模板「${t.title}」命中违规关键词，违反美国 App Store 合规（非算命/非预测）`
    );
  }
});

test('3) Worker GET /templates（PUBLIC）返回模板列表', async () => {
  const env = makeEnv();
  const r = await worker.fetch(new Request('https://x/templates'), env);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(Array.isArray(d.templates) && d.templates.length === TEMPLATES.length);
  // 且同样满足合规
  for (const t of d.templates) {
    assert.equal(containsForbidden([t.title, t.category, t.body].join(' | ')), false);
  }
});
