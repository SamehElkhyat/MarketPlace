import bcrypt from 'bcryptjs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import supertest from 'supertest';

export interface Harness {
  /** supertest entry point for the Express app. */
  http: () => supertest.Agent;
  api: ReturnType<typeof createApi>;
  models: Awaited<ReturnType<typeof loadModels>>;
  /** E-mails captured by the in-memory transport. */
  outbox: () => { to: string; subject: string; html: string; text: string }[];
  /** Create + sign in a customer; returns bearer token + refresh cookie. */
  signUp: (name?: string) => Promise<Session>;
  /** Sign in as an admin (created directly in the DB). */
  admin: () => Promise<Session>;
  seed: () => Promise<Seed>;
  reset: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface Session {
  email: string;
  token: string;
  cookie: string;
  userId: string;
}

export interface Seed {
  fashionId: string;
  menId: string;
  brandId: string;
  /** Published tee with a stock-1 variant (TEE-S-BLK) and a stock-10 variant (TEE-M-BLK). */
  teeId: string;
}

async function loadModels() {
  const [{ UserModel }, { ProductModel }, { OrderModel }, { InventoryLogModel }, { CouponModel }, { ShippingZoneModel }, { CategoryModel }, { BrandModel }, { PaymentModel }, { PaymentEventModel }, { SessionModel }] =
    await Promise.all([
      import('../../models/User'),
      import('../../models/Product'),
      import('../../models/Order'),
      import('../../models/InventoryLog'),
      import('../../models/Coupon'),
      import('../../models/ShippingZone'),
      import('../../models/Category'),
      import('../../models/Brand'),
      import('../../models/Payment'),
      import('../../models/PaymentEvent'),
      import('../../models/Session'),
    ]);
  return { UserModel, ProductModel, OrderModel, InventoryLogModel, CouponModel, ShippingZoneModel, CategoryModel, BrandModel, PaymentEventModel, PaymentModel, SessionModel };
}

const cookieFrom = (res: supertest.Response): string => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((c) => c.split(';')[0]).find((c) => c?.startsWith('rt=')) ?? '';
};

function createApi(http: () => supertest.Agent) {
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });
  return { authed, cookieFrom, http };
}

/**
 * Boots the REAL app against an in-memory MongoDB *replica set* (required for multi-document
 * transactions). Source modules are imported dynamically because `env` is read at import time.
 */
