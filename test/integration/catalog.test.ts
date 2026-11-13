import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, idempotencyKey, prepareCart, type Harness, type Seed } from '../helpers/harness';

let h: Harness;
let seed: Seed;
beforeAll(async () => {
  h = await bootstrap();
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.reset();
  seed = await h.seed();
});

const variant = (sku: string, size: string, price: number, stock: number) => ({ sku, optionValues: { size, color: 'sand' }, price, stock });

async function createProduct(over: Record<string, unknown> = {}) {
  const admin = await h.admin();
  return h
    .http()
    .post('/api/admin/products')
    .set(h.api.authed(admin.token))
    .send({
      title: { ar: 'قميص كتان', en: 'Linen Shirt' },
      categoryId: seed.menId,
      brandId: seed.brandId,
      images: [{ url: 'https://images.example.com/shirt.jpg' }],
      options: [{ key: 'size', values: ['S', 'L'] }, { key: 'color', values: ['sand'] }],
      variants: [variant('SHIRT-S', 'S', 89_900, 4), variant('SHIRT-L', 'L', 89_900, 0)],
      status: 'published',
      ...over,
    });
}

describe('dynamic categories: product forms are validated against the category definition', () => {
  it('accepts a valid product and denormalises category path + facets', async () => {
    const res = await createProduct();
    expect(res.status).toBe(201);
    const product = await h.models.ProductModel.findById(res.body.product._id).lean();
    expect(product!.categoryPath.map(String)).toEqual([seed.fashionId, seed.menId]); // "all of Fashion" = one indexed query
    expect(product!.filterAttrs).toEqual(expect.arrayContaining([{ k: 'size', v: 'S' }, { k: 'size', v: 'L' }, { k: 'color', v: 'sand' }]));
    expect(product!.slug).toBe('linen-shirt');
  });

  it('a single-variant product (no options) keeps an empty optionValues instead of losing the field', async () => {
    // Regression: Mongoose's `minimize` dropped the empty object, clients got `undefined` and the admin edit form crashed.
    const created = await createProduct({ options: [], variants: [{ sku: 'PLAIN-1', optionValues: {}, price: 25_000, stock: 3 }] });
    expect(created.status).toBe(201);

    const admin = await h.admin();
    const read = await h.http().get(`/api/admin/products/${created.body.product._id}`).set(h.api.authed(admin.token));
    expect(read.status).toBe(200);
    expect(read.body.product.variants[0].optionValues).toEqual({});

    // …and it survives an edit (the update goes through an aggregation pipeline, a different write path).
    const updated = await h
      .http()
      .put(`/api/admin/products/${created.body.product._id}`)
      .set(h.api.authed(admin.token))
      .send({ title: { ar: 'عادي', en: 'Plain tee' }, categoryId: seed.menId, options: [], variants: [{ sku: 'PLAIN-1', optionValues: {}, price: 26_000, stock: 3 }], status: 'draft' });
    expect(updated.status).toBe(200);
    expect(updated.body.product.variants[0]).toMatchObject({ optionValues: {}, price: 26_000 });
  });

  it('rejects options/values the category does not allow, with field-level errors', async () => {
    const res = await createProduct({ options: [{ key: 'size', values: ['XXXL'] }, { key: 'color', values: ['sand'] }], variants: [variant('S1', 'XXXL', 1000, 1)] });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0]).toMatchObject({ path: expect.stringContaining('options.0.values') });
  });

  it('a brand-new category with brand-new attributes needs no code change', async () => {
    const admin = await h.admin();
    const cat = await h.http().post('/api/admin/categories').set(h.api.authed(admin.token)).send({
      name: { ar: 'جمال', en: 'Beauty' },
      attributes: [{ key: 'skin_type', label: { ar: 'نوع البشرة', en: 'Skin type' }, values: [{ value: 'dry' }, { value: 'oily' }], filterable: true, variantOption: true }],
    });
    expect(cat.status).toBe(201);

    const product = await h.http().post('/api/admin/products').set(h.api.authed(admin.token)).send({
      title: { ar: 'كريم مرطب', en: 'Moisturiser' },
      categoryId: cat.body.category._id,
      options: [{ key: 'skin_type', values: ['dry', 'oily'] }],
      variants: [{ sku: 'MOIST-D', optionValues: { skin_type: 'dry' }, price: 25_000, stock: 5 }, { sku: 'MOIST-O', optionValues: { skin_type: 'oily' }, price: 25_000, stock: 5 }],
      status: 'published',
    });
    expect(product.status).toBe(201);

    const list = await h.http().get('/api/products?category=beauty');
    expect(list.body.facets.attributes[0]).toMatchObject({ key: 'skin_type', values: [{ value: 'dry', count: 1 }, { value: 'oily', count: 1 }] });
  });

  it('limits nesting to 3 levels', async () => {
    const admin = await h.admin();
    const post = (parentId: string, en: string) =>
      h.http().post('/api/admin/categories').set(h.api.authed(admin.token)).send({ name: { ar: en, en }, parentId });
    const l3 = await post(seed.menId, 'Tees'); // fashion(1) → men(2) → tees(3)
    expect(l3.status).toBe(201);
    expect((await post(l3.body.category._id, 'TooDeep')).status).toBe(422);
  });

  it('PATCH never resets fields that were not sent (defaults only apply on create)', async () => {
    const admin = await h.admin();
    const before = await h.models.CategoryModel.findById(seed.fashionId).lean();
    await h.http().patch(`/api/admin/categories/${seed.fashionId}`).set(h.api.authed(admin.token)).send({ sortOrder: 7 }).expect(200);
    const after = await h.models.CategoryModel.findById(seed.fashionId).lean();
    expect(after!.sortOrder).toBe(7);
    expect(after!.attributes).toHaveLength(before!.attributes.length);
    expect(after!.isActive).toBe(true);
  });

  it('exposes a nested category tree and per-category inherited attribute definitions', async () => {
    const tree = await h.http().get('/api/categories');
    expect(tree.body.items[0]).toMatchObject({ slug: 'fashion', children: [expect.objectContaining({ slug: 'men' })] });
    const men = await h.http().get('/api/categories/men');
    expect(men.body.attributes.map((a: { key: string }) => a.key).sort()).toEqual(['color', 'size']); // inherited from Fashion
    expect(men.body.breadcrumbs.map((b: { slug: string }) => b.slug)).toEqual(['fashion', 'men']);
  });
});

