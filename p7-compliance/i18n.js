/**
 * i18n.js — P7 多语言框架（zh 默认 + en / ja / ko / ru）
 *
 * 供 Worker 端 / 其他项目复用；index.html 内联了一份等价副本以保持单文件自包含。
 * 文案口径（借鉴同类提词器产品的通行写法）：① 工具定位——只显示并滚动用户输入的文字；
 * ② 内容归属与本地存储——讲稿归用户所有，默认只存本机，我方不读取/不上传/不备份；
 * ③ 自行备份——清除数据或换设备可能丢失；④ 按「现状」提供，不对结果作保证。
 */

export const SUPPORTED_LANGS = ['zh', 'en', 'de', 'fr', 'ja', 'ko', 'ru'];
export const DEFAULT_LANG = 'zh';

export const LANG_NAMES = {
  zh: '中文',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
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
      '不替你创作、发布或评价内容。讲稿默认保存在本机浏览器中；除你主动开启「云同步」外，我们不会读取、上传或备份你的讲稿；' +
      '清除浏览器数据、卸载应用或更换设备后可能无法恢复，重要稿件请自行留存。' +
      '本应用按「现状」提供，滚动速度与字数估算仅作辅助参考，不对录制效果或使用后果作出保证。',
    paidNotice:
      '你即将用 Telegram Stars 购买 Pro 权益。Pro 为功能解锁，月付／年付到期后不自动续费。' +
      '购买后 14 天内可通过 /paysupport 申请全额退款，无需说明理由；同一账号反复申请的可不予受理。' +
      '本条不影响你依法享有的权利。支付由 Telegram 处理，我们不接触你的支付信息。',
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
      'your device browser by default; unless you turn on Cloud Sync yourself, we do not read, upload, or back them up, and they may be lost ' +
      'if you clear browser data, uninstall, or change devices, so please keep your own copies of ' +
      'anything important. The app is provided as is; scroll speed and character estimates are aids ' +
      'only, and no guarantee is made about recording results or any outcome of use.',
    paidNotice:
      'You are about to buy Pro with Telegram Stars. Pro unlocks features and does not auto-renew ' +
      'at the end of the period. Within 14 days of purchase you can request a full refund via ' +
      '/paysupport, no reason required; repeated requests from the same account may be declined. ' +
      'This does not affect your statutory rights. Payment is handled by Telegram; we never receive ' +
      'your payment details.',
    reportTitle: 'Report / Feedback',
    reportPlaceholder: 'Describe the issue you want to report or your feedback…',
    reportSubmit: 'Submit',
    reportThanks: 'Thanks! We received your feedback and will review it soon.',
    aboutTitle: 'About',
    langLabel: 'Language',
  },
  de: {
    appTitle: 'ScriptDeck',
    appSubtitle: 'Teleprompter · Flüssig vorlesen, Blick frei',
    disclaimerTitle: 'Haftungsausschluss',
    disclaimerBody:
      'ScriptDeck ist ein Hilfsmittel zum Vorlesen von Texten: Die App zeigt ausschließlich den von dir ' +
      'eingegebenen Text auf deinem Gerät an und lässt ihn scrollen – sie erstellt, veröffentlicht oder ' +
      'bewertet keine Inhalte. Deine Skripte werden standardmäßig im Browser deines Geräts gespeichert. ' +
      'Außer wenn du die Cloud-Synchronisierung selbst aktivierst, lesen, übertragen oder sichern wir ' +
      'deine Skripte nicht. Nach dem Löschen der Browserdaten, dem Deinstallieren der App oder einem ' +
      'Gerätewechsel kann eine Wiederherstellung unmöglich sein – bewahre wichtige Texte daher selbst auf. ' +
      'Die App wird „wie besehen“ bereitgestellt; Scrollgeschwindigkeit und Zeichenzählung dienen nur als ' +
      'Orientierung, für Aufnahmeergebnisse oder Folgen der Nutzung wird keine Gewähr übernommen.',
    paidNotice:
      'Du bist dabei, Pro-Rechte mit Telegram Stars zu kaufen. Pro ist eine Funktionsfreischaltung; ' +
      'Monats- und Jahresabo verlängern sich nach Ablauf nicht automatisch. Innerhalb von 14 Tagen nach ' +
      'dem Kauf kannst du über /paysupport eine vollständige Rückerstattung beantragen, ohne Begründung; ' +
      'bei wiederholten Anträgen desselben Kontos kann eine Erstattung abgelehnt werden. Dies berührt ' +
      'deine gesetzlichen Rechte nicht. Die Zahlung wird von Telegram abgewickelt; wir erhalten keine Zahlungsdaten.',
    reportTitle: 'Melden / Feedback',
    reportPlaceholder: 'Beschreibe bitte das Problem oder dein Feedback …',
    reportSubmit: 'Senden',
    reportThanks: 'Danke, dein Feedback ist eingegangen. Wir kümmern uns darum.',
    aboutTitle: 'Über',
    langLabel: 'Sprache',
  },
  fr: {
    appTitle: 'ScriptDeck',
    appSubtitle: 'Téléprompteur · Défilement fluide, les yeux libres',
    disclaimerTitle: 'Clause de non-responsabilité',
    disclaimerBody:
      'ScriptDeck est un outil d’aide à la lecture : il affiche et fait défiler uniquement le texte que ' +
      'vous saisissez, sur votre appareil, sans créer, publier ni évaluer de contenu. Vos scripts sont ' +
      'enregistrés par défaut dans le navigateur de votre appareil ; sauf si vous activez vous-même la ' +
      'synchronisation cloud, nous ne lisons, ne transférons ni ne sauvegardons vos scripts. Après effacement ' +
      'des données du navigateur, désinstallation de l’application ou changement d’appareil, une récupération ' +
      'peut être impossible : conservez vous-même vos textes importants. L’application est fournie « en l’état » ; ' +
      'la vitesse de défilement et l’estimation du nombre de caractères ne sont qu’indicatives et n’offrent ' +
      'aucune garantie sur le résultat d’un enregistrement ni sur les conséquences de l’usage.',
    paidNotice:
      'Vous allez acheter des droits Pro avec Telegram Stars. Pro est un déblocage de fonctionnalités ; ' +
      'les formules mensuelle et annuelle ne se renouvellent pas automatiquement à l’échéance. Dans les ' +
      '14 jours suivant l’achat, vous pouvez demander un remboursement intégral via /paysupport, sans ' +
      'justification ; les demandes répétées d’un même compte peuvent être refusées. Cette clause n’affecte ' +
      'pas vos droits légaux. Le paiement est traité par Telegram ; nous n’avons pas accès à vos informations de paiement.',
    reportTitle: 'Signaler / Retour',
    reportPlaceholder: 'Décrivez le problème à signaler ou votre retour …',
    reportSubmit: 'Envoyer',
    reportThanks: 'Merci, votre retour a bien été reçu. Nous nous en occupons.',
    aboutTitle: 'À propos',
    langLabel: 'Langue',
  },
  ja: {
    appTitle: 'テレプロンプター',
    appSubtitle: 'スムーズなスクロールで目を解放',
    disclaimerTitle: '免責事項',
    disclaimerBody:
      'ScriptDeck は原稿読み上げを補助するテレプロンプターです。入力したテキストをご自身の端末上で' +
      '表示・スクロールするだけで、内容の作成・公開・評価は行いません。原稿は初期設定で端末の' +
      'ブラウザ内に保存されます。ご自身で「クラウド同期」を有効にしない限り、当方が読み取り・送信・バックアップすることはありません。ブラウザデータの削除、' +
      'アプリの削除、機種変更などで復元できない場合があるため、重要な原稿はご自身で保管してください。' +
      '本アプリは現状のまま提供され、スクロール速度や文字数の推定は目安であり、' +
      '収録結果や利用の結果について保証しません。',
    paidNotice:
      'まもなく Telegram Stars で Pro を購入します。Pro は機能の解放で、期間終了後の自動更新はありません。' +
      '購入から 14 日以内であれば /paysupport から理由を問わず全額返金を申請できます' +
      '（同一アカウントでの繰り返しの申請はお受けできない場合があります）。' +
      '本条はお客様の法令上の権利に影響しません。決済は Telegram が処理し、' +
      '当方が支払い情報を取得することはありません。',
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
      '사용자가 직접 ‘클라우드 동기화’를 켜지 않는 한 당사는 이를 읽거나 전송하거나 백업하지 않습니다. 브라우저 데이터 삭제, 앱 삭제, 기기 변경 시 ' +
      '복구되지 않을 수 있으므로 중요한 대본은 직접 보관해 주세요. 본 앱은 있는 그대로 제공되며, ' +
      '스크롤 속도와 글자 수 추정치는 참고용으로, 녹화 결과나 사용 결과에 대해 보증하지 않습니다.',
    paidNotice:
      '곧 Telegram Stars로 Pro를 구매합니다. Pro는 기능 잠금 해제이며 기간 만료 후 자동 갱신되지 않습니다. ' +
      '구매 후 14일 이내에 /paysupport로 이유 없이 전액 환불을 요청할 수 있습니다' +
      '(동일 계정의 반복 요청은 거절될 수 있습니다). 본 조항은 사용자의 법적 권리에 영향을 주지 않습니다. ' +
      '결제는 Telegram이 처리하며 당사는 결제 정보를 받지 않습니다.',
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
      'хранятся в браузере устройства. Если вы сами не включите облачную синхронизацию, мы не читаем, не загружаем и не создаём их резервные копии. ' +
      'При очистке данных браузера, удалении приложения или смене устройства они могут быть утрачены, ' +
      'поэтому важные тексты сохраняйте отдельно. Приложение предоставляется «как есть»: скорость прокрутки ' +
      'и оценка числа символов носят справочный характер, а результат записи и последствия использования ' +
      'не гарантируются.',
    paidNotice:
      'Вы собираетесь приобрести Pro за Telegram Stars. Pro открывает функции и не продлевается ' +
      'автоматически по окончании срока. В течение 14 дней после покупки можно запросить полный ' +
      'возврат через /paysupport без объяснения причин; при повторных запросах с одного аккаунта ' +
      'может быть отказано. Это не ограничивает ваши права по закону. Платёж обрабатывает Telegram, ' +
      'мы не получаем ваши платёжные данные.',
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
