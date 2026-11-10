import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, idempotencyKey, prepareCart, type Harness, type Session } from '../helpers/harness';

let h: Harness;
beforeAll(async () => {
  h = await bootstrap({ PAYMENTS_MOCK_ENABLED: 'false' }); // production-like: online methods are "coming soon"
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.reset();
  await h.seed();
});

const stockOf = async (sku: string) =>
  (await h.models.ProductModel.findOne({ 'variants.sku': sku }).lean())!.variants.find((v) => v.sku === sku)!.stock;

async function placeOrder(s: Session, addressId: string, extra: Record<string, unknown> = {}, key = idempotencyKey()) {
  return h
    .http()
    .post('/api/orders')
    .set(h.api.authed(s.token))
    .set('Idempotency-Key', key)
    .send({ addressId, paymentMethod: 'cod', ...extra });
}

describe('Scenario 1 — customer orders with cash on delivery', () => {
  it('prices the cart on the server, creates the order, deducts stock, clears the cart and e-mails a confirmation', async () => {
    const s = await h.signUp('Sara Ahmed');
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 2 }]);

    const quote = await h.http().post('/api/checkout/quote').set(h.api.authed(s.token)).send({ addressId });
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ subtotal: 105_800, shippingFee: 5000, discount: 0, total: 110_800, codAvailable: true });

    const res = await placeOrder(s, addressId, { expectedTotal: 110_800, note: 'Call before arriving' });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      status: 'pending_confirmation',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      total: 110_800,
      items: [expect.objectContaining({ sku: 'TEE-M-BLK', qty: 2, unitPrice: 52_900, lineTotal: 105_800 })],
    });
    expect(res.body.order.orderNumber).toMatch(/^ORD-\d{6}$/);

    expect(await stockOf('TEE-M-BLK')).toBe(8); // stock deducted immediately for COD
    const cart = await h.http().get('/api/cart').set(h.api.authed(s.token));
    expect(cart.body.cart.items).toHaveLength(0);

    const log = await h.models.InventoryLogModel.find({ sku: 'TEE-M-BLK' }).lean();
    expect(log).toEqual([expect.objectContaining({ delta: -2, reason: 'order_placed' })]);

    await new Promise((r) => setTimeout(r, 50));
    const mail = h.outbox().find((m) => m.to === s.email && m.subject.includes(res.body.order.orderNumber));
    expect(mail).toBeDefined();
    expect(mail!.html).toContain('dir="ltr"');
    expect(mail!.html).toContain('Cotton Tee');
  });

  it('is idempotent: a double-click / retry with the same key returns the SAME order', async () => {
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const key = idempotencyKey();

    const [a, b, c] = await Promise.all([placeOrder(s, addressId, {}, key), placeOrder(s, addressId, {}, key), placeOrder(s, addressId, {}, key)]);
    const numbers = new Set([a, b, c].map((r) => r.body.order.orderNumber));
    expect(numbers.size).toBe(1);
    expect([a, b, c].filter((r) => r.status === 201)).toHaveLength(1);

    expect(await h.models.OrderModel.countDocuments()).toBe(1);
    expect(await stockOf('TEE-M-BLK')).toBe(9); // charged once, not three times
  });

  it('requires an Idempotency-Key and an existing cart', async () => {
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const missing = await h.http().post('/api/orders').set(h.api.authed(s.token)).send({ addressId, paymentMethod: 'cod' });
    expect(missing.status).toBe(400);

    const s2 = await h.signUp();
    const a2 = await prepareCart(h, s2, []);
    const empty = await placeOrder(s2, a2);
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('EMPTY_CART');
  });

  it('applies coupons server-side and counts the use', async () => {
    const admin = await h.admin();
    await h
      .http()
      .post('/api/admin/coupons')
      .set(h.api.authed(admin.token))
      .send({ code: 'WELCOME10', type: 'percent', value: 10, minOrder: 10_000, maxUses: 1 })
      .expect(201);

    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const res = await placeOrder(s, addressId, { couponCode: 'welcome10' });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ discount: 5290, total: 52_900 - 5290 + 5000, couponCode: 'WELCOME10' });
    expect((await h.models.CouponModel.findOne({ code: 'WELCOME10' }))!.usedCount).toBe(1);

    // maxUses reached → a second customer is rejected
    const s2 = await h.signUp();
    const a2 = await prepareCart(h, s2, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const second = await placeOrder(s2, a2, { couponCode: 'WELCOME10' });
    expect(second.status).toBe(422);
    expect(second.body.error).toMatchObject({ code: 'COUPON_INVALID', details: { reason: 'exhausted' } });
    expect(await stockOf('TEE-M-BLK')).toBe(9); // the failed order rolled back its stock reservation
  });

  it('refuses when prices changed since the shopper looked (expectedTotal)', async () => {
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const res = await placeOrder(s, addressId, { expectedTotal: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(await stockOf('TEE-M-BLK')).toBe(10);
  });

  it('enforces the cash-on-delivery limit', async () => {
    await h.models.ProductModel.updateOne({ 'variants.sku': 'TEE-M-BLK' }, { $set: { 'variants.$.price': 5_000_000 } });
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const res = await placeOrder(s, addressId);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('COD_LIMIT_EXCEEDED');
    expect(await stockOf('TEE-M-BLK')).toBe(10);
  });
});

