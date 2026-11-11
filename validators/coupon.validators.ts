import { z } from 'zod';
import { COUPON_TYPES } from '../models/Coupon';
import { idParams, paginationQuery, piastersSchema } from './common.validators';

const baseBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Code: 3–30 letters, digits, "-" or "_"'),
  type: z.enum(COUPON_TYPES),
  value: z.number().int().min(1),
  minOrder: piastersSchema,
  maxDiscount: piastersSchema.min(1).optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  maxUses: z.number().int().min(1).optional(),
  isActive: z.boolean(),
});

/** Cross-field rules shared by create (full body) and update (partial body). */
type CouponShape = { type?: 'percent' | 'fixed'; value?: number; startsAt?: Date; expiresAt?: Date };
const refineCoupon = <T extends z.ZodType<CouponShape>>(schema: T) =>
  schema
    .refine((c) => c.type !== 'percent' || c.value === undefined || c.value <= 100, {
      message: 'Percent coupons are capped at 100',
      path: ['value'],
    })
    .refine((c) => !c.startsAt || !c.expiresAt || c.startsAt < c.expiresAt, {
      message: 'expiresAt must be after startsAt',
      path: ['expiresAt'],
    });

/** Defaults live on CREATE only — Zod 4 re-applies defaults inside .partial(), which would reset fields on PATCH. */
export const createCouponSchemas = {
  body: refineCoupon(baseBody.extend({ minOrder: piastersSchema.default(0), isActive: z.boolean().default(true) })),
};
export const updateCouponSchemas = { params: idParams, body: refineCoupon(baseBody.partial()) };
export const couponIdSchemas = { params: idParams };
export const listCouponsSchemas = { query: paginationQuery };
