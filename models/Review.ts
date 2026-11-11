import { model, Schema, type Types } from 'mongoose';

export interface ReviewAttrs {
  productId: Types.ObjectId;
  userId: Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;
  /** Always true — reviews are only accepted from customers with a delivered order. */
  verifiedPurchase: boolean;
  createdAt: Date;
}

const reviewSchema = new Schema<ReviewAttrs>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 120 },
    comment: { type: String, required: true, maxlength: 2000 },
    verifiedPurchase: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ productId: 1, createdAt: -1 });

export const ReviewModel = model<ReviewAttrs>('Review', reviewSchema);
