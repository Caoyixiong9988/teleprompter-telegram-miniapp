-- schema.sql — P5 病毒增长 / 推荐 / 排行榜 / 礼物（ADDITIVE，与 P2 统一积分总账同一 D1 库）
-- 初始化（复用 P2 的 teleprompter-credits 库，使积分变动与增长表同库原子可见）：
--   wrangler d1 execute teleprompter-credits --local  --file=./p5-growth/schema.sql
--   wrangler d1 execute teleprompter-credits --remote --file=./p5-growth/schema.sql

-- 推荐关系：每位用户一行；referral_code 唯一（用于分享深链 ?start=CODE）
-- 合规：referrer_user_id 仅可写一次（首次归因），避免刷单；奖励为平台发放，非钱包互转。
CREATE TABLE IF NOT EXISTS users_referral (
  user_id          TEXT    PRIMARY KEY,
  referrer_user_id TEXT,                         -- 首次归因的推荐人（写入后不可改）
  referral_code    TEXT    NOT NULL UNIQUE,      -- 平台为"本用户"生成的专属邀请码
  created_at       INTEGER NOT NULL
);

-- 群组阅读 / 打卡统计：用于排行榜（群组维度 + 用户维度）。reads_count = 累计阅读/使用次数。
CREATE TABLE IF NOT EXISTS group_stats (
  group_id     TEXT    NOT NULL,
  user_id      TEXT    NOT NULL,
  reads_count  INTEGER NOT NULL DEFAULT 0,
  streak_count INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- 积分礼物流水（平台中介，非 P2P 钱包互转；consume(gift_send)+grant(gift_receive) 双记）
CREATE TABLE IF NOT EXISTS gift_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id TEXT    NOT NULL,
  to_user_id   TEXT    NOT NULL,
  amount       INTEGER NOT NULL,
  reason       TEXT    NOT NULL DEFAULT 'gift',
  created_at   INTEGER NOT NULL
);

-- 索引（见任务要求：referral_code / referrer_user_id / (group_id, reads_count)）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_referral_code ON users_referral(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrer        ON users_referral(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_group_reads     ON group_stats(group_id, reads_count DESC);
