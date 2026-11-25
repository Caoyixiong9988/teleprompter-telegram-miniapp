# ScriptDeck · BotFather 多语言产品介绍

## 1. 官方规则（已核实 2026-11-25）

来源：`core.telegram.org/bots/features`（"About text, description and profile media" / "Edit bots"）

| 字段 | BotFather 命令 | 上限 | 用户在哪里看到 |
|---|---|---|---|
| Description（介绍） | `/setdescription` | **512 字符** | 空聊天页的 "What can this bot do?" 框；用户点 Start 后不再显示 |
| About（简介） | `/setabouttext` | **120 字符** | Bot 资料页；**别人分享这个 Bot 时会随链接一起发出** |
| Name（名称） | `/setname` | 64 字符 | 聊天列表和聊天顶部（本次不改） |

官方原文："Note that both the Description and the About text can be natively localized – each user will automatically see the correct translation for their language."

> 因为 About 会跟着分享链接走，它是拉新链路里被低估的位置：你分享 `t.me/Dfb9988bot?startapp=...` 时，对方看到的第一句话就是它。

## 2. 七语文案（可直接复制到 BotFather）

下面 JSON 是文案唯一来源；`about` ≤120 字符、`description` ≤512 字符（按 Unicode 字符计，脚本已逐条校验）。

```json
{
  "en": {
    "about": "ScriptDeck is a teleprompter for Telegram. Paste a script, press play, and follow every word with highlighting.",
    "description": "ScriptDeck turns Telegram into a teleprompter. Paste or import a script, keep up to three scripts free, and read along with a word-by-word highlight that moves with the text. Adjust speed, font size, alignment and mirror mode; share a finish card when you're done. No sign-up or setup: tap the Menu Button or Launch app to start."
  },
  "zh": {
    "about": "ScriptDeck 是 Telegram 里的提词器。粘贴讲稿点播放，逐词高亮跟着你读，演讲更自然。",
    "description": "ScriptDeck 把 Telegram 变成提词器。粘贴或导入讲稿，免费保存最多 3 篇；播放时逐词黄块跟随，滚动与高亮同步，不再找不到读到哪里。可调速度、字号、对齐和镜像模式，读完生成完成卡分享给朋友。无需注册或配置，点 Bot 菜单按钮或 Launch app 即可开始。"
  },
  "de": {
    "about": "ScriptDeck ist ein Teleprompter für Telegram. Text einfügen, abspielen und Wort für Wort mitlesen.",
    "description": "ScriptDeck macht Telegram zu einem Teleprompter. Füge dein Skript ein oder importiere es, speichere bis zu drei Skripte kostenlos und lies mit einer Wort-für-Wort-Markierung, die mit dem Text mitwandert. Geschwindigkeit, Schriftgröße, Ausrichtung und Spiegelmodus sind einstellbar; nach dem Lesen erstellst du eine Abschlusskarte zum Teilen. Keine Anmeldung nötig – tippe auf den Menüknopf oder Launch app."
  },
  "fr": {
    "about": "ScriptDeck est un téléprompteur dans Telegram. Collez un texte, lancez la lecture et suivez chaque mot.",
    "description": "ScriptDeck transforme Telegram en téléprompteur. Collez ou importez votre texte, conservez jusqu'à trois scripts gratuitement et lisez avec un surlignage mot à mot qui suit le défilement. Réglez la vitesse, la taille de police, l'alignement et le mode miroir, puis partagez une carte de fin de lecture. Aucun compte requis : appuyez sur le bouton de menu ou sur Launch app."
  },
  "ja": {
    "about": "ScriptDeck は Telegram 内のテレプロンプター。原稿を貼り付けて再生すると、語ごとにハイライトが追従します。",
    "description": "ScriptDeck は Telegram をテレプロンプターにします。原稿を貼り付けまたはインポートし、無料で最大 3 篇まで保存可能。再生中は語ごとのハイライトがスクロールに合わせて動き、読み位置を見失いません。速度・文字サイズ・配置・ミラー表示を調整でき、読み終えると完了カードを共有できます。登録不要。メニューボタンまたは Launch app をタップして始めましょう。"
  },
  "ko": {
    "about": "ScriptDeck는 Telegram 안의 텔레프롬프터입니다. 원고를 붙여넣고 재생하면 단어별 하이라이트가 따라갑니다.",
    "description": "ScriptDeck는 Telegram을 텔레프롬프터로 바꿔 줍니다. 원고를 붙여넣거나 가져오고, 무료로 최대 3편까지 저장하세요. 재생 중 단어별 하이라이트가 스크롤과 함께 움직여 읽는 위치를 놓치지 않습니다. 속도, 글자 크기, 정렬, 미러 모드를 조절할 수 있고, 읽기를 마치면 완료 카드를 공유할 수 있습니다. 가입 없이 메뉴 버튼이나 Launch app을 눌러 시작하세요."
  },
  "ru": {
    "about": "ScriptDeck — суфлёр внутри Telegram. Вставьте текст, нажмите воспроизведение и читайте с подсветкой слов.",
    "description": "ScriptDeck превращает Telegram в суфлёр. Вставьте или импортируйте текст, бесплатно сохраняйте до трёх сценариев и читайте с пословной подсветкой, которая движется вместе с прокруткой. Настраивайте скорость, размер шрифта, выравнивание и зеркальный режим; по завершении поделитесь карточкой результата. Регистрация не нужна: нажмите кнопку меню или Launch app."
  }
}
```

