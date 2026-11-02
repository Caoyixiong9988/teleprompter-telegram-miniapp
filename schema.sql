-- ============================================================================
-- schema.sql — 提词器 Telegram Mini App 单体后端（Monolith）统一 D1 schema
-- 单一 D1 库：teleprompter-credits（绑定名 DB）
-- 合并自 P2–P7 六个模块；全部 IF NOT EXISTS，重复执行安全（幂等）。
--
-- 初始化（本地 + 远程各跑一次）：
--   wrangler d1 execute teleprompter-credits --local  --file=./schema.sql
--   wrangler d1 execute teleprompter-credits --remote --file=./schema.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- P2 统一积分账本（跨 App 通用积分总账：同一 Telegram user_id 一行）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users_credits (
  user_id    TEXT PRIMARY KEY,
  balance    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS credits_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,            -- grant / consume / signin / bounty_win / refund ...
  ref_type   TEXT,                    -- 关联的 biz 类型：pro_unlock / watermark_export / bounty ...
  ref_id     TEXT,                    -- 关联业务 id
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON credits_ledger(user_id, id DESC);

-- ---------------------------------------------------------------------------
-- P3 Telegram Stars 支付账本（与 P2 同库，使"支付+积分"可原子 batch）
-- 幂等键 = tg_payment_charge_id（官方支付唯一号）；重复回调绝不二次发放。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments_stars (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              TEXT    NOT NULL,
  tg_payment_charge_id TEXT    NOT NULL,
  provider             TEXT    NOT NULL DEFAULT 'telegram_stars',
  stars                INTEGER NOT NULL,            -- 用户支付的 Telegram Stars 数量
  credits_granted      INTEGER NOT NULL,            -- 平台据此发放的内部积分
  status               TEXT    NOT NULL DEFAULT 'completed',
  created_at           INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_charge ON payments_stars(tg_payment_charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments_stars(user_id, id DESC);

-- ---------------------------------------------------------------------------
-- P4 悬赏改稿（与 P2 同库，使 escrow 托管与积分发放同库原子）
-- 合规红线：奖励平台托管（escrow），仅 award 释放给中标者；绝不 P2P 转账/提现/赌博。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bounties (
  id             TEXT    PRIMARY KEY,
  owner_user_id  TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  script_text    TEXT    NOT NULL,
  reward_credits INTEGER NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'open',  -- open | closed | cancelled
  created_at     INTEGER NOT NULL,
  deadline       INTEGER,
  CHECK (reward_credits > 0)
);

CREATE TABLE IF NOT EXISTS bounty_submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  bounty_id      TEXT    NOT NULL,
  author_user_id TEXT    NOT NULL,
  revised_text   TEXT    NOT NULL,
  status         TEXT    NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bounty_awards (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  bounty_id      TEXT    NOT NULL,
  submission_id  INTEGER NOT NULL,
  winner_user_id TEXT    NOT NULL,
  awarded_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bounties_owner     ON bounties(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounties_status    ON bounties(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_bounty ON bounty_submissions(bounty_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_submissions_author ON bounty_submissions(author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_awards_bounty      ON bounty_awards(bounty_id);

-- ---------------------------------------------------------------------------
-- P5 病毒增长 / 推荐 / 排行榜 / 礼物（与 P2 同库，积分变动与增长表同库原子）
-- 合规：referrer_user_id 仅可写一次（防刷单）；礼物为平台中介，非钱包互转。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users_referral (
  user_id          TEXT    PRIMARY KEY,
  referrer_user_id TEXT,
  referral_code    TEXT    NOT NULL UNIQUE,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_stats (
  group_id     TEXT    NOT NULL,
  user_id      TEXT    NOT NULL,
  reads_count  INTEGER NOT NULL DEFAULT 0,
  streak_count INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS gift_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id TEXT    NOT NULL,
  to_user_id   TEXT    NOT NULL,
  amount       INTEGER NOT NULL,
  reason       TEXT    NOT NULL DEFAULT 'gift',
  created_at   INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_referral_code ON users_referral(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrer    ON users_referral(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_group_reads ON group_stats(group_id, reads_count DESC);

-- ---------------------------------------------------------------------------
-- P6 增强模块（云同步 / 远程控制 / 模板）—— 原独立库 teleprompter-enhance，现并入单体库
-- 合规：模板库只放中性口播框架，绝不含算命/运势/预测/吉凶/卦/风水/占卜；远程控制仅设备间播放指令中转。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scripts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scripts_user_updated ON scripts(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS remote_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT    NOT NULL,
  session_token TEXT    NOT NULL,
  last_command  TEXT,            -- JSON: {"cmd":"play"|"pause"|"speed","value":<number|null>,"updated_at":<ms>}
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_remote_token ON remote_sessions(session_token);

-- ---------------------------------------------------------------------------
-- P7 合规（举报 / 反馈，与 P2/P3 同库）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL DEFAULT 'feedback',  -- feedback | abuse | infringe | other
  target_id  TEXT,
  detail     TEXT    NOT NULL,
  user_id    TEXT,
  status     TEXT    NOT NULL DEFAULT 'pending',    -- pending | reviewed | resolved | rejected
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status  ON reports(status);
