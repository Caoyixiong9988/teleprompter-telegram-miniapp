/**
 * speech-follow.js — P6 语音跟随滚动（Web Speech API）
 *
 * 设计：把"可测纯逻辑"与"浏览器专属识别绑定"彻底分离。
 *   - mapSpeechRateToScrollSpeed / SpeechFollowController：纯函数 + 纯状态机，无浏览器依赖，
 *     可在 Node 下直接测试（见 test-speech.mjs）。
 *   - createSpeechRecognition：真正的 webkitSpeechRecognition 绑定，**仅 typeof window !== 'undefined'
 *     且 API 存在时才执行**，否则返回 null，绝不破坏 Node 端 import / 测试。
 *
 * 合规：本模块只做"按语速快慢调节滚动速度"的辅助交互，不涉及任何预测 / 算命 / 运势。
 */

export const MIN_SCROLL_PX = 5;    // px/sec 下限（防止停死）
export const MAX_SCROLL_PX = 400;  // px/sec 上限（防止飞滚）

/** 数值钳制：±Infinity 钳到对应边界，NaN/其他非有限值回退到 min，绝不返回 NaN/undefined */
export function clamp(n, min, max) {
  if (Number.isNaN(n)) return min;
  if (n === Infinity) return max;
  if (n === -Infinity) return min;
  if (typeof n !== 'number' || Number.isNaN(n)) return min;
  if (n > max) return max;
  if (n < min) return min;
  return n;
}

/**
 * 由"实测语速"映射到"滚动速度"。
 * @param {number} currentWpm 说话人当前语速（words per minute）
 * @param {number} baseWpm    脚本基准语速（参考值，如 150）
 * @param {number} currentScrollPx 当前滚动速度（px/sec）
 * @returns {number} 调整后的滚动速度，钳制在 [MIN, MAX]，非法输入返回 0
 */
export function mapSpeechRateToScrollSpeed(currentWpm, baseWpm, currentScrollPx) {
  if (!Number.isFinite(currentWpm) || !Number.isFinite(currentScrollPx)) return 0;
  if (!Number.isFinite(baseWpm) || baseWpm <= 0) return 0;
  const ratio = currentWpm / baseWpm;       // 0.5 = 说慢了一半 → 滚慢一半；2 = 说快一倍 → 滚快一倍
  const target = currentScrollPx * ratio;
  return clamp(target, MIN_SCROLL_PX, MAX_SCROLL_PX);
}

/** 纯状态机：把识别结果喂进来，自动按语速微调滚动速度并回调 */
export class SpeechFollowController {
  constructor({ baseWpm = 150, initialScrollPx = 60, minScrollPx = MIN_SCROLL_PX, maxScrollPx = MAX_SCROLL_PX, onSpeedChange } = {}) {
    this.baseWpm = baseWpm;
    this.scrollPx = initialScrollPx;
    this.minScrollPx = minScrollPx;
    this.maxScrollPx = maxScrollPx;
    this.onSpeedChange = typeof onSpeedChange === 'function' ? onSpeedChange : null;
  }

  /** 从一次识别结果估算语速：words / seconds * 60 */
  static wpmFromResult({ transcript = '', durationSec = 0 } = {}) {
    const words = (String(transcript).trim().match(/\S+/g) || []).length;
    if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
    return (words / durationSec) * 60;
  }

  /** 喂入识别结果，返回新的滚动速度（并触发 onSpeedChange 回调） */
  handleResult(result = {}) {
    const wpm = SpeechFollowController.wpmFromResult(result);
    if (wpm <= 0) return this.scrollPx; // 没识别出有效时长/字数，保持原速
    const next = mapSpeechRateToScrollSpeed(wpm, this.baseWpm, this.scrollPx);
    this.scrollPx = next;
    if (this.onSpeedChange) {
      this.onSpeedChange(next, { wpm, baseWpm: this.baseWpm });
    }
    return next;
  }
}

/**
 * 浏览器专属：绑定 Web Speech API 的连续识别。
 * 仅当处于浏览器且 API 可用时返回控制器；否则（Node / 不支持）返回 null，绝不抛错。
 * @param {{onResult?:Function, onError?:Function, onEnd?:Function, lang?:string}} [opts]
 * @returns {{start:Function, stop:Function, native:any}|null}
 */
export function createSpeechRecognition({ onResult, onError, onEnd, lang = 'zh-CN' } = {}) {
  // ← 关键守卫：脱离浏览器（含 Node 测试环境）直接返回 null
  if (typeof window === 'undefined') return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (typeof Ctor === 'undefined') return null;

  let recognition;
  try {
    recognition = new Ctor();
  } catch {
    return null;
  }
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;

  if (typeof onResult === 'function') {
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onResult({ transcript, event });
    };
  }
  if (typeof onError === 'function') recognition.onerror = onError;
  if (typeof onEnd === 'function') recognition.onend = onEnd;

  return {
    start() { try { recognition.start(); } catch { /* 已在运行等忽略 */ } },
    stop() { try { recognition.stop(); } catch { /* 已停止等忽略 */ } },
    native: recognition,
  };
}
