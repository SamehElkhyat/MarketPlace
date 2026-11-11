import { z } from 'zod';
import { PAYMENT_METHODS } from '../config/constants';
import { objectIdSchema } from '../utils/objectId';
import { paginationQuery } from './common.validators';

export const createOrderSchemas = {
  body: z.object({
    addressId: objectIdSchema,
    paymentMethod: z.enum(PAYMENT_METHODS),
    couponCode: z.string().trim().toUpperCase().max(30).optional(),
    note: z.string().trim().max(500).optional(),
    expectedTotal: z.number().int().nonnegative().optional(),
  }),
};

/** Sent as the `Idempotency-Key` header — repeating a request with the same key returns the original order. */
export const idempotencyKeySchema = z.string().trim().min(8).max(100);

export const listOrdersSchemas = { query: paginationQuery };
export const orderNumberSchemas = { params: z.object({ orderNumber: z.string().regex(/^ORD-\d{6,}$/) }) };
export const cancelOrderSchemas = {
  ...orderNumberSchemas,
  body: z.object({ reason: z.string().trim().max(500).optional() }),
};

export const quoteSchemas = {
  body: z.object({
    addressId: objectIdSchema.optional(),
    governorate: z.string().max(40).optional(),
    couponCode: z.string().trim().toUpperCase().max(30).optional(),
  }),
};
