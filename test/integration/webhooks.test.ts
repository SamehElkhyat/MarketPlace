import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, idempotencyKey, prepareCart, type Harness } from '../helpers/harness';

const SECRET = 'mock-webhook-secret';

let h: Harness;
beforeAll(async () => {
  h = await bootstrap({ PAYMENTS_MOCK_ENABLED: 'true', PAYMENTS_MOCK_SECRET: SECRET });
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.reset();
  await h.seed();
});

const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw).digest('hex');

async function onlineOrder() {
  const s = await h.signUp();
  const addressId = await prepareCart(h, s, [{ sku: 'TEE-M-BLK', qty: 1 }]);
  const res = await h
    .http()
    .post('/api/orders')
    .set(h.api.authed(s.token))
    .set('Idempotency-Key', idempotencyKey())
    .send({ addressId, paymentMethod: 'card' });
  expect(res.status).toBe(201);
  return { s, order: res.body.order as { id: string; orderNumber: string; total: number; status: string }, payment: res.body.payment };
}

const postWebhook = (body: object | string, signature?: string) => {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return h
    .http()
    .post('/api/payments/webhooks/mock')
    .set('Content-Type', 'application/json')
    .set('x-mock-signature', signature ?? sign(raw))
    .send(raw);
};

const succeeded = (o: { orderNumber: string; total: number }, over: object = {}) => ({
  type: 'payment.succeeded',
  id: `mock_${o.orderNumber}`,
  orderNumber: o.orderNumber,
  amount: o.total,
  currency: 'EGP',
  ...over,
});

describe('online payment lifecycle (Mock provider behind the adapter interface)', () => {
  it('creates a pending_payment order, reserves stock and returns payment details', async () => {
    const { order, payment } = await onlineOrder();
    expect(order.status).toBe('pending_payment');
    expect(payment).toMatchObject({ providerTxnId: `mock_${order.orderNumber}`, clientSecret: expect.any(String) });
    const stock = (await h.models.ProductModel.findOne({ 'variants.sku': 'TEE-M-BLK' }).lean())!.variants.find((v) => v.sku === 'TEE-M-BLK')!.stock;
    expect(stock).toBe(9);
  });

  it('a VALID signed webhook marks the order paid (the webhook is the source of truth)', async () => {
    const { order, s } = await onlineOrder();
    const res = await postWebhook(succeeded(order));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('processed');

    const mine = await h.http().get(`/api/orders/${order.orderNumber}`).set(h.api.authed(s.token));
    expect(mine.body.order).toMatchObject({ status: 'paid', paymentStatus: 'paid' });
    await new Promise((r) => setTimeout(r, 50));
    expect(h.outbox().some((m) => m.to === s.email && m.subject.includes(order.orderNumber))).toBe(true);
  });

  it('rejects an INVALID signature with 401 and changes nothing', async () => {
    const { order, s } = await onlineOrder();
    const res = await postWebhook(succeeded(order), 'f'.repeat(64));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_SIGNATURE');

    const wrongKey = await postWebhook(succeeded(order), sign(JSON.stringify(succeeded(order)), 'attacker-secret'));
    expect(wrongKey.status).toBe(401);

    const mine = await h.http().get(`/api/orders/${order.orderNumber}`).set(h.api.authed(s.token));
    expect(mine.body.order.status).toBe('pending_payment');
    const events = await h.models.PaymentEventModel.find().lean();
    expect(events.every((e) => e.outcome === 'invalid_signature' && !e.signatureValid)).toBe(true);
  });

  it('a tampered body fails the signature check', async () => {
    const { order } = await onlineOrder();
    const raw = JSON.stringify(succeeded(order));
    const res = await postWebhook(raw.replace(String(order.total), '1'), sign(raw));
    expect(res.status).toBe(401);
  });

  it('is idempotent: the same callback delivered twice only pays once', async () => {
    const { order, s } = await onlineOrder();
    const first = await postWebhook(succeeded(order));
    const second = await postWebhook(succeeded(order));
    const third = await postWebhook(succeeded(order));
    expect([first, second, third].map((r) => r.body.outcome)).toEqual(['processed', 'duplicate', 'duplicate']);

    const doc = await h.models.OrderModel.findById(order.id).lean();
    expect(doc!.statusHistory.filter((e) => e.status === 'paid')).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.outbox().filter((m) => m.to === s.email && m.subject.includes(order.orderNumber))).toHaveLength(1);
  });

  it('concurrent duplicate deliveries still pay exactly once', async () => {
    const { order } = await onlineOrder();
    const results = await Promise.all(Array.from({ length: 5 }, () => postWebhook(succeeded(order))));
    expect(results.filter((r) => r.body.outcome === 'processed')).toHaveLength(1);
    const doc = await h.models.OrderModel.findById(order.id).lean();
    expect(doc!.statusHistory.filter((e) => e.status === 'paid')).toHaveLength(1);
  });

  it('refuses to mark paid when the amount or currency does not match the order', async () => {
    const { order, s } = await onlineOrder();
    expect((await postWebhook(succeeded(order, { amount: 100 }))).body.outcome).toBe('amount_mismatch');
    expect((await postWebhook(succeeded(order, { currency: 'USD' }))).body.outcome).toBe('amount_mismatch');
    const mine = await h.http().get(`/api/orders/${order.orderNumber}`).set(h.api.authed(s.token));
    expect(mine.body.order.status).toBe('pending_payment');
  });

  it('stores every callback verbatim in payment_events for audits', async () => {
    const { order } = await onlineOrder();
    const raw = JSON.stringify(succeeded(order));
    await postWebhook(raw);
    const [event] = await h.models.PaymentEventModel.find().lean();
    expect(event).toMatchObject({ provider: 'mock', rawPayload: raw, signatureValid: true, outcome: 'processed' });
  });

  it('ignores callbacks for unknown transactions', async () => {
    await onlineOrder();
    const res = await postWebhook({ type: 'payment.succeeded', id: 'mock_ORD-999999', orderNumber: 'ORD-999999', amount: 1, currency: 'EGP' });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('unknown_payment');
  });

  it('a late payment for an already-cancelled order is flagged, not silently accepted', async () => {
    const { order, s } = await onlineOrder();
    await h.http().post(`/api/orders/${order.orderNumber}/cancel`).set(h.api.authed(s.token)).send({}).expect(200);
    const res = await postWebhook(succeeded(order));
    expect(res.body.outcome).toBe('order_not_payable');
    const doc = await h.models.OrderModel.findById(order.id).lean();
    expect(doc!.status).toBe('cancelled');
  });

  it('a paid order can be refunded by an admin (stock returns) but never "cancelled"', async () => {
    const { order } = await onlineOrder();
    await postWebhook(succeeded(order));
    const admin = await h.admin();
    const move = (to: string) => h.http().post(`/api/admin/orders/${order.id}/transition`).set(h.api.authed(admin.token)).send({ to });

    expect((await move('cancelled')).status).toBe(422); // money was taken — must go through refund
    expect((await move('refunded')).status).toBe(200);
    const stock = (await h.models.ProductModel.findOne({ 'variants.sku': 'TEE-M-BLK' }).lean())!.variants.find((v) => v.sku === 'TEE-M-BLK')!.stock;
    expect(stock).toBe(10);
    expect((await h.models.PaymentModel.findOne({ orderId: order.id }).lean())!.status).toBe('refunded');
  });
});
