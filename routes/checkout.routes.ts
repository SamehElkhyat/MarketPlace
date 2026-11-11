import { Router } from 'express';
import { getPaymentMethods, quote } from '../controllers/checkout.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { quoteSchemas } from '../validators/order.validators';

/** Mounted at `/api/checkout`. */
export const checkoutRouter = Router();
checkoutRouter.get('/payment-methods', getPaymentMethods);
checkoutRouter.post('/quote', authenticate, validate(quoteSchemas), quote);
