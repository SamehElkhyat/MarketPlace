import { Router } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate, currentUserId, requireRole } from '../../http/middleware/authenticate';
import { validate, validated } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { escapeRegex } from '../../lib/text';
import { idParams, paginationQuery, toPage } from '../../lib/schemas';
import { brandAdminRouter } from '../brands/brand.routes';
import { categoryAdminRouter } from '../categories/category.routes';
import { collectionAdminRouter } from '../collections/collection.routes';
import { couponAdminRouter } from '../coupons/coupon.routes';
import { inventoryService } from '../inventory/inventory.service';
import { InventoryLogModel } from '../inventory/inventory.models';
import { toOrderDto } from '../orders/order.dto';
import { OrderModel, type OrderAttrs } from '../orders/order.model';
import { ORDER_STATUSES } from '../orders/order-state-machine';
import { transitionOrder } from '../orders/order.transitions';
import { productAdminRouter } from '../products/product.routes';
import { skuSchema } from '../products/product.schemas';
import { importProducts } from '../products/product.import';
import { SessionModel } from '../auth/auth.models';
import { shippingAdminRouter } from '../shipping/shipping.routes';
import { UserModel } from '../users/user.model';
import { AuditLogModel } from './audit-log.model';
import { recordAudit } from './audit.service';
import { dashboardService } from './dashboard.service';

export const adminRouter = Router();

// Every admin endpoint requires a valid token AND the admin role — enforced here, server-side.
adminRouter.use(authenticate, requireRole('admin', 'demo_admin'));
// The demo account can look at everything but change nothing.
adminRouter.use((req, _res, next) => {
  if (req.auth?.role === 'demo_admin' && !['GET', 'HEAD'].includes(req.method)) {
    throw AppError.forbidden('This is a read-only demo account');
  }
  next();
});

adminRouter.get('/dashboard', async (_req, res) => {
  res.json(await dashboardService.overview());
});

adminRouter.use('/products', productAdminRouter);
adminRouter.use('/categories', categoryAdminRouter);
adminRouter.use('/brands', brandAdminRouter);
adminRouter.use('/collections', collectionAdminRouter);
adminRouter.use('/coupons', couponAdminRouter);
adminRouter.use('/shipping-zones', shippingAdminRouter);

// ── orders ───────────────────────────────────────────────────────────────────
const orderListSchemas = {
  query: paginationQuery.extend({
    status: z.enum(ORDER_STATUSES).optional(),
    q: z.string().trim().max(80).optional(),
    paymentMethod: z.enum(['cod', 'card', 'wallet', 'fawry']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};
const orderIdSchemas = { params: idParams };
const transitionSchemas = {
  params: idParams,
  body: z.object({ to: z.enum(ORDER_STATUSES), note: z.string().trim().max(500).optional() }),
};
const newOrdersSchemas = { query: z.object({ since: z.coerce.date().optional() }) };

adminRouter.get('/orders', validate(orderListSchemas), async (req, res) => {
  const { query } = validated<typeof orderListSchemas>(req);
  const filter: Record<string, unknown> = {};
  if (query.status) filter['status'] = query.status;
  if (query.paymentMethod) filter['paymentMethod'] = query.paymentMethod;
  if (query.from || query.to) filter['createdAt'] = { ...(query.from && { $gte: query.from }), ...(query.to && { $lte: query.to }) };
  if (query.q) {
    const prefix = new RegExp(`^${escapeRegex(query.q)}`, 'i');
    filter['$or'] = [{ orderNumber: prefix }, { customerEmail: prefix }, { 'shippingAddress.phone': prefix }];
  }
  const [items, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    OrderModel.countDocuments(filter),
  ]);
  res.json(toPage(items.map((o) => toOrderDto(o as OrderAttrs & { _id: unknown }, 'admin', { includeCustomer: true })), total, query));
});

/** Lightweight endpoint the dashboard polls every 30 s (Vercel Functions have no WebSockets). */
adminRouter.get('/orders/new-count', validate(newOrdersSchemas), async (req, res) => {
  const { query } = validated<typeof newOrdersSchemas>(req);
  const [pending, since] = await Promise.all([
    OrderModel.countDocuments({ status: { $in: ['pending_confirmation', 'paid'] } }),
    query.since ? OrderModel.countDocuments({ createdAt: { $gt: query.since } }) : Promise.resolve(0),
  ]);
  res.json({ pending, newSince: since, serverTime: new Date() });
});

adminRouter.get('/orders/:id', validate(orderIdSchemas), async (req, res) => {
  const { params } = validated<typeof orderIdSchemas>(req);
  const order = await OrderModel.findById(params.id).lean();
  if (!order) throw AppError.notFound('Order');
  res.json({ order: toOrderDto(order, 'admin', { includeCustomer: true }) });
});

adminRouter.post('/orders/:id/transition', validate(transitionSchemas), async (req, res) => {
  const { params, body } = validated<typeof transitionSchemas>(req);
  const order = await transitionOrder({
    orderId: params.id,
    to: body.to,
    actor: 'admin',
    byUserId: currentUserId(req),
    ...(body.note ? { note: body.note } : {}),
  });
  await recordAudit(req, { action: 'order.transition', entity: 'order', entityId: params.id, meta: { to: body.to, note: body.note } });
  res.json({ order: toOrderDto(order, 'admin', { includeCustomer: true }) });
});

// ── inventory ────────────────────────────────────────────────────────────────
const adjustSchemas = {
  body: z.object({
    sku: skuSchema,
    delta: z.number().int().refine((n) => n !== 0, 'delta cannot be 0').refine((n) => Math.abs(n) <= 100_000),
    note: z.string().trim().min(3, 'A written reason is required').max(500),
  }),
};
const logsSchemas = { query: paginationQuery.extend({ sku: skuSchema.optional() }) };

adminRouter.post('/inventory/adjust', validate(adjustSchemas), async (req, res) => {
  const { body } = validated<typeof adjustSchemas>(req);
  const result = await inventoryService.adjust({ ...body, byUserId: currentUserId(req) });
  await recordAudit(req, { action: 'inventory.adjust', entity: 'sku', entityId: body.sku, meta: { delta: body.delta, note: body.note } });
  res.json(result);
});

adminRouter.get('/inventory/logs', validate(logsSchemas), async (req, res) => {
  const { query } = validated<typeof logsSchemas>(req);
  const filter = query.sku ? { sku: query.sku } : {};
  const [items, total] = await Promise.all([
    InventoryLogModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    InventoryLogModel.countDocuments(filter),
  ]);
  res.json(toPage(items, total, query));
});

// ── customers ────────────────────────────────────────────────────────────────
const customerListSchemas = { query: paginationQuery.extend({ q: z.string().trim().max(80).optional() }) };
const banSchemas = { params: idParams, body: z.object({ status: z.enum(['active', 'banned']) }) };

adminRouter.get('/customers', validate(customerListSchemas), async (req, res) => {
  const { query } = validated<typeof customerListSchemas>(req);
  const filter: Record<string, unknown> = { role: 'customer' };
  if (query.q) {
    const prefix = new RegExp(`^${escapeRegex(query.q)}`, 'i');
    filter['$or'] = [{ email: prefix }, { name: prefix }];
  }
  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    UserModel.countDocuments(filter),
  ]);
  const stats = await OrderModel.aggregate<{ _id: unknown; orders: number; spent: number }>([
    { $match: { userId: { $in: users.map((u) => u._id) }, status: { $nin: ['cancelled', 'refunded', 'pending_payment'] } } },
    { $group: { _id: '$userId', orders: { $sum: 1 }, spent: { $sum: '$total' } } },
  ]);
  const byUser = new Map(stats.map((s) => [String(s._id), s]));
  res.json(
    toPage(
      users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        status: u.status,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt,
        orders: byUser.get(String(u._id))?.orders ?? 0,
        totalSpent: byUser.get(String(u._id))?.spent ?? 0,
      })),
      total,
      query,
    ),
  );
});

