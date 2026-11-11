import type { RequestHandler } from 'express';
import { validated } from '../middleware/validate.middleware';
import { CouponModel } from '../models/Coupon';
import { recordAudit } from '../services/audit.service';
import { ApiError } from '../utils/ApiError';
import { toPage } from '../validators/common.validators';
import type {
  couponIdSchemas,
  createCouponSchemas,
  listCouponsSchemas,
  updateCouponSchemas,
} from '../validators/coupon.validators';

export const listCoupons: RequestHandler = async (req, res) => {
  const { query } = validated<typeof listCouponsSchemas>(req);
  const [items, total] = await Promise.all([
    CouponModel.find().sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    CouponModel.countDocuments(),
  ]);
  res.json(toPage(items, total, query));
};

export const createCoupon: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createCouponSchemas>(req);
  const coupon = await CouponModel.create(body); // duplicate code → 409 via the unique index
  await recordAudit(req, { action: 'coupon.create', entity: 'coupon', entityId: coupon.id as string });
  res.status(201).json({ coupon });
};

export const updateCoupon: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateCouponSchemas>(req);
  const coupon = await CouponModel.findByIdAndUpdate(params.id, { $set: body }, { returnDocument: 'after', runValidators: true });
  if (!coupon) throw ApiError.notFound('Coupon');
  await recordAudit(req, { action: 'coupon.update', entity: 'coupon', entityId: params.id });
  res.json({ coupon });
};

export const deleteCoupon: RequestHandler = async (req, res) => {
  const { params } = validated<typeof couponIdSchemas>(req);
  if (!(await CouponModel.findByIdAndDelete(params.id))) throw ApiError.notFound('Coupon');
  await recordAudit(req, { action: 'coupon.delete', entity: 'coupon', entityId: params.id });
  res.status(204).end();
};
