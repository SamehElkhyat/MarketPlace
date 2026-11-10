import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, idempotencyKey, prepareCart, type Harness, type Session } from '../helpers/harness';

let h: Harness;
beforeAll(async () => {
  h = await bootstrap();
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.reset();
  await h.seed();
});

const stockOf = async (sku: string) =>
  (await h.models.ProductModel.findOne({ 'variants.sku': sku }).lean())!.variants.find((v) => v.sku === sku)!.stock;

const place = (s: Session, addressId: string) =>
  h.http().post('/api/orders').set(h.api.authed(s.token)).set('Idempotency-Key', idempotencyKey()).send({ addressId, paymentMethod: 'cod' });

describe('Scenario 3 — everyone wants the last unit at the same instant', () => {
  it('two customers, one piece: exactly one order succeeds', async () => {
    const [a, b] = await Promise.all([h.signUp(), h.signUp()]);
    // TEE-S-BLK has stock 1
    const [addrA, addrB] = await Promise.all([prepareCart(h, a, [{ sku: 'TEE-S-BLK', qty: 1 }]), prepareCart(h, b, [{ sku: 'TEE-S-BLK', qty: 1 }])]);

    const results = await Promise.all([place(a, addrA), place(b, addrB)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf('TEE-S-BLK')).toBe(0);
    expect(await h.models.OrderModel.countDocuments()).toBe(1);
  });

  it('10 simultaneous buyers, 1 unit left: exactly one winner, stock never goes negative', async () => {
    const buyers = await Promise.all(Array.from({ length: 10 }, () => h.signUp()));
    const addresses = await Promise.all(buyers.map((b) => prepareCart(h, b, [{ sku: 'TEE-S-BLK', qty: 1 }])));

    const results = await Promise.all(buyers.map((b, i) => place(b, addresses[i]!)));

    const winners = results.filter((r) => r.status === 201);
    const losers = results.filter((r) => r.status === 409);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(9);
    losers.forEach((r) => expect(r.body.error.code).toBe('INSUFFICIENT_STOCK'));

    expect(await stockOf('TEE-S-BLK')).toBe(0);
    expect(await h.models.OrderModel.countDocuments()).toBe(1);
    // exactly one inventory movement was recorded — the losers' transactions rolled back completely
    expect(await h.models.InventoryLogModel.countDocuments({ sku: 'TEE-S-BLK' })).toBe(1);
  });

  it('10 buyers for 10 different quantities never oversell: total sold ≤ stock', async () => {
    // TEE-M-BLK has stock 10; 8 buyers each want 2 units → at most 5 can win
    const buyers = await Promise.all(Array.from({ length: 8 }, () => h.signUp()));
    const addresses = await Promise.all(buyers.map((b) => prepareCart(h, b, [{ sku: 'TEE-M-BLK', qty: 2 }])));
    const results = await Promise.all(buyers.map((b, i) => place(b, addresses[i]!)));

    const wins = results.filter((r) => r.status === 201).length;
    expect(wins).toBe(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await stockOf('TEE-M-BLK')).toBe(0);
  });

  it('a multi-item order is all-or-nothing: if one line is out of stock nothing is deducted', async () => {
    const first = await h.signUp();
    const second = await h.signUp();
    const addr1 = await prepareCart(h, first, [{ sku: 'TEE-S-BLK', qty: 1 }]);
    const addr2 = await prepareCart(h, second, [{ sku: 'TEE-M-BLK', qty: 3 }, { sku: 'TEE-S-BLK', qty: 1 }]);

    expect((await place(first, addr1)).status).toBe(201); // takes the last TEE-S-BLK
    const failed = await place(second, addr2);
    expect(failed.status).toBe(409);

    expect(await stockOf('TEE-M-BLK')).toBe(10); // the M line was rolled back with the failed S line
  });
});
