import { PAYMENT_METHODS, type PaymentMethod } from '../../config/constants';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import type { PaymentProvider } from './payment-provider';
import { CodProvider } from './providers/cod.provider';
import { ComingSoonProvider } from './providers/coming-soon.provider';
import { MockProvider } from './providers/mock.provider';

function buildProviders(): PaymentProvider[] {
  const cod = new CodProvider();
  if (env.PAYMENTS_MOCK_ENABLED) {
    // Demo / test mode: every online method is served by the signed-webhook mock gateway.
    return [cod, new MockProvider('card'), new MockProvider('wallet'), new MockProvider('fawry')];
  }
  return [
    cod,
    new ComingSoonProvider('paymob', 'card'),
    new ComingSoonProvider('paymob', 'wallet'),
    new ComingSoonProvider('fawry', 'fawry'),
  ];
}

const providers = buildProviders();
const byMethod = new Map<PaymentMethod, PaymentProvider>(providers.map((p) => [p.method, p]));

export const paymentRegistry = {
  /** Provider for a checkout method; rejects methods that are not live yet ("coming soon"). */
  forMethod(method: PaymentMethod): PaymentProvider {
    const provider = byMethod.get(method);
    if (!provider?.enabled) {
      throw AppError.unprocessable('PAYMENT_METHOD_UNAVAILABLE', `Payment method "${method}" is not available yet`);
    }
    return provider;
  },

  /** Provider that owns a webhook URL segment, e.g. `/payments/webhooks/mock`. */
  forWebhook(name: string): PaymentProvider {
    const provider = providers.find((p) => p.name === name && p.enabled && p.name !== 'cod');
    if (!provider) throw AppError.notFound('Payment provider');
    return provider;
  },

  /** What the checkout UI lists: live methods plus disabled "coming soon" ones. */
  describe() {
    return PAYMENT_METHODS.map((method) => {
      const provider = byMethod.get(method)!;
      return { method, provider: provider.name, enabled: provider.enabled, comingSoon: !provider.enabled };
    });
  },
};