describe('listing, filters, facets, sorting and search', () => {
  beforeEach(async () => {
    await createProduct();
    await createProduct({ title: { ar: 'بنطلون جينز', en: 'Denim Jeans' }, options: [{ key: 'size', values: ['M'] }, { key: 'color', values: ['black'] }], variants: [{ sku: 'JEANS-M', optionValues: { size: 'M', color: 'black' }, price: 129_900, stock: 7 }] });
  });

  it('lists published products under a parent category including sub-categories', async () => {
    const res = await h.http().get('/api/products?category=fashion');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3); // tee + shirt + jeans
    expect(res.body.items[0]).toEqual(expect.objectContaining({ id: expect.any(String), slug: expect.any(String), minPrice: expect.any(Number), inStock: expect.any(Boolean) }));
  });

  it('hides drafts from the public API', async () => {
    await createProduct({ title: { ar: 'مسودة', en: 'Secret Draft' }, status: 'draft', variants: [variant('DRAFT-1', 'S', 100, 1)] });
    const res = await h.http().get('/api/products?q=secret');
    expect(res.body.total).toBe(0);
    expect((await h.http().get('/api/products/secret-draft')).status).toBe(404);
  });

  it('filters by attribute and returns facet counts that exclude the active attribute filter', async () => {
    const res = await h.http().get('/api/products?category=fashion&attr=size:S');
    // Tee (S,M) and Shirt (S,L) have size S
    expect(res.body.items.map((i: { slug: string }) => i.slug).sort()).toEqual(['cotton-tee', 'linen-shirt']);
    const size = res.body.facets.attributes.find((a: { key: string }) => a.key === 'size');
    const counts = Object.fromEntries(size.values.map((v: { value: string; count: number }) => [v.value, v.count]));
    expect(counts).toMatchObject({ S: 2, M: 2, L: 1 }); // sibling values stay visible with their counts
  });

  it('filters by brand, price range, availability and sorts', async () => {
    expect((await h.http().get('/api/products?category=fashion&brand=atelier')).body.items.length).toBeGreaterThan(0);
    const cheap = await h.http().get('/api/products?category=fashion&maxPrice=60000&sort=price_asc');
    expect(cheap.body.items.map((i: { slug: string }) => i.slug)).toEqual(['cotton-tee']);
    const sorted = await h.http().get('/api/products?category=fashion&sort=price_desc');
    expect(sorted.body.items.map((i: { minPrice: number }) => i.minPrice)).toEqual([129_900, 89_900, 49_900]);
    expect(sorted.body.facets.price).toEqual({ min: 49_900, max: 129_900 });
  });

  it('paginates', async () => {
    const page = await h.http().get('/api/products?category=fashion&limit=2&page=2');
    expect(page.body).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(page.body.items).toHaveLength(1);
  });

  it('searches Arabic and English, tolerant of letter variants, with type-ahead suggestions', async () => {
    expect((await h.http().get('/api/products?q=denim')).body.total).toBe(1);
    expect((await h.http().get(`/api/products?q=${encodeURIComponent('بنطلون')}`)).body.total).toBe(1);
    expect((await h.http().get(`/api/products?q=${encodeURIComponent('قميص')}`)).body.total).toBe(1);
    expect((await h.http().get(`/api/products?q=${encodeURIComponent('كتان')}`)).body.total).toBe(1);

    const suggest = await h.http().get('/api/products/suggest?q=den');
    expect(suggest.body.items.map((i: { slug: string }) => i.slug)).toEqual(['denim-jeans']);
    expect((await h.http().get('/api/products?q=zzzz')).body.total).toBe(0);
  });

  it('returns a product page payload with breadcrumbs, option definitions and related products', async () => {
    const res = await h.http().get('/api/products/linen-shirt');
    expect(res.status).toBe(200);
    expect(res.body.product.variants).toHaveLength(2);
    expect(res.body.breadcrumbs.map((b: { slug: string }) => b.slug)).toEqual(['fashion', 'men']);
    expect(res.body.attributes.map((a: { key: string }) => a.key).sort()).toEqual(['color', 'size']);
    expect(res.body.related.length).toBeGreaterThan(0);
    expect(res.body.product.searchKeywords).toBeUndefined();
  });
});

