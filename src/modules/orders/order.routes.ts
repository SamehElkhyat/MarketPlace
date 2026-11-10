import { Router } from 'express';
import { z } from 'zod';
import { PAYMENT_METHODS } from '../../config/constants';
import { authenticate, currentUserId } from '../../http/middleware/authenticate';
import { rateLimit } from '../../http/middleware/rate-limit';
import { validate, validated } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { objectIdSchema } from '../../lib/object-id';
import { paginationQuery, toPage } from '../../lib/schemas';
import { paymentRegistry } from '../payments/payment.registry';
import { quoteCheckout } from './checkout.service';
import { toOrderDto } from './order.dto';
import { OrderModel } from './order.model';
import { createOrder } from './order.service';
import { transitionOrder } from './order.transitions';

const createSchemas = {
  body: z.object({
    addressId: objectIdSchema,
    paymentMethod: z.enum(PAYMENT_METHODS),
    couponCode: z.string().trim().toUpperCase().max(30).optional(),
    note: z.string().trim().max(500).optional(),
    expectedTotal: z.number().int().nonnegative().optional(),
  }),
};
const idempotencyKeySchema = z.string().trim().min(8).max(100);

const quoteSchemas = {
  body: z.object({
    addressId: objectIdSchema.optional(),
    governorate: z.string().max(40).optional(),
    couponCode: z.string().trim().toUpperCase().max(30).optional(),
  }),
};
const listSchemas = { query: paginationQuery };
const numberParams = { params: z.object({ orderNumber: z.string().regex(/^ORD-\d{6,}$/) }) };
const cancelSchemas = { ...numberParams, body: z.object({ reason: z.string().trim().max(500).optional() }) };

/** `/api/checkout` */
export const checkoutRouter = Router();

checkoutRouter.get('/payment-methods', (_req, res) => {
  res.json({ items: paymentRegistry.describe() });
});

checkoutRouter.post('/quote', authenticate, validate(quoteSchemas), async (req, res) => {
  const { body } = validated<typeof quoteSchemas>(req);
  res.json(await quoteCheckout(currentUserId(req), body));
});

/** `/api/orders` — a customer's own orders. */
export const orderRouter = Router();
orderRouter.use(authenticate);

orderRouter.post(
  '/',
  rateLimit({ name: 'orders:create', requests: 20, windowSeconds: 600 }),
  validate(createSchemas),
  async (req, res) => {
    const { body } = validated<typeof createSchemas>(req);
    const key = idempotencyKeySchema.safeParse(req.get('idempotency-key'));
    if (!key.success) throw AppError.badRequest('An "Idempotency-Key" header (8–100 chars) is required');

    const result = await createOrder(currentUserId(req), { ...body, idempotencyKey: key.data });
    res.status(result.created ? 201 : 200).json({
      order: toOrderDto(result.order, 'customer'),
      payment: result.payment,
      replayed: !result.created,
    });
  },
);

orderRouter.get('/', validate(listSchemas), async (req, res) => {
  const { query } = validated<typeof listSchemas>(req);
  const filter = { userId: currentUserId(req) };
  const [items, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    OrderModel.countDocuments(filter),
  ]);
  res.json(toPage(items.map((o) => toOrderDto(o, 'customer')), total, query));
});

orderRouter.get('/:orderNumber', validate(numberParams), async (req, res) => {
  const { params } = validated<typeof numberParams>(req);
  const order = await OrderModel.findOne({ orderNumber: params.orderNumber, userId: currentUserId(req) }).lean();
  if (!order) throw AppError.notFound('Order');
  res.json({ order: toOrderDto(order, 'customer') });
});

orderRouter.post('/:orderNumber/cancel', validate(cancelSchemas), async (req, res) => {
  const { params, body } = validated<typeof cancelSchemas>(req);
  const userId = currentUserId(req);
  const order = await OrderModel.findOne({ orderNumber: params.orderNumber, userId }).select('_id');
  if (!order) throw AppError.notFound('Order');

  const updated = await transitionOrder({
    orderId: order.id as string,
    to: 'cancelled',
    actor: 'customer',
    byUserId: userId,
    ownerId: userId,
    ...(body.reason ? { note: body.reason } : {}),
  });
  res.json({ order: toOrderDto(updated, 'customer') });
});
