# JavaScript 速通清单 · 对照「提词器 Telegram 小程序」项目学

> 目的：用你**自己仓库里的真实代码**当教材，学一个 JS 概念就翻到对应文件看一眼，再跑到浏览器控制台 / Node 里试一下。
> 教材（任选其一主线）：
> - 《JavaScript 高级程序设计》（红宝书，最新版）—— 系统打底。
> - 现代 JavaScript 教程（在线免费，zh.javascript.info）—— 边学边练、更新快。
> 本清单里「红宝书」章节号为第 4 版大致位置，不同版本页码略有差异，按目录找同名章即可。

---

## 0. 先把「运行环境」跑起来（学之前必做）

| 你要会的 | 怎么练 | 项目里的真实例子 |
|---|---|---|
| 浏览器控制台敲 JS | 打开任意网页按 `F12` → Console，输入 `console.log("hi")` 回车 | 后面所有片段都能粘这里试 |
| 用 Node 跑 JS 文件 | 命令行 `node --check 文件.js`（只查语法）、`node --test 文件夹/` | `node --test p2-credits/` 会跑你项目的真实测试 |
| 看别人怎么测代码 | 读 `p2-credits/test-credits.mjs` | 见阶段 8 |

> 💡 你项目里 **P2/P3/P4/P5/P6 的全部逻辑都有 `test-*.mjs` 测试且通过**。学会 `node --test` 后，改一点代码就跑一遍测试，是 JS 入门最稳的反馈循环。

---

## 1. 基础语法（变量 / 类型 / 运算符）

| JS 概念 | 红宝书 | 现代教程 | 项目实弹（文件:行） | 小练习 |
|---|---|---|---|---|
| `let` / `const` 声明变量 | 第 3 章 | 变量 | `growth-core.js:32` `export const REFERRAL_BONUS = 50;` | 在控制台 `const a=1; let b=2; a=3` 看 const 报错 |
| 严格相等 `===` | 第 3 章 | 比较 | `worker.js:24` `if (a.length !== b.length) return false;` | 试 `0 == ''` 与 `0 === ''` 的区别 |
| 字符串方法 + 正则 | 第 5 章 | 字符串 / 正则 | `growth-core.js:39` `String(seed).replace(/[^a-zA-Z0-9]/g,'').slice(-4).toUpperCase()` | 把你的名字用正则只保留字母并转大写 |
| 数字 / `parseInt` / `Math` | 第 3 章 | 数字 | `growth-core.js:93` `Math.max(1, Math.min(parseInt(limit,10)||20, 100))` | 试 `parseInt("12px")`、`Math.min(3, Math.max(1, 99))` |
| 条件 `if` / 三元 / 短路 | 第 3 章 | 条件 | `bounty-client.js:32` `window.Telegram && window.Telegram.WebApp && ...`（短路取默认值） | 写 `const x = a || '默认'` 体会"假值兜底" |
| 循环 `for` | 第 3 章 | 循环 | `growth-core.js:80` `for (let i=0;i<8;i++){...}`（重试生成邀请码） | 把 1~100 累加，对照 `for` 与 `Array` 写法 |

---

## 2. 函数（声明 / 箭头 / 默认参数 / 解构参数）

| JS 概念 | 红宝书 | 现代教程 | 项目实弹 | 小练习 |
|---|---|---|---|---|
| 函数声明 | 第 10 章 | 函数 | `ledger-core.js:26` `function assertPositiveAmount(amount){...}` | 自己写一个 `function add(a,b){return a+b}` |
| 箭头函数 `=>` | 第 10 章 | 箭头函数 | `test-credits.mjs:45` `const run = (sql, p) => {...}` | 把上面的 `add` 改成箭头函数 |
| 参数解构 + 默认值 | 第 10 章 | 解构赋值 | `ledger-core.js:36` `grant(store, { userId, amount, reason = 'grant' })` | 解构 `{a, b=2}` 调两次看默认生效 |
| 匿名函数表达式 | 第 10 章 | 函数 | `index.html:482` `btnSettings.addEventListener('click', function(){ settingsSheet.classList.remove('hidden'); });` | 看匿名函数 vs 具名函数区别 |

> 🔑 你项目大量用**对象参数 + 解构**（`{ userId, amount }`）而不是一堆位置参数——这是现代 JS 写好函数的关键习惯，重点练。

---

## 3. 对象 / 数组 / 模板字符串

| JS 概念 | 红宝书 | 现代教程 | 项目实弹 | 小练习 |
|---|---|---|---|---|
| 对象字面量 | 第 6 章 | 对象 | `bounty-client.js:68` `return { createBounty(){...}, listBounties(){...} }`（返回一组方法） | 写一个 `{name:'x', say(){return this.name}}` |
| 数组 `map`/`filter`/`sort`/`slice` | 第 6 章 | 数组 | `test-credits.mjs:79-81` `ledger.filter(r=>r.user_id===userId).sort((a,b)=>b.id-a.id).slice(0,limit)` | 用 `map` 把 `[1,2,3]` 变成 `[2,4,6]` |
| 模板字符串 `` `...${}` `` | 第 3 章 | 字符串 | `growth-core.js:127` `` `https://t.me/${handle}?start=${encodeURIComponent(code)}` `` | 拼一句 `我叫${name}，今年${age}岁` |
| `Array.from` / 批量建数组 | 第 6 章 | 迭代 | `test-credits.mjs:126` `Array.from({length:100}, () => grant(...))` | 生成 0~9 的数组并求和 |