describe('admin product edits never clobber live stock', () => {
  it('keeps the CURRENT stock of existing SKUs when the form is saved with a stale stock value', async () => {
    const created = await createProduct();
    const id = created.body.product._id as string;

    // a customer buys 2 units of SHIRT-S (stock 4 → 2) while the admin has the edit form open
    const s = await h.signUp();
    const addressId = await prepareCart(h, s, [{ sku: 'SHIRT-S', qty: 2 }]);
    await h.http().post('/api/orders').set(h.api.authed(s.token)).set('Idempotency-Key', idempotencyKey()).send({ addressId, paymentMethod: 'cod' }).expect(201);

    // the admin saves the form (it still says stock 4), changes the price and adds a variant
    const admin = await h.admin();
    const res = await h.http().put(`/api/admin/products/${id}`).set(h.api.authed(admin.token)).send({
      title: { ar: 'قميص كتان', en: 'Linen Shirt' },
      categoryId: seed.menId,
      images: [{ url: 'https://images.example.com/shirt.jpg' }],
      options: [{ key: 'size', values: ['S', 'L', 'M'] }, { key: 'color', values: ['sand'] }],
      variants: [variant('SHIRT-S', 'S', 79_900, 4), variant('SHIRT-L', 'L', 79_900, 0), variant('SHIRT-M', 'M', 79_900, 12)],
      status: 'published',
    });
    expect(res.status).toBe(200);

    const product = await h.models.ProductModel.findById(id).lean();
    const byS = Object.fromEntries(product!.variants.map((v) => [v.sku, v]));
    expect(byS['SHIRT-S']!.stock).toBe(2); // NOT resurrected to 4
    expect(byS['SHIRT-S']!.price).toBe(79_900); // price change applied
    expect(byS['SHIRT-M']!.stock).toBe(12); // new SKU takes its initial stock
    expect(product!.minPrice).toBe(79_900);
  });

  it('manual stock adjustments need a reason, are logged and can never go negative', async () => {
    await createProduct();
    const admin = await h.admin();
    const adjust = (delta: number, note = 'Recount after stocktake') =>
      h.http().post('/api/admin/inventory/adjust').set(h.api.authed(admin.token)).send({ sku: 'SHIRT-S', delta, note });

    expect((await adjust(6)).body.stock).toBe(10);
    expect((await adjust(-3)).body.stock).toBe(7);
    expect((await adjust(-50)).status).toBe(409);
    expect((await adjust(1, 'x')).status).toBe(422); // reason too short

    const logs = await h.http().get('/api/admin/inventory/logs?sku=SHIRT-S').set(h.api.authed(admin.token));
    expect(logs.body.items.map((l: { delta: number }) => l.delta)).toEqual([-3, 6]);
  });
});

