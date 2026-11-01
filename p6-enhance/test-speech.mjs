/**
 * test-speech.mjs — P6(C) 语音跟随 本地测试（无需 Cloudflare / 浏览器）
 * 运行：node --test p6-enhance/test-speech.mjs
 *
 * 仅覆盖"可测纯逻辑"：mapSpeechRateToScrollSpeed + SpeechFollowController。
 * 真正的 webkitSpeechRecognition 绑定由 createSpeechRecognition 守卫，仅在浏览器执行；
 * 这里额外验证：Node 下 import 该模块 / 调用均不崩，且返回 null。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mapSpeechRateToScrollSpeed,
  clamp,
  SpeechFollowController,
  createSpeechRecognition,
  MIN_SCROLL_PX,
  MAX_SCROLL_PX,
} from './speech-follow.js';

test('1) 映射正确：说慢→滚慢，说快→滚快，匀速→不变', () => {
  const base = 150, cur = 60;
  // 半速：目标 30
  assert.equal(mapSpeechRateToScrollSpeed(75, base, cur), 30);
  // 同速：目标 60
  assert.equal(mapSpeechRateToScrollSpeed(150, base, cur), 60);
  // 双倍速：目标 120
  assert.equal(mapSpeechRateToScrollSpeed(300, base, cur), 120);
});

test('2) 钳制到合理边界 [MIN, MAX]', () => {
  // 极快语速（base 极小或 current 极大）→ 不超过 MAX
  assert.equal(mapSpeechRateToScrollSpeed(100000, 150, 400), MAX_SCROLL_PX);
  // 极慢语速 → 不低于 MIN
  assert.equal(mapSpeechRateToScrollSpeed(1, 150, 400), MIN_SCROLL_PX);
  assert.equal(clamp(Infinity, MIN_SCROLL_PX, MAX_SCROLL_PX), MAX_SCROLL_PX);
  assert.equal(clamp(-50, MIN_SCROLL_PX, MAX_SCROLL_PX), MIN_SCROLL_PX);
});

test('3) 无 NaN / undefined：非法输入返回 0 而非 NaN', () => {
  assert.strictEqual(mapSpeechRateToScrollSpeed(NaN, 150, 60), 0);
  assert.strictEqual(mapSpeechRateToScrollSpeed(150, NaN, 60), 0);
  assert.strictEqual(mapSpeechRateToScrollSpeed(150, 0, 60), 0);     // baseWpm<=0
  assert.strictEqual(mapSpeechRateToScrollSpeed(150, 150, undefined), 0);
  const r = mapSpeechRateToScrollSpeed(150, 150, 60);
  assert.ok(Number.isFinite(r) && r !== undefined, '结果必须是有限数');
});

test('4) SpeechFollowController 随识别结果微调速度并回调', () => {
  let called = null;
  const ctrl = new SpeechFollowController({ baseWpm: 150, initialScrollPx: 60, onSpeedChange: (s) => { called = s; } });
  // 说快一倍：60 * (300/150) = 120
  const next = ctrl.handleResult({ transcript: 'one two three four five six', durationSec: 1.2 }); // 6 词 /1.2s*60 = 300 wpm
  assert.equal(next, 120);
  assert.equal(ctrl.scrollPx, 120);
  assert.equal(called, 120);

  // 无法估算时长 → 保持原速
  assert.equal(ctrl.handleResult({ transcript: 'hi', durationSec: 0 }), 120);
});

test('5) 浏览器绑定在 Node 下安全返回 null（不崩）', () => {
  // typeof window === 'undefined' → 直接 null，绝不抛错
  assert.strictEqual(createSpeechRecognition({ onResult() {} }), null);
});
