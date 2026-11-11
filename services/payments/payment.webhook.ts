import { logger } from '../../config/logger';
import { ApiError } from '../../utils/ApiError';
import { OrderModel } from '../../models/Order';
import { transitionOrder } from '../orderTransitions.service';
import type { PaymentProvider } from './PaymentProvider';
import { PaymentModel } from '../../models/Payment';
import { PaymentEventModel, type WebhookOutcome } from '../../models/PaymentEvent';

export interface WebhookResult {
  outcome: WebhookOutcome;
}

/**
 * Gateway callback handler — the webhook is the SOURCE OF TRUTH for payment state.
 * (The browser "return page" only displays status; it never changes anything.)
 *
 *  1. verify the signature over the raw bytes before trusting any field,
 *  2. store the raw callback in `payment_events`,
 *  3. be idempotent: a duplicate delivery of the same transaction does nothing,
 *  4. compare amount + currency with the order before marking it paid,
 *  5. answer 200 quickly — emails etc. are dispatched in the background.
 */
export async function handleWebhook(
  provider: PaymentProvider,
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
): Promise<WebhookResult> {
  const rawPayload = rawBody.toString('utf8');

  let event;
  try {
    event = provider.verifyWebhook(headers, rawBody);
  } catch (error) {
    await PaymentEventModel.create({ provider: provider.name, rawPayload, signatureValid: false, outcome: 'invalid_signature' });
    throw error;
  }

  const record = (outcome: WebhookOutcome) =>
    PaymentEventModel.create({
      provider: provider.name,
      type: event.type,
      providerTxnId: event.providerTxnId,
      rawPayload,
      signatureValid: true,
      outcome,
    });

  const payment = await PaymentModel.findOne({ provider: provider.name, providerTxnId: event.providerTxnId });
  if (!payment) {
    await record('unknown_payment');
    return { outcome: 'unknown_payment' };
  }

  if (event.type !== 'payment.succeeded') {
    if (event.type === 'payment.failed') await PaymentModel.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed' } });
    await record('ignored');
    return { outcome: 'ignored' };
  }

  const order = await OrderModel.findById(payment.orderId);
  if (!order || order.orderNumber !== event.orderNumber || order.total !== event.amount || event.currency !== payment.currency) {
    logger.warn({ txn: event.providerTxnId, event }, 'webhook amount/currency/order mismatch — not marking paid');
    await record('amount_mismatch');
    return { outcome: 'amount_mismatch' };
  }

  // Atomic claim: only the first delivery flips pending → paid; duplicates see null and stop here.
  const claimed = await PaymentModel.findOneAndUpdate({ _id: payment._id, status: 'pending' }, { $set: { status: 'paid' } });
  if (!claimed) {
    await record('duplicate');
    return { outcome: 'duplicate' };
  }

  try {
    await transitionOrder({ orderId: order.id as string, to: 'paid', actor: 'system', note: `Paid via ${provider.name}` });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'INVALID_TRANSITION') {
      // e.g. the order was cancelled/expired while the customer was paying → needs a manual refund.
      logger.error({ orderNumber: order.orderNumber, status: order.status }, 'payment received for an order that is not payable');
      await record('order_not_payable');
      return { outcome: 'order_not_payable' };
    }
    throw error;
  }

  await record('processed');
  return { outcome: 'processed' };
}
