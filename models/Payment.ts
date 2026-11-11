import { model, Schema, type Types } from 'mongoose';

export const PAYMENT_RECORD_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUSES)[number];

export interface PaymentAttrs {
  orderId: Types.ObjectId;
  provider: string;
  providerTxnId: string;
  amount: number;
  currency: string;
  status: PaymentRecordStatus;
  createdAt: Date;
}

const paymentSchema = new Schema<PaymentAttrs>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    provider: { type: String, required: true },
    providerTxnId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'EGP' },
    status: { type: String, enum: PAYMENT_RECORD_STATUSES, default: 'pending' },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);
// A gateway transaction id can only ever map to one payment → webhook idempotency.
paymentSchema.index({ provider: 1, providerTxnId: 1 }, { unique: true });

export const PaymentModel = model<PaymentAttrs>('Payment', paymentSchema);
