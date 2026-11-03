/**
 * i18n.js — P7 多语言框架（zh 默认 + en / ja / ko / ru）
 *
 * 供 Worker 端 / 其他项目复用；index.html 内联了一份等价副本以保持单文件自包含。
 * 合规：所有文案仅描述"工具 / 娱乐辅助"功能，绝不出现占卜 / 预测 / 算命表述。
 */

export const SUPPORTED_LANGS = ['zh', 'en', 'ja', 'ko', 'ru'];
export const DEFAULT_LANG = 'zh';

export const LANG_NAMES = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
};

// 核心 UI 文案（五语）。新增语言只需在此追加一组即可。
export const UI_STRINGS = {
  zh: {
    appTitle: '提词器',
    appSubtitle: '流畅提词，解放双眼',
    disclaimerTitle: '免责声明',
    disclaimerBody:
      '本应用为纯工具类提词辅助软件，不含任何占卜、预测、算命或运势类功能。' +
      '所有功能仅用于帮助您更流畅地朗读讲稿。应用内"积分"为平台发放的内部虚拟点数，' +
      '不等于 Telegram Stars、不等于任何法定货币或加密货币，不可提现、不可转账、不可交易。',
    paidNotice:
      '你即将使用 Telegram Stars 购买内部积分。积分仅限本应用内消耗，非真钱、不可退款、不可提现。',
    submitNotice:
      '你即将提交内容。请确认内容真实、原创、不侵权；违规内容将被下架并收回奖励。',
    reportTitle: '举报 / 反馈',
    reportPlaceholder: '请描述您要举报的问题或反馈……',
    reportSubmit: '提交',
    reportThanks: '已收到您的反馈，我们会尽快处理。',
    aboutTitle: '关于',
    langLabel: '语言',
  },
  en: {
    appTitle: 'Teleprompter',
    appSubtitle: 'Smooth scrolling, free your eyes',
    disclaimerTitle: 'Disclaimer',
    disclaimerBody:
      'This app is a pure utility teleprompter tool. It contains no fortune-telling, prediction, ' +
      'astrology, or horoscope features. All features only help you read scripts more smoothly. ' +
      'In-app "credits" are internal virtual points issued by the platform — they are NOT Telegram ' +
      'Stars, NOT any fiat currency or cryptocurrency, and cannot be withdrawn, transferred, or traded.',
    paidNotice:
      'You are about to purchase internal credits with Telegram Stars. Credits are for in-app use ' +
      'only — not real money, non-refundable, non-withdrawable.',
    submitNotice:
      'You are about to submit content. Ensure it is authentic, original, and non-infringing; ' +
      'violating content will be removed and rewards revoked.',
    reportTitle: 'Report / Feedback',
    reportPlaceholder: 'Describe the issue you want to report or your feedback…',
    reportSubmit: 'Submit',
    reportThanks: 'Thanks! We received your feedback and will review it soon.',
    aboutTitle: 'About',
    langLabel: 'Language',
  },
  ja: {
    appTitle: 'テレプロンプター',
    appSubtitle: 'スムーズなスクロールで目を解放',
    disclaimerTitle: '免責事項',
    disclaimerBody:
      '本アプリは純粋なユーティリティ型の原稿読み上げ支援ツールであり、占い・予測・星占い・' +
      '運勢などの機能は一切含みません。すべての機能は原稿をよりスムーズに読むためのものです。' +
      'アプリ内の「クレジット」はプラットフォームが発行する内部的な仮想ポイントであり、' +
      'Telegram Stars でも法定通貨・暗号資産でもなく、出金・送金・取引はできません。',
    paidNotice:
      'まもなく Telegram Stars で内部クレジットを購入します。クレジットはアプリ内でのみ利用可能で、' +
      '現金ではなく、返金・出金はできません。',
    submitNotice:
      'まもなくコンテンツを投稿します。真正性・独創性・権利侵害がないことを確認してください。' +
      '違反コンテンツは削除され、報酬は没収されます。',
    reportTitle: '報告 / フィードバック',
    reportPlaceholder: '報告したい問題やフィードバックを記述してください……',
    reportSubmit: '送信',
    reportThanks: 'ありがとうございます。ご意見を確認いたします。',
    aboutTitle: '概要',
    langLabel: '言語',
  },
  ko: {
    appTitle: '텔레프로마터',
    appSubtitle: '부드러운 스크롤로 눈을 자유롭게',
    disclaimerTitle: '면책 조항',
    disclaimerBody:
      '이 앱은 순수 유틸리티형 대본 낭독 보조 도구로, 점술·예측·운세 등의 기능은 일절 포함하지 않습니다. ' +
      '모든 기능은 대본을 더 부드럽게 읽기 위한 것입니다. 앱 내 "크레딧"은 플랫폼이 발행하는 내부 가상 포인트로, ' +
      'Telegram Stars도 아니며 법정 화폐·암호화폐도 아니며 출금·송금·거래할 수 없습니다.',
    paidNotice:
      '곧 Telegram Stars로 내부 크레딧을 구매합니다. 크레딧은 앱 내에서만 사용 가능하며 현금이 아니고 ' +
      '환불·출금할 수 없습니다.',
    submitNotice:
      '곧 콘텐츠를 제출합니다. 진정성·독창성·권리 침해가 없음을 확인하세요. 위반 콘텐츠는 삭제되고 보상이 회수됩니다.',
    reportTitle: '신고 / 피드백',
    reportPlaceholder: '신고할 문제나 피드백을 설명해 주세요……',
    reportSubmit: '제출',
    reportThanks: '감사합니다. 피드백을 확인하겠습니다.',
    aboutTitle: '정보',
    langLabel: '언어',
  },
  ru: {
    appTitle: 'Телесуфлёр',
    appSubtitle: 'Плавная прокрутка без заучивания',
    disclaimerTitle: 'Отказ от ответственности',
    disclaimerBody:
      'Это приложение — исключительно утилита для подсказки текста. В нём нет никаких функций гадания, ' +
      'предсказаний, астрологии или гороскопов. Все функции служат только тому, чтобы вы читали сценарий ' +
      'более плавно. «Кредиты» в приложении — это внутренние виртуальные баллы, выпущенные платформой: ' +
      'они НЕ являются Telegram Stars, НЕ являются фиатной валютой или криптовалютой и не могут быть ' +
      'выведены, переданы или обменены.',
    paidNotice:
      'Вы собираетесь приобрести внутренние кредиты за Telegram Stars. Кредиты используются только внутри ' +
      'приложения: это не реальные деньги, возврат и вывод невозможны.',
    submitNotice:
      'Вы собираетесь отправить материал. Убедитесь, что он достоверен, оригинален и не нарушает авторских ' +
      'прав; нарушающий правила контент будет удалён, а вознаграждение аннулировано.',
    reportTitle: 'Жалоба / Обратная связь',
    reportPlaceholder: 'Опишите проблему или ваши замечания……',
    reportSubmit: 'Отправить',
    reportThanks: 'Спасибо! Мы получили ваше сообщение и скоро его рассмотрим.',
    aboutTitle: 'О приложении',
    langLabel: 'Язык',
  },
};

export function getLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

export function t(key, lang) {
  const l = getLang(lang);
  return (UI_STRINGS[l] && UI_STRINGS[l][key]) || UI_STRINGS[DEFAULT_LANG][key] || key;
}