describe('cart', () => {
  it('prices guest carts on the server and flags unavailable items', async () => {
    const res = await h.http().post('/api/cart/preview').send({ items: [{ sku: 'TEE-M-BLK', qty: 2 }, { sku: 'NOPE-1', qty: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.cart.subtotal).toBe(105_800);
    expect(res.body.cart.items[1].warnings).toEqual(['UNAVAILABLE']);
    expect(res.body.cart.hasBlockingIssues).toBe(true);
  });

  it('never lets quantity exceed stock', async () => {
    const s = await h.signUp();
    const res = await h.http().post('/api/cart/items').set(h.api.authed(s.token)).send({ sku: 'TEE-S-BLK', qty: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_STOCK', details: { available: 1 } });
  });

  it('merges the guest cart into the account cart on sign-in, clamping to stock', async () => {
    const s = await h.signUp();
    await h.http().post('/api/cart/items').set(h.api.authed(s.token)).send({ sku: 'TEE-M-BLK', qty: 4 });
    const merged = await h.http().post('/api/cart/merge').set(h.api.authed(s.token)).send({ items: [{ sku: 'TEE-M-BLK', qty: 9 }, { sku: 'TEE-S-BLK', qty: 1 }] });
    const bySku = Object.fromEntries(merged.body.cart.items.map((i: { sku: string; qty: number }) => [i.sku, i.qty]));
    expect(bySku).toEqual({ 'TEE-M-BLK': 10, 'TEE-S-BLK': 1 }); // 4 + 9 clamped to the stock of 10
  });

  it('warns when a price changed after the item was added', async () => {
    const s = await h.signUp();
    await h.http().post('/api/cart/items').set(h.api.authed(s.token)).send({ sku: 'TEE-M-BLK', qty: 1 });
    await h.models.ProductModel.updateOne({ 'variants.sku': 'TEE-M-BLK' }, { $set: { 'variants.$.price': 59_900 } });
    const cart = await h.http().get('/api/cart').set(h.api.authed(s.token));
    expect(cart.body.cart.items[0]).toMatchObject({ unitPrice: 59_900, previousPrice: 52_900, warnings: ['PRICE_CHANGED'] });
    const ack = await h.http().post('/api/cart/acknowledge-prices').set(h.api.authed(s.token));
    expect(ack.body.cart.items[0].warnings).toEqual([]);
  });
});

describe('platform', () => {
  it('serves health, OpenAPI JSON, security headers and a request id', async () => {
    const health = await h.http().get('/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ status: 'ok', db: 'up' });
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['x-powered-by']).toBeUndefined();

    const spec = await h.http().get('/api/docs/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(Object.keys(spec.body.paths)).toEqual(expect.arrayContaining(['/api/orders', '/api/auth/login', '/api/payments/webhooks/{provider}']));

    const notFound = await h.http().get('/api/nope');
    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) });
    expect(notFound.headers['x-request-id']).toBe(notFound.body.error.requestId);
  });
});
