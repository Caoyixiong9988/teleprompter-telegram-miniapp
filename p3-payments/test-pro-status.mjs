import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryPaymentsStore } from './inmemory-payments-store.js';

test('grantPro 写入订阅，getProStatus 在到期前返回 pro:true', async () => {
  const store = new InMemoryPaymentsStore();
  const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;
  const r = await store.grantPro({ userId: 'u1', chargeId: 'c1', productId: 'pro_month', stars: 400, expiresAt });
  assert.equal(r.inserted, true);
  const status = await store.getProStatus('u1');
  assert.equal(status.pro, true);
  assert.equal(status.productId, 'pro_month');
});

test('grantPro 重复 chargeId 幂等（duplicate）', async () => {
  const store = new InMemoryPaymentsStore();
  const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;
  await store.grantPro({ userId: 'u1', chargeId: 'c1', productId: 'pro_month', stars: 400, expiresAt });
  const r2 = await store.grantPro({ userId: 'u1', chargeId: 'c1', productId: 'pro_month', stars: 400, expiresAt });
  assert.equal(r2.duplicate, true);
});

test('getProStatus 对未知用户返回 pro:false', async () => {
  const store = new InMemoryPaymentsStore();
  const status = await store.getProStatus('nobody');
  assert.equal(status.pro, false);
});

test('getProStatus 过期后返回 pro:false', async () => {
  const store = new InMemoryPaymentsStore();
  const expiresAt = Date.now() - 1000; // 已过期
  await store.grantPro({ userId: 'u2', chargeId: 'c2', productId: 'pro_year', stars: 4000, expiresAt });
  const status = await store.getProStatus('u2');
  assert.equal(status.pro, false);
  assert.equal(status.expired, true);
});

test('PRO 商品对齐前端定价（400/4000 Stars）且 kind=pro', async () => {
  const { STARS_PRODUCTS } = await import('./payments-core.js');
  assert.equal(STARS_PRODUCTS.pro_month.stars, 400);
  assert.equal(STARS_PRODUCTS.pro_year.stars, 4000);
  assert.equal(STARS_PRODUCTS.pro_month.kind, 'pro');
  assert.equal(STARS_PRODUCTS.pro_year.kind, 'pro');
});
