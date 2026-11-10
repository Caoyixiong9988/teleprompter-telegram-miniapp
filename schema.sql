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
  reason     TEXT NOT NULL,            -- grant / consume / signin / pro_unlock / refund ...
  ref_type   TEXT,                    -- 关联的 biz 类型：pro_unlock / watermark_export ...
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
-- P3（续）Pro 订阅（按 Telegram Stars 购买；月付 pro_month / 年付 pro_year；到期前有效）
-- 与支付账本同库；webhook 在 successful_payment 收到 pro_* 商品时写此表，
-- 前端 /payments/pro-status 据此返回 { pro: bool }，作为"去水印高清导出"等 Pro 权益的权威来源。
--
-- 2026-11-10：新增 charge_id（授予该订阅的支付号）。退款时按 charge_id 精确撤销，
-- 避免「用户先买月付、再买年付覆盖同一行」后退掉旧单却误撤当前有效订阅。
-- 后端尚未首次部署，直接改建表定义即可，无历史数据迁移成本。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users_pro (
  user_id    TEXT    PRIMARY KEY,
  product_id TEXT    NOT NULL,            -- pro_month | pro_year
  charge_id  TEXT    NOT NULL,            -- 授予该订阅的 tg_payment_charge_id（退款精确撤销用）
  stars      INTEGER NOT NULL,            -- 用户支付的 Telegram Stars 数量
  expires_at INTEGER NOT NULL,            -- 到期时间戳(ms)；到期前 pro-status 返回 true
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_pro_expires ON users_pro(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_pro_charge ON users_pro(charge_id);

-- ---------------------------------------------------------------------------
-- P3（续）退款审计（管理员在 /admin 页面点「退款」后写入）
-- 硬约束：只有 Telegram Bot API refundStarPayment 返回 ok:true 才会写本地，
--         即「平台真的退了钱」才撤销 Pro / 扣回积分，绝不先撤权益后退钱。
-- UNIQUE(charge_id) 是重复退款的幂等硬保证；credits_revoked 记录实际扣回数
-- （用户已花掉的部分不追成负数），pro_revoked 标记是否撤销了对应订阅行。
-- forced=1 表示管理员明确越过 14 天窗口，必须留痕。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refunds (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              TEXT    NOT NULL,
  tg_payment_charge_id TEXT    NOT NULL,
  stars                INTEGER NOT NULL,
  credits_revoked      INTEGER NOT NULL DEFAULT 0,
  pro_revoked          INTEGER NOT NULL DEFAULT 0,
  forced               INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_refunds_charge ON refunds(tg_payment_charge_id);
CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id, id DESC);

-- ---------------------------------------------------------------------------
-- 2026-11-10：P4 悬赏改稿已下线（依据《产品宪法 · 所有 APP 共同底线》）。
--   原因：双边市场 + UGC + 积分托管 + 需人工裁决，与「单人可运维」冲突。
--   新部署不再创建 bounties / bounty_submissions / bounty_awards 及索引；
--   p4-bounty/ 目录与单测保留为存档，运行时路由已移除。
-- ---------------------------------------------------------------------------

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
-- 口径：模板库只放中性口播框架；远程控制仅设备间播放指令中转。
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
