import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, type Harness } from '../helpers/harness';

let h: Harness;
beforeAll(async () => {
  h = await bootstrap();
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.reset();
  await h.seed();
});

async function demoAdmin() {
  await h.models.UserModel.create({
    name: 'Demo Reviewer',
    email: 'demo@example.com',
    passwordHash: await bcrypt.hash('DemoPass1', 4),
    role: 'demo_admin',
    emailVerified: true,
  });
  const res = await h.http().post('/api/auth/login').send({ email: 'demo@example.com', password: 'DemoPass1' });
  return h.api.authed(res.body.accessToken as string);
}

describe('read-only demo admin', () => {
  it('can read every back-office screen', async () => {
    const auth = await demoAdmin();
    for (const path of ['/api/admin/dashboard', '/api/admin/orders', '/api/admin/products', '/api/admin/categories', '/api/admin/customers', '/api/admin/audit-logs']) {
      expect((await h.http().get(path).set(auth)).status, path).toBe(200);
    }
  });

  it('cannot change anything — every non-GET admin call is refused', async () => {
    const auth = await demoAdmin();
    const coupon = await h.http().post('/api/admin/coupons').set(auth).send({ code: 'HACK10', type: 'fixed', value: 100 });
    expect(coupon.status).toBe(403);
    expect(await h.models.CouponModel.countDocuments()).toBe(0);

    const adjust = await h.http().post('/api/admin/inventory/adjust').set(auth).send({ sku: 'TEE-M-BLK', delta: 5, note: 'trying it' });
    expect(adjust.status).toBe(403);
  });
});

describe('audit log & dashboard', () => {
  it('records who did what for admin mutations', async () => {
    const admin = await h.admin();
    await h.http().post('/api/admin/coupons').set(h.api.authed(admin.token)).send({ code: 'AUDIT10', type: 'percent', value: 10 }).expect(201);
    const logs = await h.http().get('/api/admin/audit-logs').set(h.api.authed(admin.token));
    expect(logs.body.items[0]).toMatchObject({ action: 'coupon.create', entity: 'coupon', actorId: expect.objectContaining({ email: 'admin@example.com' }) });
  });

  it('computes dashboard figures from real orders', async () => {
    const admin = await h.admin();
    const res = await h.http().get('/api/admin/dashboard').set(h.api.authed(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ today: { revenue: 0, orders: 0 }, month: { orders: 0 }, lowStock: expect.any(Array) });
    expect(res.body.lowStock.map((l: { sku: string }) => l.sku)).toContain('TEE-S-BLK'); // stock 1 ≤ threshold
  });

  it('imports products from CSV rows, reporting per-row errors', async () => {
    const admin = await h.admin();
    const rows = [
      { title_en: 'Imported Tee', title_ar: 'تيشيرت مستورد', category_slug: 'men', sku: 'IMP-1', price_egp: '199.50', stock: '4', status: 'published' },
      { title_en: 'Bad Row', title_ar: 'خطأ', category_slug: 'does-not-exist', sku: 'IMP-2', price_egp: '10', stock: '1' },
    ];
    const res = await h.http().post('/api/admin/products/import').set(h.api.authed(admin.token)).send({ rows });
    expect(res.body.results[0]).toMatchObject({ ok: true, sku: 'IMP-1' });
    expect(res.body.results[1]).toMatchObject({ ok: false, error: expect.stringContaining('Unknown category') });
    const product = await h.models.ProductModel.findOne({ 'variants.sku': 'IMP-1' }).lean();
    expect(product!.variants[0]!.price).toBe(19_950); // EGP → integer piasters, no float drift
  });
});
