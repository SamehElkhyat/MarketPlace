import { Router } from 'express';
import { z } from 'zod';
import { validate, validated } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { idParams, paginationQuery, piastersSchema, toPage } from '../../lib/schemas';
import { recordAudit } from '../admin/audit.service';
import { COUPON_TYPES, CouponModel } from './coupon.model';

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
    .refine((c) => c.type !== 'percent' || c.value === undefined || c.value <= 100, { message: 'Percent coupons are capped at 100', path: ['value'] })
    .refine((c) => !c.startsAt || !c.expiresAt || c.startsAt < c.expiresAt, { message: 'expiresAt must be after startsAt', path: ['expiresAt'] });

/** Defaults live on CREATE only — Zod 4 re-applies defaults inside .partial(), which would reset fields on PATCH. */
const body = refineCoupon(baseBody.extend({ minOrder: piastersSchema.default(0), isActive: z.boolean().default(true) }));

const createSchemas = { body };
const updateSchemas = { params: idParams, body: refineCoupon(baseBody.partial()) };
const idSchemas = { params: idParams };
const listSchemas = { query: paginationQuery };

export const couponAdminRouter = Router();

couponAdminRouter.get('/', validate(listSchemas), async (req, res) => {
  const { query } = validated<typeof listSchemas>(req);
  const [items, total] = await Promise.all([
    CouponModel.find().sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    CouponModel.countDocuments(),
  ]);
  res.json(toPage(items, total, query));
});

couponAdminRouter.post('/', validate(createSchemas), async (req, res) => {
  const { body: data } = validated<typeof createSchemas>(req);
  const coupon = await CouponModel.create(data); // duplicate code → 409 via the unique index
  await recordAudit(req, { action: 'coupon.create', entity: 'coupon', entityId: coupon.id as string });
  res.status(201).json({ coupon });
});

couponAdminRouter.patch('/:id', validate(updateSchemas), async (req, res) => {
  const { params, body: patch } = validated<typeof updateSchemas>(req);
  const coupon = await CouponModel.findByIdAndUpdate(params.id, { $set: patch }, { returnDocument: 'after', runValidators: true });
  if (!coupon) throw AppError.notFound('Coupon');
  await recordAudit(req, { action: 'coupon.update', entity: 'coupon', entityId: params.id });
  res.json({ coupon });
});

couponAdminRouter.delete('/:id', validate(idSchemas), async (req, res) => {
  const { params } = validated<typeof idSchemas>(req);
  if (!(await CouponModel.findByIdAndDelete(params.id))) throw AppError.notFound('Coupon');
  await recordAudit(req, { action: 'coupon.delete', entity: 'coupon', entityId: params.id });
  res.status(204).end();
});