export async function bootstrap(envOverrides: Record<string, string> = {}): Promise<Harness> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env['MONGODB_URI'] = replSet.getUri('marketplace_test');
  Object.assign(process.env, envOverrides);

  const { createApp } = await import('../../app');
  const { connectDb, disconnectDb } = await import('../../config/db');
  const { resetRateLimits } = await import('../../middleware/rateLimit.middleware');
  const { emailTransport } = await import('../../services/email/emailTransport');
  const { categoryService } = await import('../../services/category.service');
  const { productService } = await import('../../services/product.service');

  await connectDb();
  const models = await loadModels();
  await Promise.all(Object.values(models).map((m) => m.init())); // build indexes (unique SKU, idempotency key…)

  const app = createApp();
  const http = () => supertest.agent(app);
  const api = createApi(http);
  let counter = 0;

  const signUp: Harness['signUp'] = async (name = 'Test Customer') => {
    counter += 1;
    const email = `customer${counter}-${Date.now()}@example.com`;
    const res = await http().post('/api/auth/register').send({ name, email, password: 'Passw0rd!x', locale: 'en' });
    if (res.status !== 201) throw new Error(`signUp failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { email, token: res.body.accessToken as string, cookie: cookieFrom(res), userId: res.body.user.id as string };
  };

  const admin: Harness['admin'] = async () => {
    const email = 'admin@example.com';
    await models.UserModel.updateOne(
      { email },
      { $set: { name: 'Admin', passwordHash: await bcrypt.hash('AdminPass1', 4), role: 'admin', emailVerified: true, status: 'active' } },
      { upsert: true },
    );
    const res = await http().post('/api/auth/login').send({ email, password: 'AdminPass1' });
    if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
    return { email, token: res.body.accessToken as string, cookie: cookieFrom(res), userId: res.body.user.id as string };
  };

  const seed: Harness['seed'] = async () => {
    await models.ShippingZoneModel.insertMany([
      { governorate: 'cairo', fee: 5000, estimatedDays: { min: 1, max: 2 } },
      { governorate: 'giza', fee: 5000, estimatedDays: { min: 1, max: 3 } },
    ]);
    const attrs = (key: string, label: string, values: string[]) => ({
      key,
      label: { ar: label, en: label },
      type: 'select' as const,
      values: values.map((value) => ({ value })),
      filterable: true,
      variantOption: true,
    });
    const fashion = await categoryService.create({
      name: { ar: 'موضة', en: 'Fashion' },
      parentId: null,
      sortOrder: 0,
      isActive: true,
      attributes: [attrs('size', 'Size', ['S', 'M', 'L']), attrs('color', 'Color', ['black', 'sand'])],
    });
    const men = await categoryService.create({ name: { ar: 'رجالي', en: 'Men' }, parentId: fashion.id as string, sortOrder: 0, isActive: true, attributes: [] });
    const brand = await models.BrandModel.create({ name: 'Atelier', slug: 'atelier' });
    const tee = await productService.create({
      title: { ar: 'تيشيرت قطن', en: 'Cotton Tee' },
      description: { ar: '', en: '' },
      categoryId: men.id as string,
      brandId: brand.id as string,
      images: [{ url: 'https://images.example.com/tee.jpg' }],
      specs: {},
      options: [
        { key: 'size', values: ['S', 'M'] },
        { key: 'color', values: ['black'] },
      ],
      variants: [
        { sku: 'TEE-S-BLK', optionValues: { size: 'S', color: 'black' }, price: 49_900, stock: 1 },
        { sku: 'TEE-M-BLK', optionValues: { size: 'M', color: 'black' }, price: 52_900, stock: 10 },
      ],
      tags: [],
      status: 'published',
    });
    return { fashionId: fashion.id as string, menId: men.id as string, brandId: brand.id as string, teeId: tee.id as string };
  };

  const reset: Harness['reset'] = async () => {
    const db = (await import('mongoose')).default.connection;
    await Promise.all((await db.db!.collections()).map((c) => c.deleteMany({})));
    resetRateLimits();
    (emailTransport as unknown as { outbox: unknown[] }).outbox.length = 0;
  };

  return {
    http,
    api,
    models,
    outbox: () => (emailTransport as unknown as { outbox: { to: string; subject: string; html: string; text: string }[] }).outbox,
    signUp,
    admin,
    seed,
    reset,
    stop: async () => {
      await disconnectDb();
      await replSet.stop();
    },
  };
}

/** Adds a saved address and `qty` of `sku` to a customer's cart; returns the address id. */
export async function prepareCart(h: Harness, session: Session, items: { sku: string; qty: number }[], governorate = 'cairo'): Promise<string> {
  const a = h.api.authed(session.token);
  const addr = await h
    .http()
    .post('/api/users/me/addresses')
    .set(a)
    .send({ fullName: 'Test Customer', phone: '01012345678', governorate, city: 'Nasr City', street: '12 Street' });
  if (addr.status !== 201) throw new Error(`address failed: ${JSON.stringify(addr.body)}`);
  for (const item of items) {
    const res = await h.http().post('/api/cart/items').set(a).send(item);
    if (res.status !== 201) throw new Error(`cart add failed: ${JSON.stringify(res.body)}`);
  }
  return (addr.body.addresses[0]._id as string) ?? '';
}

let keyCounter = 0;
export const idempotencyKey = () => `test-key-${Date.now()}-${++keyCounter}`;
