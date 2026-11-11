import { model, Schema } from 'mongoose';

export const COUPON_TYPES = ['percent', 'fixed'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export interface CouponAttrs {
  code: string;
  type: CouponType;
  /** `percent` → 1–100; `fixed` → integer piasters. */
  value: number;
  /** Minimum subtotal (piasters) required to use the coupon. */
  minOrder: number;
  /** Cap for percentage coupons (piasters). */
  maxDiscount?: number;
  startsAt?: Date;
  expiresAt?: Date;
  maxUses?: number;
  usedCount: number;
  isActive: boolean;
}

const couponSchema = new Schema<CouponAttrs>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: COUPON_TYPES, required: true },
    value: { type: Number, required: true, min: 1 },
    minOrder: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, min: 1 },
    startsAt: Date,
    expiresAt: Date,
    maxUses: { type: Number, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const CouponModel = model<CouponAttrs>('Coupon', couponSchema);