---

## 4. 模块系统 `import` / `export`（你项目的骨架）

| JS 概念 | 红宝书 | 现代教程 | 项目实弹 | 小练习 |
|---|---|---|---|---|
| 导出函数 `export` | 第 13 章 | 模块 | `ledger-core.js:36` `export async function grant(...)` | — |
| 具名导入 `import { }` | 第 13 章 | 模块 | `bounty-core.js:29` `import { grant, consume } from '../p2-credits/ledger-core.js';` | 注意这是**相对路径 + 带 .js 后缀**（浏览器/ESM 要求） |
| 默认导入 `import x from` | 第 13 章 | 模块 | `test-credits.mjs:16` `import worker from './credits-worker.js';` | — |

> 💡 你项目的依赖关系是：`bounty-core` / `growth-core` 都 `import` 了 `ledger-core` 的 `grant/consume`——这就是**代码复用**：P2 的积分账本被 P4、P5 共用。理解这条线，你就理解了"为什么要把逻辑拆成模块"。

---

## 5. 异步编程：Promise / async / await / fetch（重点，项目核心）

| JS 概念 | 红宝书 | 现代教程 | 项目实弹 | 小练习 |
|---|---|---|---|---|
| `async` / `await` | 第 15 章 | Async/await | `ledger-core.js:36` `export async function grant(store, ...){ await store.ensureUser(userId); ... }` | 写 `async function f(){ return 1 }`，`await f()` 看结果 |
| `fetch` 发网络请求 | 第 15 章 | Fetch | `bounty-client.js:38` `const res = await fetch(baseUrl+path, {method:'POST', headers:..., body: JSON.stringify(body)});` | 控制台 `await fetch('https://api.github.com').then(r=>r.json())` |
| 读响应 `res.json()` | 第 15 章 | Fetch | `bounty-client.js:44` `data = await res.json();` | 对照 `res.ok`、`res.status` |
| 返回 Promise 的链 | 第 14 章 | Promise | `bounty-client.js:56` `publicGet(...)` 返回 `data`（内部 await 后） | 试 `Promise.all([...])`（见下） |

> 🔑 你项目几乎所有后端逻辑都是 `async function`，因为要等数据库（D1）。**不懂 async/await 就看不懂你自己的代码**——这一章务必重点。

---

## 6. 错误处理：try/catch / throw / 自定义错误码（项目合规关键）

| JS 概念 | 红宝书 | 现代教程 | 项目实弹 | 小练习 |
|---|---|---|---|---|
| `throw` 抛错 | 第 12 章 | 错误处理 | `ledger-core.js:28` `throw Object.assign(new Error('INVALID_AMOUNT'), { code:'INVALID_AMOUNT' });` | 抛一个带 `code` 的错误并 `catch` 读取 |
| `try/catch` 兜底 | 第 12 章 | 错误处理 | `worker.js:115-117` `try{ const body = await request.json(); }catch(e){ return jsonResponse({valid:false,reason:'bad_body'},400); }` | 故意 `JSON.parse('{坏')` 看 catch 接住 |
| 用错误 `code` 区分业务 | — | — | `bounty-core.js:54` 抛 `INSUFFICIENT_FUNDS`、`bounty-client.js:49` `err.code = data.error` | 在控制台 `try{throw{code:'X'}}catch(e){console.log(e.code)}` |

> 💡 你项目用 `code` 字段（而非仅靠 message）来区分"余额不足 / 参数错 / 未授权"等业务错误，Worker 再把它映射成 HTTP 状态码（402/403/401）。这是写后端 API 的常用套路。

---

## 7. 浏览器 DOM 与界面（P1 提词器 `index.html`）

| JS 概念 | 红宝书 | 现代教程 | 项目实弹（index.html） | 小练习 |
|---|---|---|---|---|
| 选中元素 `getElementById` | 第 16 章 | 文档/DOM | `index.html:257` `const btnPlay = document.getElementById('btnPlay');` | 控制台 `document.getElementById('btnPlay')` 看返回 |
| 绑定事件 `addEventListener` | 第 17 章 | 事件 | `index.html:480` `btnPlay.addEventListener('click', togglePlay);` | 给一个按钮绑 `click` 弹 `alert` |
| 改样式 `.style` | 第 16 章 | 样式/类 | `index.html:348` `scrollText.style.fontSize = state.fontSize + 'px';` | 控制台改某元素 `style.color='red'` |
| 增删 class `.classList` | 第 16 章 | 样式/类 | `index.html:446` `toastEl.classList.add('show');` | `classList.toggle('x')` 试切换 |
| Canvas 画布 | 第 18 章 | — | `index.html:335` `document.createElement('canvas')` + `getContext('2d')` | 搜"canvas 画矩形"小例子 |
| 动画 `requestAnimationFrame` | 第 18 章 | — | `index.html:365` `rafId = requestAnimationFrame(loop);` | 理解"每帧调用一次"实现滚动 |

