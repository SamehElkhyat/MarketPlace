import { Router } from 'express';
import { receiveWebhook } from '../controllers/payment.controller';

/** Mounted at `/api/payments`. */
export const paymentRouter = Router();
paymentRouter.post('/webhooks/:provider', receiveWebhook);
