-- schema.sql — P2 统一积分账本 D1 (Cloudflare SQLite) schema
-- 初始化：wrangler d1 execute teleprompter-credits --local --file=./p2-credits/schema.sql
--         wrangler d1 execute teleprompter-credits --remote --file=./p2-credits/schema.sql

-- 跨 App 通用积分总账：同一 Telegram user_id（跨 bot 恒定）一行
CREATE TABLE IF NOT EXISTS users_credits (
  user_id    TEXT PRIMARY KEY,
  balance    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 积分流水（审计 / 防滥用 / 用户展示）。delta 正负表示发放/消耗
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
