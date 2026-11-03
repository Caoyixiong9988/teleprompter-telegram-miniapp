/**
 * i18n.js — P7 多语言框架（zh 默认 + en / ja / ko / ru）
 *
 * 供 Worker 端 / 其他项目复用；index.html 内联了一份等价副本以保持单文件自包含。
 * 文案口径（借鉴同类提词器产品的通行写法）：① 工具定位——只显示并滚动用户输入的文字；
 * ② 内容归属与本地存储——讲稿归用户所有，默认只存本机，我方不读取/不上传/不备份；
 * ③ 自行备份——清除数据或换设备可能丢失；④ 按「现状」提供，不对结果作保证。
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
      'ScriptDeck 是一款提词阅读辅助工具：只在你的设备上显示并滚动你输入的文字，' +
      '不替你创作、发布或评价内容。讲稿默认保存在本机浏览器中，我们不会读取、上传或备份；' +
      '清除浏览器数据、卸载应用或更换设备后可能无法恢复，重要稿件请自行留存。' +
      '本应用按「现状」提供，滚动速度与字数估算仅作辅助参考，不对录制效果或使用后果作出保证。',
    paidNotice:
      '你即将用 Telegram Stars 购买 Pro 权益。Pro 为功能解锁（月付／年付到期后不自动续费），' +
      '属虚拟商品，解锁后不支持退款；支付由 Telegram 处理，我们不接触你的支付信息。',
    submitNotice:
      '你即将提交内容。请确认内容真实、原创、不侵犯他人权利，并遵守你所在地区的法律法规；' +
      '违反平台规则的内容将被下架，相关奖励不予发放。',
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
      'ScriptDeck is a teleprompter reading aid: it only displays and scrolls the text you type, ' +
      'on your own device. It does not write, publish, or judge your content. Scripts are stored in ' +
      'your device browser by default — we do not read, upload, or back them up, and they may be lost ' +
      'if you clear browser data, uninstall, or change devices, so please keep your own copies of ' +
      'anything important. The app is provided as is; scroll speed and character estimates are aids ' +
      'only, and no guarantee is made about recording results or any outcome of use.',
    paidNotice:
      'You are about to buy Pro with Telegram Stars. Pro unlocks features (monthly or yearly, ' +
      'no auto-renewal) and is a virtual item, so no refund is available once unlocked. ' +
      'Payment is handled by Telegram; we never receive your payment details.',
    submitNotice:
      'You are about to submit content. Please make sure it is accurate, original, does not infringe ' +
      'the rights of others, and complies with the laws where you live; content that breaks the ' +
      'platform rules will be removed and no reward will be paid.',
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
      'ScriptDeck は原稿読み上げを補助するテレプロンプターです。入力したテキストをご自身の端末上で' +
      '表示・スクロールするだけで、内容の作成・公開・評価は行いません。原稿は初期設定で端末の' +
      'ブラウザ内に保存され、当方は読み取り・送信・バックアップを行いません。ブラウザデータの削除、' +
      'アプリの削除、機種変更などで復元できない場合があるため、重要な原稿はご自身で保管してください。' +
      '本アプリは現状のまま提供され、スクロール速度や文字数の推定は目安であり、' +
      '収録結果や利用の結果について保証しません。',
    paidNotice:
      'まもなく Telegram Stars で Pro を購入します。Pro は機能の解放（月払い／年払い、自動更新なし）で、' +
      '仮想商品のため解放後の返金はできません。決済は Telegram が処理し、' +
      '当方が支払い情報を取得することはありません。',
    submitNotice:
      'まもなくコンテンツを送信します。内容が正確でオリジナルであり、第三者の権利を侵害せず、' +
      'お住まいの地域の法令に従っていることを確認してください。規約に違反する内容は削除され、' +
      '報酬は支払われません。',
    reportTitle: '報告 / フィードバック',
    reportPlaceholder: '報告したい問題やフィードバックを記述してください……',
    reportSubmit: '送信',
    reportThanks: 'ありがとうございます。ご意見を確認いたします。',
    aboutTitle: '概要',
    langLabel: '言語',
  },
  ko: {
    appTitle: '텔레프롬프터',
    appSubtitle: '부드러운 스크롤로 눈을 자유롭게',
    disclaimerTitle: '면책 조항',
    disclaimerBody:
      'ScriptDeck은 대본 낭독을 돕는 텔레프롬프터입니다. 입력한 텍스트를 사용자의 기기에서 표시하고 ' +
      '스크롤할 뿐, 내용을 작성·게시·평가하지 않습니다. 대본은 기본적으로 기기 브라우저에 저장되며, ' +
      '당사는 이를 읽거나 전송하거나 백업하지 않습니다. 브라우저 데이터 삭제, 앱 삭제, 기기 변경 시 ' +
      '복구되지 않을 수 있으므로 중요한 대본은 직접 보관해 주세요. 본 앱은 있는 그대로 제공되며, ' +
      '스크롤 속도와 글자 수 추정치는 참고용으로, 녹화 결과나 사용 결과에 대해 보증하지 않습니다.',
    paidNotice:
      '곧 Telegram Stars로 Pro를 구매합니다. Pro는 기능 잠금 해제(월간/연간, 자동 갱신 없음)이며 ' +
      '가상 상품으로, 해제 후에는 환불되지 않습니다. 결제는 Telegram이 처리하며 당사는 결제 정보를 받지 않습니다.',
    submitNotice:
      '곧 콘텐츠를 제출합니다. 내용이 정확하고 독창적이며 제3자의 권리를 침해하지 않고 거주 지역 법률을 ' +
      '준수하는지 확인하세요. 규정을 위반한 콘텐츠는 삭제되고 보상은 지급되지 않습니다.',
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
      'ScriptDeck — это телесуфлёр: он только показывает и прокручивает набранный вами текст на вашем ' +
      'устройстве. Приложение не создаёт, не публикует и не оценивает ваш контент. Сценарии по умолчанию ' +
      'хранятся в браузере устройства: мы не читаем, не загружаем и не создаём их резервные копии. ' +
      'При очистке данных браузера, удалении приложения или смене устройства они могут быть утрачены, ' +
      'поэтому важные тексты сохраняйте отдельно. Приложение предоставляется «как есть»: скорость прокрутки ' +
      'и оценка числа символов носят справочный характер, а результат записи и последствия использования ' +
      'не гарантируются.',
    paidNotice:
      'Вы собираетесь приобрести Pro за Telegram Stars. Pro — это разблокировка функций (месяц или год, ' +
      'без автопродления); это виртуальный товар, возврат после разблокировки не предусмотрен. ' +
      'Платежи обрабатывает Telegram, мы не получаем ваши платёжные данные.',
    submitNotice:
      'Вы собираетесь отправить материал. Убедитесь, что он достоверен, оригинален, не нарушает права ' +
      'третьих лиц и соответствует законодательству вашей страны. Контент, нарушающий правила платформы, ' +
      'будет удалён, а вознаграждение не выплачивается.',
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
