-- schema.sql — P3 Telegram Stars 支付账本（ADDITIVE，与 P2 统一积分总账同一 D1 库）
-- 初始化（复用 P2 的 teleprompter-credits 库，使支付与积分在同一库内可原子 batch）：
--   wrangler d1 execute teleprompter-credits --local  --file=./p3-payments/schema.sql
--   wrangler d1 execute teleprompter-credits --remote --file=./p3-payments/schema.sql

-- Telegram Stars 支付记录。幂等键 = tg_payment_charge_id（官方支付唯一号）。
-- 同一 charge_id 重复回调绝不允许二次发放积分。
CREATE TABLE IF NOT EXISTS payments_stars (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                  TEXT    NOT NULL,
  tg_payment_charge_id     TEXT    NOT NULL,
  provider                 TEXT    NOT NULL DEFAULT 'telegram_stars',
  stars                    INTEGER NOT NULL,            -- 用户支付的 Telegram Stars 数量
  credits_granted          INTEGER NOT NULL,            -- 平台据此发放的内部积分（见 payments-core.js 商品目录）
  status                   TEXT    NOT NULL DEFAULT 'completed',
  created_at               INTEGER NOT NULL
);

-- 幂等约束：charge_id 唯一，是"重复回调不重复发放"的硬保证
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_charge ON payments_stars(tg_payment_charge_id);

-- 按用户 / 按时间查询的辅助索引
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments_stars(user_id, id DESC);
