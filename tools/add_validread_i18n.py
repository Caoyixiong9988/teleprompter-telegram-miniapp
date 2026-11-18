# -*- coding: utf-8 -*-
"""为"有效读完 / 完成卡门槛"提示新增 5 个 i18n 键，插入到各语言 rankHint 行之后。
用精确整行锚点（每语言 rankHint 文案唯一），避免按语言顺序 re.search 造成错块。"""
import io, sys

PATH = 'index.html'
with io.open(PATH, 'r', encoding='utf-8') as f:
    s = f.read()

# 每语言：锚点(rankHint 整行，唯一) -> 追加的 5 行
INSERTS = {
'zh': ("  rankHint:'免费头衔，仅作纪念，不影响任何功能；完整读完一篇讲稿计 1 次。',", [
  "  validReadRule:'计入规则：讲稿去空格后满 {n} 字、并完整播放到结尾，才计 1 次并弹出完成卡；太短的稿子仅作练习不计入。',",
  "  readCharsHint:'本篇 {n} 字 · 可计次',",
  "  readCharsLow:'本篇 {n} 字 · 再补 {m} 字可计次',",
  "  readTooShort:'这篇只有 {n} 字，满 {m} 字读完才会计 1 次并弹完成卡。',",
  "  readRuleTitle:'怎样才算读完一次？',",
]),
'en': ("  rankHint:'A free badge for fun only — it unlocks nothing. One full read counts as one.',", [
  "  validReadRule:'What counts: a script must have at least {n} characters (spaces excluded) and be played to the very end to count once and show the finish card. Very short drafts are practice only.',",
  "  readCharsHint:'{n} chars · counts',",
  "  readCharsLow:'{n} chars · {m} more to count',",
  "  readTooShort:'Only {n} chars here. Reach {m} and read to the end to count once and get a card.',",
  "  readRuleTitle:'What counts as one read?',",
]),
'de': ("  rankHint:'Kostenloser Titel, nur zur Erinnerung, ohne Einfluss auf Funktionen; ein vollständig gelesenes Skript zählt als 1.',", [
  "  validReadRule:'Zählregel: Ein Skript muss mindestens {n} Zeichen (ohne Leerzeichen) haben und bis zum Ende abgespielt werden, um als 1 zu zählen und die Karte zu zeigen. Sehr kurze Entwürfe zählen nicht.',",
  "  readCharsHint:'{n} Zeichen · zählt',",
  "  readCharsLow:'{n} Zeichen · noch {m} bis zum Zählen',",
  "  readTooShort:'Nur {n} Zeichen. Erst ab {m} und vollständig gelesen zählt es und zeigt die Karte.',",
  "  readRuleTitle:'Was zählt als eine Lesung?',",
]),
'fr': ("  rankHint:'Titre gratuit, purement symbolique, sans effet sur les fonctionnalités ; un script lu en entier compte pour 1.',", [
  "  validReadRule:'Règle : un script doit comporter au moins {n} caractères (espaces exclus) et être lu jusqu’au bout pour compter pour 1 et afficher la carte. Les textes très courts ne comptent pas.',",
  "  readCharsHint:'{n} caractères · compté',",
  "  readCharsLow:'{n} caractères · encore {m} pour compter',",
  "  readTooShort:'Seulement {n} caractères. Atteignez {m} et lisez jusqu’au bout pour compter et obtenir la carte.',",
  "  readRuleTitle:'Qu’est-ce qui compte comme une lecture ?',",
]),
'ja': ("  rankHint:'無料の称号で、機能の解放はありません。原稿を最後まで読むと 1 回と数えます。',", [
  "  validReadRule:'計上ルール：原稿は空白を除いて {n} 文字以上あり、最後まで再生し終えると 1 回として数えられ完了カードが出ます。短すぎる原稿は練習扱いで計上されません。',",
  "  readCharsHint:'{n} 文字 · 計上可',",
  "  readCharsLow:'{n} 文字 · あと {m} 文字で計上',",
  "  readTooShort:'この原稿は {n} 文字です。{m} 文字以上にして最後まで読むと 1 回として数えられ、カードが出ます。',",
  "  readRuleTitle:'何をもって1回と数える？',",
]),
'ko': ("  rankHint:'무료 칭호로 기능 해제와는 무관합니다. 대본을 끝까지 읽으면 1회로 계산합니다.',", [
  "  validReadRule:'집계 규칙: 대본은 공백을 제외하고 {n}자 이상이어야 하고 끝까지 재생해야 1회로 계산되어 완료 카드가 표시됩니다. 너무 짧은 대본은 연습용으로 계산되지 않습니다.',",
  "  readCharsHint:'{n}자 · 집계됨',",
  "  readCharsLow:'{n}자 · {m}자 더 필요',",
  "  readTooShort:'이 대본은 {n}자뿐입니다. {m}자 이상으로 끝까지 읽어야 1회로 계산되고 카드가 나옵니다.',",
  "  readRuleTitle:'무엇이 1회로 집계되나요?',",
]),
'ru': ("  rankHint:'Бесплатное звание, оно ничего не открывает. Одно полное прочтение считается за один раз.',", [
  "  validReadRule:'Правило: скрипт должен содержать не менее {n} символов (без пробелов) и быть воспроизведён до конца — тогда он считается один раз и показывается карточка. Слишком короткие тексты не учитываются.',",
  "  readCharsHint:'{n} симв. · учитывается',",
  "  readCharsLow:'{n} симв. · ещё {m} до учёта',",
  "  readTooShort:'Всего {n} симв. Нужно {m} и прочтение до конца, чтобы засчитать и показать карточку.',",
  "  readRuleTitle:'Что считается одним прочтением?',",
]),
}

seen = set()
for lang, (anchor, lines) in INSERTS.items():
    cnt = s.count(anchor)
    if cnt != 1:
        print('ERROR anchor for %s occurs %d times' % (lang, cnt)); sys.exit(1)
    block = anchor + '\n' + '\n'.join(lines)
    s = s.replace(anchor, block, 1)
    seen.add(lang)

with io.open(PATH, 'w', encoding='utf-8', newline='') as f:
    f.write(s)
print('OK inserted 5 keys x 7 langs into', PATH)
