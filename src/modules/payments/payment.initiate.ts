import { logger } from '../../lib/logger';
import type { PaymentInitResult, PaymentProvider } from './payment-provider';
import { PaymentModel } from './payment.models';

/**
 * Starts an online payment for an already-committed order. Gateway failures never lose the order:
 * it stays `pending_payment` (stock reserved) so the customer can retry or an expiry job can release it.
 */
export async function initiatePayment(
  order: { id: string; orderNumber: string; total: number; customerName: string; customerEmail: string },
  provider: PaymentProvider,
): Promise<PaymentInitResult | null> {
  try {
    const result = await provider.createPayment({
      id: order.id,
      orderNumber: order.orderNumber,
      amount: order.total,
      currency: 'EGP',
      customer: { name: order.customerName, email: order.customerEmail },
    });
    if (!result) return null;

    await PaymentModel.create({
      orderId: order.id,
      provider: provider.name,
      providerTxnId: result.providerTxnId,
      amount: order.total,
      currency: 'EGP',
    });
    return result;
  } catch (error) {
    logger.error({ err: error, orderNumber: order.orderNumber, provider: provider.name }, 'payment initiation failed');
    return null;
  }
}
