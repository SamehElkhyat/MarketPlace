import type { RequestHandler } from 'express';
import { currentUserId } from '../middleware/auth.middleware';
import { validated } from '../middleware/validate.middleware';
import { cancelOrderForUser, createOrder, getOrderForUser, listOrdersForUser } from '../services/order.service';
import { ApiError } from '../utils/ApiError';
import { toOrderDto } from '../utils/orderDto';
import {
  idempotencyKeySchema,
  type cancelOrderSchemas,
  type createOrderSchemas,
  type listOrdersSchemas,
  type orderNumberSchemas,
} from '../validators/order.validators';

/** Places an order. 201 = created, 200 = a replay of an earlier request with the same idempotency key. */
export const placeOrder: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createOrderSchemas>(req);
  const key = idempotencyKeySchema.safeParse(req.get('idempotency-key'));
  if (!key.success) throw ApiError.badRequest('An "Idempotency-Key" header (8–100 chars) is required');

  const result = await createOrder(currentUserId(req), { ...body, idempotencyKey: key.data });
  res.status(result.created ? 201 : 200).json({
    order: toOrderDto(result.order, 'customer'),
    payment: result.payment,
    replayed: !result.created,
  });
};

export const listMyOrders: RequestHandler = async (req, res) => {
  const { query } = validated<typeof listOrdersSchemas>(req);
  res.json(await listOrdersForUser(currentUserId(req), query));
};

export const getMyOrder: RequestHandler = async (req, res) => {
  const { params } = validated<typeof orderNumberSchemas>(req);
  res.json({ order: await getOrderForUser(currentUserId(req), params.orderNumber) });
};

export const cancelMyOrder: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof cancelOrderSchemas>(req);
  res.json({ order: await cancelOrderForUser(currentUserId(req), params.orderNumber, body.reason) });
};
