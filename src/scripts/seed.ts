import bcrypt from 'bcryptjs';
import mongoose, { type Types } from 'mongoose';
import { env } from '../config/env';
import { connectDb, disconnectDb } from '../lib/db';
import { BrandModel } from '../modules/brands/brand.model';
import { CategoryModel, type AttributeDef } from '../modules/categories/category.model';
import { categoryService } from '../modules/categories/category.service';
import { CollectionModel } from '../modules/collections/collection.model';
import { CouponModel } from '../modules/coupons/coupon.model';
import { OrderModel } from '../modules/orders/order.model';
import { formatOrderNumber } from '../modules/orders/checkout.service';
import { ensureSequenceAtLeast } from '../modules/orders/counter.model';
import { ProductModel } from '../modules/products/product.model';
import { productService } from '../modules/products/product.service';
import { ReviewModel } from '../modules/reviews/review.model';
import { ShippingZoneModel } from '../modules/shipping/shipping-zone.model';
import { UserModel } from '../modules/users/user.model';
import { BRANDS, CATEGORIES, GOVERNORATE_FEES, PRODUCTS, type AttrSeed, type CategorySeed } from './seed-data';

const args = new Set(process.argv.slice(2));
const piasters = (egp: number) => Math.round(egp * 100);
const image = (slug: string, n: number) => `https://picsum.photos/seed/${slug}-${n}/800/1000?grayscale`; // 4:5, deterministic, one monochrome style

// Deterministic pseudo-random so every seed run produces the same demo store.
let state = 42;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;

const toAttr = (a: AttrSeed): AttributeDef => ({
  key: a.key,
  label: { ar: a.ar, en: a.en },
  type: a.values.some((v) => v.swatch) ? 'color' : 'select',
  values: a.values.map((v) => ({ value: v.value, ...(v.ar ? { label: { ar: v.ar, en: v.en ?? v.value } } : {}), ...(v.swatch ? { swatch: v.swatch } : {}) })),
  filterable: a.filterable ?? false,
  variantOption: a.variantOption ?? false,
});

async function createCategories(nodes: CategorySeed[], parentId: string | null, bySlug: Map<string, string>) {
  for (const [index, node] of nodes.entries()) {
    const created = await categoryService.create({
      name: { ar: node.ar, en: node.en },
      slug: node.slug,
      parentId,
      ...(parentId === null ? { image: image('category-' + node.slug, 1) } : {}),
      sortOrder: index,
      isActive: true,
      attributes: (node.attributes ?? []).map(toAttr),
    });
    bySlug.set(node.slug, created.id as string);
    if (node.children) await createCategories(node.children, created.id as string, bySlug);
  }
}

const cartesian = (options: Record<string, string[]>): Record<string, string>[] =>
  Object.entries(options).reduce<Record<string, string>[]>(
    (acc, [key, values]) => acc.flatMap((combo) => values.map((value) => ({ ...combo, [key]: value }))),
    [{}],
  );

