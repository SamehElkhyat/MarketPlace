import { model, Schema, type Types } from 'mongoose';
import { PAYMENT_METHODS, type PaymentMethod } from '../../config/constants';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentStatus,
} from './order-state-machine';

/** Immutable snapshot of what was bought — later catalogue edits must never rewrite history. */
export interface OrderItem {
  productId: Types.ObjectId;
  sku: string;
  title: { ar: string; en: string };
  image?: string;
  optionValues: Record<string, string>;
  /** Localized option labels frozen at purchase time. */
  options: { key: string; label: { ar: string; en: string }; value: { ar: string; en: string } }[];
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface ShippingAddressSnapshot {
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  notes?: string;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  at: Date;
  byUserId?: Types.ObjectId;
  actor: 'customer' | 'admin' | 'system';
  note?: string;
}

export interface OrderAttrs {
  orderNumber: string;
  userId: Types.ObjectId;
  /** Snapshot of who ordered — used for admin search and e-mails even if the account later changes. */
  customerName: string;
  customerEmail: string;
  items: OrderItem[];
  shippingAddress: ShippingAddressSnapshot;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  couponCode?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  customerNote?: string;
  idempotencyKey: string;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const localized = { ar: { type: String, default: '' }, en: { type: String, default: '' } };

const itemSchema = new Schema<OrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true },
    title: { type: localized, _id: false, required: true },
    image: String,
    optionValues: { type: Schema.Types.Mixed, default: {} },
    options: { type: Schema.Types.Mixed, default: () => [] },
    unitPrice: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false, minimize: false },
);

const historySchema = new Schema<StatusHistoryEntry>(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: () => new Date() },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actor: { type: String, enum: ['customer', 'admin', 'system'], required: true },
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderAttrs>(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true, lowercase: true },
    items: { type: [itemSchema], validate: (v: unknown[]) => v.length > 0 },
    shippingAddress: {
      type: new Schema<ShippingAddressSnapshot>(
        {
          fullName: { type: String, required: true },
          phone: { type: String, required: true },
          governorate: { type: String, required: true },
          city: { type: String, required: true },
          street: { type: String, required: true },
          notes: String,
        },
        { _id: false },
      ),
      required: true,
    },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    couponCode: String,
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    statusHistory: { type: [historySchema], default: [] },
    customerNote: { type: String, maxlength: 500 },
    idempotencyKey: { type: String, required: true },
    cancelReason: { type: String, maxlength: 500 },
  },
  { timestamps: true, minimize: false },
);

// A double-click / retry with the same key can never create a second order for the same user.
orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ customerEmail: 1 });

export const OrderModel = model<OrderAttrs>('Order', orderSchema);
