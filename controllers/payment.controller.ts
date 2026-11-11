import type { RequestHandler } from 'express';
import { paymentRegistry } from '../services/payments/payment.registry';
import { handleWebhook } from '../services/payments/payment.webhook';
import { ApiError } from '../utils/ApiError';

/**
 * Gateway callback. Not authenticated by session — authenticity comes from the provider signature,
 * verified over `req.rawBody` (captured by the JSON parser's `verify` hook in app.ts).
 */
export const receiveWebhook: RequestHandler = async (req, res) => {
  const provider = paymentRegistry.forWebhook(String(req.params['provider']));
  if (!req.rawBody) throw ApiError.badRequest('Missing request body');

  const result = await handleWebhook(provider, req.headers, req.rawBody);
  res.status(200).json({ received: true, outcome: result.outcome });
};
