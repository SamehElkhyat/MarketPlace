import type { PaymentMethod } from '../../../config/constants';
import { ApiError } from '../../../utils/ApiError';
import type { PaymentProvider } from '../PaymentProvider';

/**
 * Placeholder for gateways planned for Phase 4 (Paymob cards/wallets, Fawry pay-at-Fawry).
 * It satisfies the adapter interface so the checkout can list the method as "coming soon",
 * while every operation rejects until the real integration replaces this class.
 *
 *  - Paymob: POST /v1/intention → client_secret → Unified Checkout / Pixel; webhook verified with HMAC.
 *  - Fawry:  POST charge (PAYATFAWRY, SHA-256 signature) → reference number; Server Notification V2.
 */
export class ComingSoonProvider implements PaymentProvider {
  readonly enabled = false;
  readonly initialOrderStatus = 'pending_payment' as const;

  constructor(
    readonly name: string,
    readonly method: PaymentMethod,
  ) {}

  private unavailable(): never {
    throw ApiError.unprocessable('PAYMENT_METHOD_UNAVAILABLE', `${this.name} payments are coming soon`);
  }

  createPayment(): never {
    return this.unavailable();
  }
  verifyWebhook(): never {
    return this.unavailable();
  }
  getStatus(): never {
    return this.unavailable();
  }
  refund(): never {
    return this.unavailable();
  }
}
