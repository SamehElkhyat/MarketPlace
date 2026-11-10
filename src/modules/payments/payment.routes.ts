import { Router } from 'express';
import { AppError } from '../../lib/errors';
import { handleWebhook } from './payment.webhook';
import { paymentRegistry } from './payment.registry';

export const paymentRouter = Router();

/**
 * Gateway callbacks. Not authenticated by session — authenticity comes from the provider signature,
 * verified over `req.rawBody` (captured by the JSON parser's `verify` hook).
 */
paymentRouter.post('/webhooks/:provider', async (req, res) => {
  const provider = paymentRegistry.forWebhook(String(req.params['provider']));
  if (!req.rawBody) throw AppError.badRequest('Missing request body');

  const result = await handleWebhook(provider, req.headers, req.rawBody);
  res.status(200).json({ received: true, outcome: result.outcome });
});
