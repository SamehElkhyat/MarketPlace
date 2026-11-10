import type { PaymentMethod } from '../../../config/constants';
import { env } from '../../../config/env';
import { hmacSha256, safeEqual } from '../../../lib/crypto';
import { AppError } from '../../../lib/errors';
import type {
  PaymentInitResult,
  PaymentOrderRef,
  PaymentProvider,
  ProviderPaymentState,
  VerifiedWebhookEvent,
  WebhookEventType,
} from '../payment-provider';

export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

/**
 * A fake online gateway for demos and tests (no merchant account needed — Paymob requires business
 * verification). It behaves like a real one: asynchronous confirmation through an HMAC-signed webhook.
 */
export class MockProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly enabled = true;
  readonly initialOrderStatus = 'pending_payment' as const;

  constructor(
    readonly method: PaymentMethod,
    private readonly secret: string = env.PAYMENTS_MOCK_SECRET ?? 'mock-webhook-secret',
  ) {}

  async createPayment(order: PaymentOrderRef): Promise<PaymentInitResult> {
    return {
      providerTxnId: `mock_${order.orderNumber}`,
      clientSecret: `mock_secret_${order.id}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): VerifiedWebhookEvent {
    const received = headers[MOCK_SIGNATURE_HEADER];
    const signature = Array.isArray(received) ? received[0] : received;
    // Verify the signature over the RAW bytes BEFORE parsing or trusting a single field.
    if (!signature || !safeEqual(signature, hmacSha256(this.secret, rawBody.toString('utf8')))) {
      throw new AppError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      type?: WebhookEventType;
      id?: string;
      orderNumber?: string;
      amount?: number;
      currency?: string;
    };
    if (!payload.type || !payload.id || !payload.orderNumber || typeof payload.amount !== 'number') {
      throw AppError.badRequest('Malformed webhook payload');
    }
    return {
      type: payload.type,
      providerTxnId: payload.id,
      orderNumber: payload.orderNumber,
      amount: payload.amount,
      currency: payload.currency ?? 'EGP',
      raw: payload,
    };
  }

  async getStatus(): Promise<ProviderPaymentState> {
    return 'pending';
  }

  async refund(providerTxnId: string): Promise<{ refundId: string }> {
    return { refundId: `mock_refund_${providerTxnId}` };
  }

  /** Test helper: sign a payload exactly like the "gateway" would. */
  sign(rawBody: string): string {
    return hmacSha256(this.secret, rawBody);
  }
}
