import { ApiError } from '../utils/ApiError';
import { percentOf, type Piasters } from '../utils/money';
import type { CouponAttrs } from '../models/Coupon';

export type CouponRejection = 'inactive' | 'not_started' | 'expired' | 'exhausted' | 'min_order';

type CouponRuleInput = Pick<
  CouponAttrs,
  'type' | 'value' | 'minOrder' | 'maxDiscount' | 'startsAt' | 'expiresAt' | 'maxUses' | 'usedCount' | 'isActive'
>;

function reject(reason: CouponRejection, extra?: Record<string, unknown>): never {
  throw ApiError.unprocessable('COUPON_INVALID', `Coupon rejected: ${reason}`, { reason, ...extra });
}

/** Pure coupon evaluation → discount in piasters, or throws `COUPON_INVALID` with a reason. */
export function evaluateCoupon(coupon: CouponRuleInput, subtotal: Piasters, now = new Date()): Piasters {
  if (!coupon.isActive) reject('inactive');
  if (coupon.startsAt && coupon.startsAt > now) reject('not_started');
  if (coupon.expiresAt && coupon.expiresAt <= now) reject('expired');
  if (coupon.maxUses !== undefined && coupon.usedCount >= coupon.maxUses) reject('exhausted');
  if (subtotal < coupon.minOrder) reject('min_order', { minOrder: coupon.minOrder });

  const raw = coupon.type === 'percent' ? percentOf(subtotal, coupon.value) : coupon.value;
  const capped = coupon.maxDiscount !== undefined ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.min(capped, subtotal);
}