describe('Scenario 5 — online payment methods show as "coming soon"', () => {
  it('lists card/wallet/fawry as disabled and rejects them', async () => {
    const methods = await h.http().get('/api/checkout/payment-methods');
    expect(methods.body.items).toEqual(
      expect.arrayContaining([
        { method: 'cod', provider: 'cod', enabled: true, comingSoon: false },
        expect.objectContaining({ method: 'card', enabled: false, comingSoon: true }),
        expect.objectContaining({ method: 'wallet', enabled: false, comingSoon: true }),
        expect.objectContaining({ method: 'fawry', enabled: false, comingSoon: true }),
      ]),
    );

    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const res = await placeOrder(s, addressId, { paymentMethod: 'card' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
    expect(await h.models.OrderModel.countDocuments()).toBe(0);
  });
});

describe('Scenario 2 — admin moves the order to delivery; customer sees the timeline', () => {
  it('follows the state machine and records who did what', async () => {
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const order = (await placeOrder(s, addressId)).body.order;
    const admin = await h.admin();
    const move = (to: string) =>
      h.http().post(`/api/admin/orders/${order.id}/transition`).set(h.api.authed(admin.token)).send({ to });

    // illegal jumps are rejected — even for admins
    const jump = await move('shipped');
    expect(jump.status).toBe(422);
    expect(jump.body.error.code).toBe('INVALID_TRANSITION');
    expect(jump.body.error.details.allowed.sort()).toEqual(['cancelled', 'confirmed']);

    for (const to of ['confirmed', 'processing', 'shipped', 'delivered']) {
      const r = await move(to);
      expect(r.status, `→ ${to}`).toBe(200);
      expect(r.body.order.status).toBe(to);
    }
    await move('confirmed').then((r) => expect(r.status).toBe(422)); // delivered is final (except refund)

    const mine = await h.http().get(`/api/orders/${order.orderNumber}`).set(h.api.authed(s.token));
    expect(mine.body.order.status).toBe('delivered');
    expect(mine.body.order.paymentStatus).toBe('paid'); // cash collected on delivery
    expect(mine.body.order.statusHistory.map((e: { status: string }) => e.status)).toEqual([
      'pending_confirmation', 'confirmed', 'processing', 'shipped', 'delivered',
    ]);
    expect((await h.models.ProductModel.findOne({ 'variants.sku': 'TEE-M-BLK' }).lean())!.soldCount).toBe(1);

    await new Promise((r) => setTimeout(r, 50));
    const subjects = h.outbox().filter((m) => m.to === s.email).map((m) => m.subject);
    expect(subjects.some((x) => /shipped/i.test(x))).toBe(true);
    expect(subjects.some((x) => /delivered/i.test(x))).toBe(true);
  });

  it('customers cannot see or touch other customers\' orders', async () => {
    const owner = await h.signUp();
    const addressId = await prepareCart(h, owner, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const order = (await placeOrder(owner, addressId)).body.order;

    const intruder = await h.signUp();
    expect((await h.http().get(`/api/orders/${order.orderNumber}`).set(h.api.authed(intruder.token))).status).toBe(404);
    expect((await h.http().post(`/api/orders/${order.orderNumber}/cancel`).set(h.api.authed(intruder.token)).send({})).status).toBe(404);
  });
});

describe('Scenario 4 — customer cancels before shipping: stock comes back', () => {
  it('restores stock, logs it, releases the coupon and e-mails the customer', async () => {
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 3 }]);
    const order = (await placeOrder(s, addressId)).body.order;
    expect(await stockOf('TEE-M-BLK')).toBe(7);

    const cancel = await h.http().post(`/api/orders/${order.orderNumber}/cancel`).set(h.api.authed(s.token)).send({ reason: 'Changed my mind' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.order).toMatchObject({ status: 'cancelled', cancelReason: 'Changed my mind' });
    expect(await stockOf('TEE-M-BLK')).toBe(10);

    const logs = await h.models.InventoryLogModel.find({ sku: 'TEE-M-BLK' }).sort({ createdAt: 1 }).lean();
    expect(logs.map((l) => [l.delta, l.reason])).toEqual([[-3, 'order_placed'], [3, 'order_cancelled']]);

    await new Promise((r) => setTimeout(r, 50));
    expect(h.outbox().some((m) => m.to === s.email && /cancelled/i.test(m.subject))).toBe(true);

    // cancelling twice must not restock twice
    const again = await h.http().post(`/api/orders/${order.orderNumber}/cancel`).set(h.api.authed(s.token)).send({});
    expect(again.status).toBe(422);
    expect(await stockOf('TEE-M-BLK')).toBe(10);
  });

  it('a customer can no longer cancel once the order is processing, but an admin can (stock restored)', async () => {
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
    const order = (await placeOrder(s, addressId)).body.order;
    const admin = await h.admin();
    const move = (to: string) => h.http().post(`/api/admin/orders/${order.id}/transition`).set(h.api.authed(admin.token)).send({ to, note: 'Out of courier coverage' });

    await move('confirmed');
    await move('processing');
    const late = await h.http().post(`/api/orders/${order.orderNumber}/cancel`).set(h.api.authed(s.token)).send({});
    expect(late.status).toBe(422);

    expect((await move('cancelled')).status).toBe(200);
    expect(await stockOf('TEE-M-BLK')).toBe(10);
  });

  it('refunding a delivered order returns stock and the sold counter', async () => {
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 2 }]);
    const order = (await placeOrder(s, addressId)).body.order;
    const admin = await h.admin();
    for (const to of ['confirmed', 'processing', 'shipped', 'delivered', 'refunded']) {
      const r = await h.http().post(`/api/admin/orders/${order.id}/transition`).set(h.api.authed(admin.token)).send({ to });
      expect(r.status, `→ ${to}`).toBe(200);
    }
    expect(await stockOf('TEE-M-BLK')).toBe(10);
    expect((await h.models.ProductModel.findOne({ 'variants.sku': 'TEE-M-BLK' }).lean())!.soldCount).toBe(0);
  });
});
