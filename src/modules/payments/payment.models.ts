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

export const WEBHOOK_OUTCOMES = [
  'processed',
  'duplicate',
  'invalid_signature',
  'amount_mismatch',
  'unknown_payment',
  'order_not_payable',
  'ignored',
] as const;
export type WebhookOutcome = (typeof WEBHOOK_OUTCOMES)[number];

export interface PaymentEventAttrs {
  provider: string;
  type?: string;
  providerTxnId?: string;
  /** Verbatim callback body, kept for audits and debugging disputes. */
  rawPayload: string;
  signatureValid: boolean;
  outcome: WebhookOutcome;
  receivedAt: Date;
}

const paymentEventSchema = new Schema<PaymentEventAttrs>({
  provider: { type: String, required: true },
  type: String,
  providerTxnId: String,
  rawPayload: { type: String, required: true },
  signatureValid: { type: Boolean, required: true },
  outcome: { type: String, enum: WEBHOOK_OUTCOMES, required: true },
  receivedAt: { type: Date, default: () => new Date() },
});
paymentEventSchema.index({ receivedAt: -1 });
paymentEventSchema.index({ provider: 1, providerTxnId: 1 });

export const PaymentEventModel = model<PaymentEventAttrs>('PaymentEvent', paymentEventSchema, 'payment_events');
