-- p7-compliance/schema.sql — 举报 / 反馈记录表
-- 部署到与 P2/P3 同一 D1 库（teleprompter-credits），使举报与主账本同库运维。

CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT    NOT NULL DEFAULT 'feedback',  -- feedback | abuse | infringe | other
  target_id  TEXT,                                 -- 被举报对象（如 bounty id / user id），可空
  detail     TEXT    NOT NULL,
  user_id    TEXT,                                 -- 举报人（匿名时为空）
  status     TEXT    NOT NULL DEFAULT 'pending',    -- pending | reviewed | resolved | rejected
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status  ON reports(status);
