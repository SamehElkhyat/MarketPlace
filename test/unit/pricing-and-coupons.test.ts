import { describe, expect, it } from 'vitest';
import { evaluateCoupon } from '../../services/couponRules.service';
import { calculateTotals } from '../../services/pricing.service';
import { percentOf } from '../../utils/money';

describe('calculateTotals', () => {
  it('sums integer piasters exactly (no float drift)', () => {
    // 0.1 + 0.2 style traps: 3 × 10.10 EGP + 1 × 19.99 EGP
    const totals = calculateTotals({
      lines: [
        { unitPrice: 1010, qty: 3 },
        { unitPrice: 1999, qty: 1 },
      ],
      shippingFee: 5000,
      discount: 0,
    });
    expect(totals).toEqual({ subtotal: 5029, shippingFee: 5000, discount: 0, total: 10029 });
  });

  it('applies the discount to merchandise only and never exceeds the subtotal', () => {
    const totals = calculateTotals({ lines: [{ unitPrice: 10_000, qty: 1 }], shippingFee: 6000, discount: 999_999 });
    expect(totals.discount).toBe(10_000);
    expect(totals.total).toBe(6000); // shipping is still charged
  });

  it('rejects fractional or negative money and invalid quantities', () => {
    expect(() => calculateTotals({ lines: [{ unitPrice: 10.5, qty: 1 }], shippingFee: 0 })).toThrow(RangeError);
    expect(() => calculateTotals({ lines: [{ unitPrice: 100, qty: 0 }], shippingFee: 0 })).toThrow(RangeError);
    expect(() => calculateTotals({ lines: [{ unitPrice: 100, qty: 1 }], shippingFee: -1 })).toThrow(RangeError);
  });
});

describe('evaluateCoupon', () => {
  const base = { type: 'percent' as const, value: 10, minOrder: 0, usedCount: 0, isActive: true };
  const now = new Date('2026-06-01T12:00:00Z');

  it('computes percentage and fixed discounts', () => {
    expect(evaluateCoupon(base, 20_000, now)).toBe(2000);
    expect(evaluateCoupon({ ...base, type: 'fixed', value: 5000 }, 20_000, now)).toBe(5000);
  });

  it('caps percentage coupons with maxDiscount and fixed coupons at the subtotal', () => {
    expect(evaluateCoupon({ ...base, value: 50, maxDiscount: 3000 }, 20_000, now)).toBe(3000);
    expect(evaluateCoupon({ ...base, type: 'fixed', value: 50_000 }, 20_000, now)).toBe(20_000);
  });

  it.each([
    ['inactive', { isActive: false }],
    ['not_started', { startsAt: new Date('2026-07-01') }],
    ['expired', { expiresAt: new Date('2026-05-01') }],
    ['exhausted', { maxUses: 5, usedCount: 5 }],
    ['min_order', { minOrder: 50_000 }],
  ])('rejects with reason "%s"', (reason, patch) => {
    expect(() => evaluateCoupon({ ...base, ...patch }, 20_000, now)).toThrowError(
      expect.objectContaining({ code: 'COUPON_INVALID', details: expect.objectContaining({ reason }) }),
    );
  });

  it('rounds half-up to the nearest piaster', () => {
    expect(percentOf(333, 10)).toBe(33);
    expect(percentOf(335, 10)).toBe(34);
  });
});