adminRouter.get('/customers/:id', validate({ params: idParams }), async (req, res) => {
  const { params } = validated<{ params: typeof idParams }>(req);
  const user = await UserModel.findOne({ _id: params.id, role: 'customer' }).lean();
  if (!user) throw AppError.notFound('Customer');
  const orders = await OrderModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean();
  res.json({
    customer: { id: String(user._id), name: user.name, email: user.email, status: user.status, emailVerified: user.emailVerified, addresses: user.addresses, createdAt: user.createdAt },
    orders: orders.map((o) => toOrderDto(o, 'admin')),
  });
});

adminRouter.patch('/customers/:id/status', validate(banSchemas), async (req, res) => {
  const { params, body } = validated<typeof banSchemas>(req);
  const user = await UserModel.findOneAndUpdate({ _id: params.id, role: 'customer' }, { $set: { status: body.status } }, { returnDocument: 'after' });
  if (!user) throw AppError.notFound('Customer');
  // Banning kicks the customer out of every device immediately (refresh tokens revoked).
  if (body.status === 'banned') await SessionModel.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  await recordAudit(req, { action: `customer.${body.status === 'banned' ? 'ban' : 'unban'}`, entity: 'user', entityId: params.id });
  res.json({ id: params.id, status: user.status });
});

// ── audit log ────────────────────────────────────────────────────────────────
adminRouter.get('/audit-logs', validate({ query: paginationQuery }), async (req, res) => {
  const { query } = validated<{ query: typeof paginationQuery }>(req);
  const [items, total] = await Promise.all([
    AuditLogModel.find().sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate('actorId', 'name email').lean(),
    AuditLogModel.countDocuments(),
  ]);
  res.json(toPage(items, total, query));
});

// ── product CSV import (the browser parses the CSV, the API validates each row) ─────────────────
const importSchemas = { body: z.object({ rows: z.array(z.record(z.string(), z.string())).min(1).max(500) }) };
adminRouter.post('/products/import', validate(importSchemas), async (req, res) => {
  const { body } = validated<typeof importSchemas>(req);
  const results = await importProducts(body.rows);
  await recordAudit(req, { action: 'product.import', entity: 'product', meta: { rows: body.rows.length, created: results.filter((r) => r.ok).length } });
  res.json({ results });
});

// ── signed Cloudinary uploads: the browser uploads straight to Cloudinary, never through our API ─────────
adminRouter.post('/uploads/sign', (_req, res) => {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName || !apiKey || !apiSecret) throw AppError.badRequest('Cloudinary is not configured');

  const timestamp = Math.round(Date.now() / 1000);
  const folder = 'products';
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, apiSecret);
  res.json({ cloudName, apiKey, timestamp, folder, signature });
});
