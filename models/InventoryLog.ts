import { model, Schema, type Types } from 'mongoose';

export const INVENTORY_REASONS = [
  'order_placed',
  'order_cancelled',
  'order_refunded',
  'manual_adjustment',
  'restock',
  'import',
] as const;
export type InventoryReason = (typeof INVENTORY_REASONS)[number];

export interface InventoryLogAttrs {
  sku: string;
  productId: Types.ObjectId;
  /** Signed change in units (negative = stock removed). */
  delta: number;
  reason: InventoryReason;
  note?: string;
  orderId?: Types.ObjectId;
  byUserId?: Types.ObjectId;
  createdAt: Date;
}

const inventoryLogSchema = new Schema<InventoryLogAttrs>(
  {
    sku: { type: String, required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    delta: { type: Number, required: true },
    reason: { type: String, enum: INVENTORY_REASONS, required: true },
    note: { type: String, maxlength: 500 },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
inventoryLogSchema.index({ createdAt: -1 });
inventoryLogSchema.index({ orderId: 1 });

export const InventoryLogModel = model<InventoryLogAttrs>('InventoryLog', inventoryLogSchema, 'inventory_logs');