## 3. 字数校验结果

上限：About ≤120，Description ≤512。校验命令（在 `media-preview/` 下）：

```bash
node -e 'const fs=require("fs");const h=fs.readFileSync("BotFather多语言产品介绍.md","utf8");const j=JSON.parse(h.match(/```json\n([\s\S]*?)\n```/)[1]);for(const [k,v] of Object.entries(j)){const a=[...v.about].length,d=[...v.description].length;console.log(k,a,a<=120?"OK":"OVER",d,d<=512?"OK":"OVER")}'
```

执行结果（2026-11-25）：全部 **OK**，无超限语种。

## 4. 上传方式

### A. 手动（推荐，Telegram 客户端内）

1. BotFather → `/setabouttext` → 选 `@Dfb9988bot` → 选择语言（Default 先填 `en`，再逐个选 `zh` / `ja` / `ko` / `fr` / `de` / `ru`）→ 粘贴对应 `about`。
2. BotFather → `/setdescription` → 同样按语言逐个粘贴对应 `description`。
3. 也可走 `/mybots` → 选 Bot → Edit Bot → Edit About / Edit Description，界面里选语言后粘贴。
4. 官方说明改动可能需要几分钟生效；切语言看不到时重开资料页或清缓存。

### B. Bot API（可选，批量）

Bot API 的 `setMyDescription` / `setMyShortDescription` 支持 `language_code` 参数，可一次写完所有语言。但**本机直连 api.telegram.org 此前被网络阻断**，你在自己 Telegram 客户端里手动上传更稳。命令模板（仅本机执行，token 不要贴进聊天或代码）：

```bash
TOKEN=$(tr -d '\r\n' < C:/Users/maste/.workbuddy/bot-token.txt)
curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/setMyShortDescription" \
  -d "language_code=en" --data-urlencode "short_description=英文 about 文本"
curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/setMyDescription" \
  -d "language_code=en" --data-urlencode "description=英文 description 文本"
```

## 5. 文案口径与设计说明

- 纯工具定位：只描述提词、编辑、高亮、分享，**不含任何预测、运势、结果承诺**，与产品宪法红线一致。
- 三段信息结构：是什么（提词器）→ 能做什么（导入/高亮/设置/完成卡）→ 怎么开始（菜单按钮 / Launch app）。
- 免费讲稿上限写"最多 3 篇"，与代码中的 `FREE_SCRIPT_LIMIT` 一致，不夸大。
- 七语文案是本地化改写，不是逐字直译；`Launch app` 保留英文，因为那是 Telegram 资料页上的实际按钮名。

## 6. 验收

- [ ] 英文界面打开 Bot 资料页：About 显示英文，空聊天页 Description 显示英文
- [ ] 中文 / 日语界面分别显示对应语言
- [ ] 把 Bot 分享给朋友：分享卡片上带的是对应语言的 About
- [ ] 点 Start 进入聊天后，Description 框消失属正常
