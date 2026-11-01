-- schema.sql — P4 悬赏改稿（ADDITIVE，复用 P2 统一积分总账同一 D1 库 teleprompter-credits）
-- 初始化（与 P2/P3 共用同一 D1 库 teleprompter-credits，使 escrow 托管与积分发放可在同一库内原子 batch）：
--   wrangler d1 execute teleprompter-credits --local  --file=./p4-bounty/schema.sql
--   wrangler d1 execute teleprompter-credits --remote --file=./p4-bounty/schema.sql
--
-- 合规红线（凌驾一切，见功能清单 / README）：
--   - 悬赏 = 任务奖励（task reward）。奖励在创建时由平台托管（escrow），仅当发布者 award 时释放给中标者。
--   - 绝不实现钱包到钱包的 P2P 转账（transfer）、提现（withdraw）、押注 / 彩票（gamble / lottery）。
--   - 本模块只调 ledger-core 的 grant / consume：积分只由平台发放，用户只消耗 / 被托管。

-- 悬赏任务（改稿请求）。reward_credits 在创建时由平台托管（escrow），仅 award 时释放给胜者。
CREATE TABLE IF NOT EXISTS bounties (
  id             TEXT    PRIMARY KEY,          -- 服务端生成的 UUID（便于 batch 内引用 + URL 路径）
  owner_user_id  TEXT    NOT NULL,             -- 发布者（requester）Telegram user_id
  title          TEXT    NOT NULL,
  script_text    TEXT    NOT NULL,             -- 待改稿的原始文稿
  reward_credits INTEGER NOT NULL,             -- 任务奖励（积分），创建即被平台托管（escrow）
  status         TEXT    NOT NULL DEFAULT 'open', -- open | closed | cancelled
  created_at     INTEGER NOT NULL,
  deadline       INTEGER,                      -- 可选截止时间（Unix ms）；NULL 表示无期限
  CHECK (reward_credits > 0)
);

-- 改稿投稿。author 不可为 owner（服务端校验，见 bounty-worker.js）。
CREATE TABLE IF NOT EXISTS bounty_submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  bounty_id      TEXT    NOT NULL,
  author_user_id TEXT    NOT NULL,             -- 投稿者 Telegram user_id
  revised_text   TEXT    NOT NULL,             -- 改后的文稿
  status         TEXT    NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  created_at     INTEGER NOT NULL
);

-- 中标记录（一次悬赏至多一条，从业务上保证 award 幂等、不二次发放）。
CREATE TABLE IF NOT EXISTS bounty_awards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  bounty_id      TEXT    NOT NULL,
  submission_id  INTEGER NOT NULL,
  winner_user_id TEXT    NOT NULL,
  awarded_at     INTEGER NOT NULL
);

-- 索引：按任务 / 发布者 / 投稿者查询（任务要求覆盖 bounty_id、owner_user_id、author_user_id）
CREATE INDEX IF NOT EXISTS idx_bounties_owner     ON bounties(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounties_status    ON bounties(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_bounty ON bounty_submissions(bounty_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_submissions_author ON bounty_submissions(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_awards_bounty      ON bounty_awards(bounty_id);
