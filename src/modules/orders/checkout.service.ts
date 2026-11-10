import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { buildCartView } from '../cart/cart.service';
import { CartModel } from '../cart/cart.model';
import { CouponModel } from '../coupons/coupon.model';
import { evaluateCoupon } from '../coupons/coupon-rules';
import { ShippingZoneModel } from '../shipping/shipping-zone.model';
import { UserModel } from '../users/user.model';
import { calculateTotals } from './pricing';

export async function requireShippingZone(governorate: string) {
  const zone = await ShippingZoneModel.findOne({ governorate, isActive: true }).lean();
  if (!zone) {
    throw AppError.unprocessable('SHIPPING_UNAVAILABLE', 'We do not deliver to this governorate yet', { governorate });
  }
  return zone;
}

export function formatOrderNumber(sequence: number): string {
  return `ORD-${String(100_000 + sequence)}`;
}

/**
 * Live price preview for the checkout page: the same pure functions the order transaction uses,
 * so the number shown to the shopper is the number they will be charged (barring a price change,
 * which `expectedTotal` catches at placement).
 */
export async function quoteCheckout(
  userId: string,
  input: { addressId?: string | undefined; governorate?: string | undefined; couponCode?: string | undefined },
) {
  const cart = await CartModel.findOne({ userId }).lean();
  const view = await buildCartView(cart?.items ?? []);

  let governorate = input.governorate;
  if (input.addressId) {
    const user = await UserModel.findById(userId).select('addresses').lean();
    const address = user?.addresses.find((a) => String(a._id) === input.addressId);
    if (!address) throw AppError.notFound('Address');
    governorate = address.governorate;
  }

  const zone = governorate ? await requireShippingZone(governorate) : null;

  let discount = 0;
  let coupon: { code: string; error?: unknown } | null = null;
  if (input.couponCode) {
    const doc = await CouponModel.findOne({ code: input.couponCode.toUpperCase() }).lean();
    try {
      if (!doc) throw AppError.unprocessable('COUPON_INVALID', 'Coupon not found', { reason: 'not_found' });
      discount = evaluateCoupon(doc, view.subtotal);
      coupon = { code: doc.code };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      coupon = { code: input.couponCode.toUpperCase(), error: error.details };
    }
  }

  const totals = calculateTotals({
    lines: view.items.filter((i) => i.available).map((i) => ({ unitPrice: i.unitPrice, qty: i.qty })),
    shippingFee: zone?.fee ?? 0,
    discount,
  });

  return {
    cart: view,
    ...totals,
    shippingEstimate: zone?.estimatedDays ?? null,
    shippingKnown: Boolean(zone),
    coupon,
    codMaxAmount: env.COD_MAX_AMOUNT,
    codAvailable: totals.total <= env.COD_MAX_AMOUNT,
  };
}
