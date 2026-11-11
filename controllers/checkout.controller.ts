import type { RequestHandler } from 'express';
import { currentUserId } from '../middleware/auth.middleware';
import { validated } from '../middleware/validate.middleware';
import { quoteCheckout } from '../services/checkout.service';
import { paymentRegistry } from '../services/payments/payment.registry';
import type { quoteSchemas } from '../validators/order.validators';

/** Live methods plus disabled "coming soon" ones (card, wallet, Fawry). */
export const getPaymentMethods: RequestHandler = (_req, res) => {
  res.json({ items: paymentRegistry.describe() });
};

/** Server-computed totals for the checkout page — the same pure functions the order transaction uses. */
export const quote: RequestHandler = async (req, res) => {
  const { body } = validated<typeof quoteSchemas>(req);
  res.json(await quoteCheckout(currentUserId(req), body));
};
