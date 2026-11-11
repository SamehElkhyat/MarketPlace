import { model, Schema } from 'mongoose';

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