async function main() {
  if (env.NODE_ENV === 'production' && !args.has('--allow-production')) {
    throw new Error('Refusing to seed with NODE_ENV=production (pass --allow-production if you really mean it).');
  }
  await connectDb();

  if (await CategoryModel.exists({})) {
    if (!args.has('--reset')) throw new Error('Database already has data. Re-run with --reset to wipe and re-seed.');
    console.log('→ wiping all collections…');
    await Promise.all((await mongoose.connection.db!.collections()).map((c) => c.deleteMany({})));
  }
  await Promise.all([CategoryModel.init(), ProductModel.init(), OrderModel.init(), UserModel.init(), CouponModel.init()]);

  // ── accounts ───────────────────────────────────────────────────────────────
  const adminEmail = process.env['ADMIN_EMAIL'] ?? 'admin@atelier.test';
  const adminPassword = process.env['ADMIN_PASSWORD'] ?? 'Admin#12345';
  const demoPassword = process.env['DEMO_PASSWORD'] ?? 'Demo#12345';
  const hash = (p: string) => bcrypt.hash(p, env.BCRYPT_COST);

  await UserModel.create([
    { name: 'Store Admin', email: adminEmail, passwordHash: await hash(adminPassword), role: 'admin', emailVerified: true },
    { name: 'Demo Reviewer', email: 'demo@atelier.test', passwordHash: await hash(demoPassword), role: 'demo_admin', emailVerified: true, locale: 'en' },
  ]);
  const customers = await UserModel.create(
    await Promise.all(
      ['Sara Ahmed', 'Omar Hassan', 'Mona Ali', 'Youssef Khaled', 'Nour Ibrahim', 'Hana Mostafa', 'Karim Adel', 'Laila Samir'].map(async (name, i) => ({
        name,
        email: i === 0 ? 'customer@atelier.test' : `${name.split(' ')[0]!.toLowerCase()}@example.com`,
        passwordHash: await hash(demoPassword),
        emailVerified: true,
        locale: i % 2 === 0 ? ('ar' as const) : ('en' as const),
        addresses: [
          { fullName: name, phone: `0100000${1000 + i}`, governorate: pick(['cairo', 'giza', 'alexandria']), city: 'Downtown', street: `${10 + i} Tahrir St.`, isDefault: true },
        ],
      })),
    ),
  );

  // ── shipping ───────────────────────────────────────────────────────────────
  await ShippingZoneModel.insertMany(
    Object.entries(GOVERNORATE_FEES).map(([governorate, z]) => ({ governorate, fee: piasters(z.fee), estimatedDays: { min: z.min, max: z.max } })),
  );

  // ── catalogue ──────────────────────────────────────────────────────────────
  const categoryIds = new Map<string, string>();
  await createCategories(CATEGORIES, null, categoryIds);

  const brandIds = new Map<string, string>();
  for (const b of BRANDS) {
    const brand = await BrandModel.create({ name: b.name, slug: b.slug, description: { ar: b.ar, en: b.en }, logo: image(`logo-${b.slug}`, 1) });
    brandIds.set(b.slug, brand.id as string);
  }

  const productIds: Types.ObjectId[] = [];
  for (const [index, p] of PRODUCTS.entries()) {
    const slugBase = p.en.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const firstKey = Object.keys(p.options)[0]!;
    const combos = cartesian(p.options);
    const created = await productService.create({
      title: { ar: p.ar, en: p.en },
      description: { ar: p.descAr, en: p.descEn },
      categoryId: categoryIds.get(p.category)!,
      brandId: brandIds.get(p.brand)!,
      images: [1, 2, 3].map((n) => ({ url: image(slugBase, n), alt: p.en })),
      specs: p.specs ?? {},
      options: Object.entries(p.options).map(([key, values]) => ({ key, values })),
      variants: combos.map((optionValues) => {
        const step = (p.options[firstKey]!.indexOf(optionValues[firstKey]!) * (p.step ?? 0));
        const price = piasters(p.price + step);
        const sku = `${slugBase.slice(0, 12).toUpperCase().replace(/-+$/, '')}-${Object.values(optionValues).join('-').toUpperCase()}`.replace(/[^A-Z0-9-]/g, '');
        return {
          sku,
          optionValues,
          price,
          ...(p.sale ? { compareAtPrice: Math.round(price * p.sale) } : {}),
          // a few variants are deliberately low / out of stock so the UI states are visible
          stock: index % 7 === 0 && combos.indexOf(optionValues) === 0 ? 0 : (p.stock ?? 8) + Math.floor(rand() * 5),
        };
      }),
      tags: p.tags ?? [],
      status: 'published',
    });
    productIds.push(created._id);
  }

  // ── collections ────────────────────────────────────────────────────────────
  const published = await ProductModel.find().sort({ createdAt: -1 }).lean();
  const onSale = published.filter((p) => p.variants.some((v) => v.compareAtPrice)).map((p) => p._id);
  await CollectionModel.create([
    { title: { ar: 'وصل حديثاً', en: 'New Arrivals' }, slug: 'new-arrivals', description: { ar: 'أحدث ما وصل إلينا', en: 'The latest pieces, just in.' }, image: image('collection-new', 1), productIds: published.slice(0, 12).map((p) => p._id), sortOrder: 0 },
    { title: { ar: 'الأكثر مبيعاً', en: 'Best Sellers' }, slug: 'best-sellers', description: { ar: 'اختيارات عملائنا المفضلة', en: 'The pieces our customers keep coming back for.' }, image: image('collection-best', 1), productIds: published.filter((_, i) => i % 3 === 0).map((p) => p._id), sortOrder: 1 },
    { title: { ar: 'عروض', en: 'Offers' }, slug: 'offers', description: { ar: 'خصومات محدودة', en: 'Limited-time reductions.' }, image: image('collection-offers', 1), productIds: onSale, sortOrder: 2 },
  ]);

  await CouponModel.create([
    { code: 'WELCOME10', type: 'percent', value: 10, minOrder: piasters(500), maxDiscount: piasters(300) },
    { code: 'SAVE100', type: 'fixed', value: piasters(100), minOrder: piasters(1000) },
    { code: 'SUMMER25', type: 'percent', value: 25, minOrder: piasters(1500), maxUses: 50, expiresAt: new Date(Date.now() + 90 * 86_400_000) },
  ]);

  // ── historical orders & reviews (so the dashboard has something to show) ────────────────────
  const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'processing', 'confirmed', 'pending_confirmation', 'cancelled'] as const;
  const orderDocs = [];
  for (let i = 0; i < 70; i++) {
    const customer = pick(customers);
    const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => {
      const product = pick(published);
      const variant = pick(product.variants);
      const qty = 1 + Math.floor(rand() * 2);
      return { product, variant, qty };
    });
    const items = lines.map(({ product, variant, qty }) => ({
      productId: product._id, sku: variant.sku, title: product.title, ...(product.images[0] ? { image: product.images[0].url } : {}),
      optionValues: variant.optionValues, unitPrice: variant.price, qty, lineTotal: variant.price * qty,
    }));
    const subtotal = items.reduce((s, x) => s + x.lineTotal, 0);
    const status = pick(statuses);
    const createdAt = new Date(Date.now() - Math.floor(rand() * 29 * 86_400_000) - Math.floor(rand() * 86_400_000));
    const address = customer.addresses[0]!;
    orderDocs.push({
      orderNumber: formatOrderNumber(i + 1), userId: customer._id, customerName: customer.name, customerEmail: customer.email, items,
      shippingAddress: { fullName: address.fullName, phone: address.phone, governorate: address.governorate, city: address.city, street: address.street },
      subtotal, shippingFee: 5000, discount: 0, total: subtotal + 5000, paymentMethod: 'cod' as const,
      paymentStatus: status === 'delivered' ? ('paid' as const) : ('unpaid' as const), status,
      statusHistory: [{ status: 'pending_confirmation' as const, at: createdAt, actor: 'customer' as const }, ...(status === 'pending_confirmation' ? [] : [{ status, at: new Date(createdAt.getTime() + 3_600_000), actor: 'admin' as const }])],
      idempotencyKey: `seed-${i}`, createdAt, updatedAt: createdAt,
    });
  }
  await OrderModel.insertMany(orderDocs, { timestamps: false });
  // New orders must continue AFTER the seeded numbers instead of colliding with ORD-100001.
  await ensureSequenceAtLeast('order', orderDocs.length);

  const delivered = orderDocs.filter((o) => o.status === 'delivered');
  const reviewed = new Set<string>();
  const comments = ['Beautifully made, exactly as pictured.', 'Great quality for the price. Fast delivery too.', 'Fits perfectly and feels premium.', 'Lovely detail. Would buy again.', 'Packaging was lovely and it arrived early.'];
  for (const order of delivered) {
    const item = order.items[0]!;
    const key = `${item.productId}-${order.userId}`;
    if (reviewed.has(key) || rand() < 0.35) continue;
    reviewed.add(key);
    await ReviewModel.create({ productId: item.productId, userId: order.userId, rating: 3 + Math.floor(rand() * 3), comment: pick(comments), verifiedPurchase: true });
  }
  const ratings = await ReviewModel.aggregate<{ _id: Types.ObjectId; avg: number; count: number }>([{ $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }]);
  await Promise.all(ratings.map((r) => ProductModel.updateOne({ _id: r._id }, { $set: { ratingAvg: Math.round(r.avg * 10) / 10, ratingCount: r.count } })));

  console.log(`
✔ Seeded ${CATEGORIES.length} root categories, ${BRANDS.length} brands, ${PRODUCTS.length} products, ${orderDocs.length} orders.

  Admin    ${adminEmail} / ${adminPassword}
  Reviewer ${'demo@atelier.test'} / ${demoPassword}   (read-only back office)
  Customer customer@atelier.test / ${demoPassword}
  Coupons  WELCOME10 · SAVE100 · SUMMER25
`);
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
