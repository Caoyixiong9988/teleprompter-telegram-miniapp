/**
 * test-compliance.mjs — P7 合规模块测试（node --test，无需 Cloudflare）
 * 覆盖：七语声明齐全、未知语言回落、举报记录、空 detail 拒绝。
 * 2026-11-19：de/fr 补齐，与前端七语口径一致（此前 de/fr 会静默回落成中文）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { getDisclaimerText, submitReport } from './compliance-core.js';
import { makeInMemoryComplianceStore } from './inmemory-compliance-store.js';
import { SUPPORTED_LANGS, LANG_NAMES, getLang, UI_STRINGS } from './i18n.js';

const SEVEN_LANGS = ['zh', 'en', 'de', 'fr', 'ja', 'ko', 'ru'];

test('免责声明七语齐全（zh/en/de/fr/ja/ko/ru 均有 body/paid，且不再含投稿提示）', () => {
  for (const lang of SEVEN_LANGS) {
    const d = getDisclaimerText(lang);
    assert.equal(d.lang, lang, `${lang} 未返回自身语言（可能回落到 zh）`);
    assert.ok(d.title, `${lang} 缺 title`);
    assert.ok(d.body, `${lang} 缺 body`);
    assert.ok(d.paidNotice, `${lang} 缺 paidNotice`);
    assert.equal('submitNotice' in d, false, `${lang} 仍暴露已下线的 submitNotice`);
  }
});

test('SUPPORTED_LANGS 与前端七语一致，含 de/fr', () => {
  assert.deepEqual(SUPPORTED_LANGS, SEVEN_LANGS);
  assert.equal(getLang('de'), 'de');
  assert.equal(getLang('fr'), 'fr');
  assert.ok(LANG_NAMES.de, 'LANG_NAMES 缺 de');
  assert.ok(LANG_NAMES.fr, 'LANG_NAMES 缺 fr');
});

test('de/fr 声明是本地化文本而非中文回落', () => {
  const de = getDisclaimerText('de');
  const fr = getDisclaimerText('fr');
  const zh = getDisclaimerText('zh');
  assert.notEqual(de.body, zh.body, 'de 声明回落到中文');
  assert.notEqual(fr.body, zh.body, 'fr 声明回落到中文');
  assert.ok(de.body.includes('ScriptDeck') && /ä|ö|ü|ß/.test(de.body), 'de 声明不像德语');
  assert.ok(fr.body.includes('ScriptDeck') && /é|è|à|ç/.test(fr.body), 'fr 声明不像法语');
  // i18n.js 内部每个语言都要有完整字段，防止追加语言时漏键
  for (const lang of SEVEN_LANGS) {
    const s = UI_STRINGS[lang];
    for (const key of ['disclaimerTitle', 'disclaimerBody', 'paidNotice', 'reportTitle', 'reportThanks']) {
      assert.ok(s && s[key], `${lang} 缺 UI_STRINGS.${key}`);
    }
  }
});

test('未知语言回落到 zh', () => {
  const d = getDisclaimerText('xx');
  assert.equal(d.lang, 'zh');
  assert.ok(d.body);
});

test('submitReport 正常记录举报', async () => {
  const store = makeInMemoryComplianceStore();
  const res = await submitReport(store, { type: 'abuse', targetId: 'script-9', detail: '侵权内容', userId: '123' });
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
