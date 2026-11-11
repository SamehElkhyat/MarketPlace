import type { PaymentMethod } from '../../config/constants';
import type { OrderStatus } from '../orderStateMachine';

/**
 * The single seam between the orders module and any payment gateway.
 *
 * `orders` only ever talks to this interface (through the registry), so adding Paymob or Fawry means
 * implementing a provider and flipping `enabled` — the orders module does not change.
 */

export interface PaymentOrderRef {
  id: string;
  orderNumber: string;
  /** Integer piasters. */
  amount: number;
  currency: 'EGP';
  customer: { name: string; email: string; phone?: string };
}

export interface PaymentInitResult {
  /** Gateway's id for this payment attempt (unique per provider). */
  providerTxnId: string;
  /** For embedded checkouts (e.g. Paymob Pixel). */
  clientSecret?: string | undefined;
  /** For hosted checkouts / pay-at-Fawry instructions. */
  redirectUrl?: string | undefined;
  /** Fawry reference number, shown to the customer. */
  reference?: string | undefined;
  expiresAt?: Date | undefined;
}

export type WebhookEventType = 'payment.succeeded' | 'payment.failed' | 'payment.refunded';

export interface VerifiedWebhookEvent {
  type: WebhookEventType;
  providerTxnId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  raw: unknown;
}

export type ProviderPaymentState = 'pending' | 'paid' | 'failed' | 'refunded';

export interface PaymentProvider {
  /** Stable identifier used in URLs (`/payments/webhooks/:name`) and stored on payment records. */
  readonly name: string;
  readonly method: PaymentMethod;
  /** Disabled providers are shown as "coming soon" in checkout and rejected by the API. */
  readonly enabled: boolean;
  /**
   * Status the order starts in. Offline methods (COD) go straight to `pending_confirmation`;
   * online methods start in `pending_payment` and become `paid` only via a verified webhook.
   */
  readonly initialOrderStatus: Extract<OrderStatus, 'pending_confirmation' | 'pending_payment'>;

  /** Called AFTER the order transaction commits (never inside it — it may do network I/O). */
  createPayment(order: PaymentOrderRef): Promise<PaymentInitResult | null>;

  /** Throws `ApiError(INVALID_SIGNATURE)` when the signature doesn't match; never trusts any field before that. */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedWebhookEvent;

  getStatus(providerTxnId: string): Promise<ProviderPaymentState>;
  refund(providerTxnId: string, amount: number): Promise<{ refundId: string }>;
}
