/**
 * test-compliance.mjs — P7 合规模块测试（node --test，无需 Cloudflare）
 * 覆盖：五语声明齐全、举报记录、空 detail 拒绝、合规危险词自检。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { getDisclaimerText, submitReport, complianceScan } from './compliance-core.js';
import { makeInMemoryComplianceStore } from './inmemory-compliance-store.js';

test('免责声明五语齐全（zh/en/ja/ko/ru 均有 body/paid/submit）', () => {
  for (const lang of ['zh', 'en', 'ja', 'ko', 'ru']) {
    const d = getDisclaimerText(lang);
    assert.ok(d.title, `${lang} 缺 title`);
    assert.ok(d.body, `${lang} 缺 body`);
    assert.ok(d.paidNotice, `${lang} 缺 paidNotice`);
    assert.ok(d.submitNotice, `${lang} 缺 submitNotice`);
  }
});

test('未知语言回落到 zh', () => {
  const d = getDisclaimerText('xx');
  assert.equal(d.lang, 'zh');
  assert.ok(d.body);
});

test('submitReport 正常记录举报', async () => {
  const store = makeInMemoryComplianceStore();
  const res = await submitReport(store, { type: 'abuse', targetId: 'bounty-9', detail: '侵权内容', userId: '123' });
  assert.equal(res.ok, true);
  assert.equal(typeof res.id, 'number');
  assert.equal(store._count(), 1);
  assert.equal(store._all()[0].type, 'abuse');
});

test('submitReport 空 detail 被拒', async () => {
  const store = makeInMemoryComplianceStore();
  const res = await submitReport(store, { detail: '   ' });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'empty_detail');
  assert.equal(store._count(), 0);
});

test('submitReport 缺 detail 被拒', async () => {
  const store = makeInMemoryComplianceStore();
  const res = await submitReport(store, {});
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'empty_detail');
});

test('complianceScan 命中占卜/预测危险词返回 unsafe', () => {
  assert.equal(complianceScan('今日运势测算').safe, false);
  assert.equal(complianceScan('fortune telling').safe, false);
  assert.equal(complianceScan('纯工具提词器').safe, true);
  assert.equal(complianceScan('').safe, true);
});
