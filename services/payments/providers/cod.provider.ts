import { ApiError } from '../../../utils/ApiError';
import type { PaymentInitResult, PaymentProvider, VerifiedWebhookEvent } from '../PaymentProvider';

/** Cash on delivery: no gateway, no webhooks. Money is collected by the courier and recorded on delivery. */
export class CodProvider implements PaymentProvider {
  readonly name = 'cod';
  readonly method = 'cod' as const;
  readonly enabled = true;
  readonly initialOrderStatus = 'pending_confirmation' as const;

  async createPayment(): Promise<PaymentInitResult | null> {
    return null; // nothing to initiate — payment is collected at the door
  }

  verifyWebhook(): VerifiedWebhookEvent {
    throw new ApiError(400, 'BAD_REQUEST', 'Cash on delivery has no webhooks');
  }

  async getStatus() {
    return 'pending' as const;
  }

  async refund(): Promise<{ refundId: string }> {
    return { refundId: 'manual' }; // refunded in cash by the courier / support — no gateway call
  }
}
