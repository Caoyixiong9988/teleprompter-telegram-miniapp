-- schema.sql — P6 增强模块 D1 schema（独立库 teleprompter-enhance）
-- 初始化（建库见 p6-enhance/wrangler.toml，database_name = teleprompter-enhance）：
--   wrangler d1 execute teleprompter-enhance --local  --file=./p6-enhance/schema.sql
--   wrangler d1 execute teleprompter-enhance --remote --file=./p6-enhance/schema.sql

-- A) 台词云端同步：用户私有文稿（user_id 来自 Telegram initData 验签）
CREATE TABLE IF NOT EXISTS scripts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scripts_user_updated ON scripts(user_id, updated_at DESC);

-- B) 双设备远程控制：持有 token 的两台设备共享一条"最新播放指令"会话
--    token 是两台手机经 Telegram 聊天线下交换的共享密钥（不存明文 bot token）
CREATE TABLE IF NOT EXISTS remote_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id TEXT    NOT NULL,
  session_token TEXT    NOT NULL,
  last_command  TEXT,            -- JSON: {"cmd":"play"|"pause"|"speed","value":<number|null>,"updated_at":<ms>}
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_remote_token ON remote_sessions(session_token);
