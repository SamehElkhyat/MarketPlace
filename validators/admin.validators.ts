import { z } from 'zod';
import { ORDER_STATUSES } from '../services/orderStateMachine';
import { idParams, paginationQuery } from './common.validators';
import { skuSchema } from './product.validators';

// ── orders ───────────────────────────────────────────────────────────────────
export const adminListOrdersSchemas = {
  query: paginationQuery.extend({
    status: z.enum(ORDER_STATUSES).optional(),
    q: z.string().trim().max(80).optional(),
    paymentMethod: z.enum(['cod', 'card', 'wallet', 'fawry']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};
export const adminOrderIdSchemas = { params: idParams };
export const transitionOrderSchemas = {
  params: idParams,
  body: z.object({ to: z.enum(ORDER_STATUSES), note: z.string().trim().max(500).optional() }),
};
export const newOrdersSchemas = { query: z.object({ since: z.coerce.date().optional() }) };

// ── inventory ────────────────────────────────────────────────────────────────
export const adjustStockSchemas = {
  body: z.object({
    sku: skuSchema,
    delta: z
      .number()
      .int()
      .refine((n) => n !== 0, 'delta cannot be 0')
      .refine((n) => Math.abs(n) <= 100_000),
    note: z.string().trim().min(3, 'A written reason is required').max(500),
  }),
};
export const inventoryLogsSchemas = { query: paginationQuery.extend({ sku: skuSchema.optional() }) };

// ── customers ────────────────────────────────────────────────────────────────
export const listCustomersSchemas = { query: paginationQuery.extend({ q: z.string().trim().max(80).optional() }) };
export const customerIdSchemas = { params: idParams };
export const customerStatusSchemas = { params: idParams, body: z.object({ status: z.enum(['active', 'banned']) }) };

// ── audit log ────────────────────────────────────────────────────────────────
export const auditLogsSchemas = { query: paginationQuery };
