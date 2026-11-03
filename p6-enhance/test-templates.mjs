/**
 * test-templates.mjs — P6(D) 台词模板库 本地测试（无需 Cloudflare）
 * 运行：node --test p6-enhance/test-templates.mjs
 *
 * 覆盖：
 *   1) 模板可加载，且涵盖关键 category（口播开场白 / 产品介绍 / 感谢结尾 / 教学分段）
 *   2) 质量断言：所有模板正文不含绝对化承诺用语（保证 / 100% / 根治 等）
 *   3) Worker GET /templates（PUBLIC）返回模板列表
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TEMPLATES } from './templates.js';
import worker from './enhance-worker.js';
import { makeEnv, containsClaim } from './test-helpers.mjs';

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

test('2) 质量：模板正文不含绝对化承诺用语', () => {
  for (const t of TEMPLATES) {
    const blob = [t.id, t.title, t.category, t.body].join(' | ');
    assert.equal(
      containsClaim(blob),
      false,
      `模板「${t.title}」含绝对化承诺用语，用户照读后可能形成不当承诺`
    );
  }
});

test('3) Worker GET /templates（PUBLIC）返回模板列表', async () => {
  const env = makeEnv();
  const r = await worker.fetch(new Request('https://x/templates'), env);
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(Array.isArray(d.templates) && d.templates.length === TEMPLATES.length);
  // 且同样不含绝对化承诺用语
  for (const t of d.templates) {
    assert.equal(containsClaim([t.title, t.category, t.body].join(' | ')), false);
  }
});