> 💡 `index.html` 就是 P1 提词器本体（22KB 单文件，内含全部 UI 逻辑）。它是你**唯一的前端文件**，也是练 DOM 最好的素材——直接双击在浏览器打开就能玩。

---

## 8. Web 平台 API（你项目里用到的"高级但实用"的部分）

| JS 概念 | 现代教程 | 项目实弹 | 说明 |
|---|---|---|---|
| `crypto.subtle` HMAC 加密 | Web Crypto | `worker.js:41-47` `hmacSha256` 用 `crypto.subtle.importKey` + `sign` | P0 验签核心，Telegram 官方算法 |
| `URLSearchParams` 解析串 | URL | `worker.js:57` `new URLSearchParams(initData)` | 把 `a=1&b=2` 变成可读取的对象 |
| `JSON.stringify` / `JSON.parse` | 网络请求 | `bounty-client.js:41` `JSON.stringify(body)`、`:44` `res.json()` | 前后端通信的"序列化" |
| `TextEncoder` | 二进制 | `worker.js:34` `new TextEncoder().encode(str)` | 把字符串转字节，喂给加密函数 |
| `Response` / `Request` | Fetch | `worker.js:89` `new Response(JSON.stringify(obj), {status, headers})` | Cloudflare Worker 的出入参形态 |
| `new Map()` 数据结构 | 第 6 章 | `test-credits.mjs:42` `const users = new Map()`（mock 数据库） | 测试里用 Map 模拟数据库 |

---

## 9. 工程化：测试与模块（看懂你自己的 `test-*.mjs`）

| JS 概念 | 说明 | 项目实弹 |
|---|---|---|
| `node:test` 测试框架 | 写 `test('描述', async()=>{...})`，用 `assert` 断言 | `test-credits.mjs:11` `import test from 'node:test'`、`:100` `test('1) 核心逻辑...', async()=>{...})` |
| `node:assert/strict` 断言 | `assert.equal(a,b)`、`assert.rejects(...)` | `test-credits.mjs:12`、`:103` `assert.equal(b,100)`、`:109` `assert.rejects(...)` |
| 依赖注入 / Mock | 把"数据库"抽象成接口，测试时用内存版替换 | `test-credits.mjs:40-95` `makeMockDB()` 模拟 D1；`p2-credits/inmemory-store.js` 是另一种 mock |
| `Promise.all` 并发 | 同时跑多个异步 | `test-credits.mjs:128` `await Promise.all([...grants, ...consumes])` |

> 💡 跑测试就是学 JS 的"即时反馈"：**改一行 → `node --test` → 看绿/红**。你项目 51 个测试全绿，是现成的练习场。

---

## 10. 推荐阅读顺序（从你项目里挑文件，由易到难）

1. **先读最"纯"的逻辑**：`p2-credits/ledger-core.js`（72 行，函数+错误处理，无 DOM 无网络）。
2. **再读复用它的**：`p4-bounty/bounty-core.js`、`p5-growth/growth-core.js`（看 `import` 怎么复用 P2）。
3. **读前端**：`index.html`（搜 `getElementById` / `addEventListener`，理解界面怎么动）。
4. **读加密/后端入口**：`worker.js`（看 `fetch` 怎么接收请求、`crypto` 怎么验签）。
5. **读客户端**：`p4-bounty/bounty-client.js`（看 `fetch` 怎么调后端、`try/catch` 怎么兜底）。
6. **读测试**：`p2-credits/test-credits.mjs`（看别人怎么验证代码正确）。

每读一个文件，对照上面 1–9 阶段把用到的语法标出来，遇到不认识的就翻红宝书/现代教程对应章。**能独立读懂 `ledger-core.js` 并改其中一行逻辑（比如把积分上限改掉），你就已经入门了。**

---

## 11. 给你的 3 个"里程碑"小目标

- 🥉 **里程碑 1**：在控制台用 `const` / 箭头函数 / 模板字符串写出"输入名字返回问候语"的函数。
- 🥈 **里程碑 2**：读懂 `ledger-core.js` 的 `grant` 函数，并在本地 `node --test p2-credits/` 跑绿。
- 🥇 **里程碑 3**：给 `ledger-core.js` 的 `consume` 加一个"单日消耗上限"的小逻辑，跑测试验证不破坏现有用例。

> 学语言最快的方式不是从头读完一本书，而是**带着"我要改懂自己这个项目"的目标去查**。这份清单就是你的地图。
