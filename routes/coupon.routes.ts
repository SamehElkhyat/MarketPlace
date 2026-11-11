import { Router } from 'express';
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from '../controllers/coupon.controller';
import { validate } from '../middleware/validate.middleware';
import {
  couponIdSchemas,
  createCouponSchemas,
  listCouponsSchemas,
  updateCouponSchemas,
} from '../validators/coupon.validators';

/** Mounted under `/api/admin/coupons`. */
export const couponAdminRouter = Router();
couponAdminRouter.get('/', validate(listCouponsSchemas), listCoupons);
couponAdminRouter.post('/', validate(createCouponSchemas), createCoupon);
couponAdminRouter.patch('/:id', validate(updateCouponSchemas), updateCoupon);
couponAdminRouter.delete('/:id', validate(couponIdSchemas), deleteCoupon);
