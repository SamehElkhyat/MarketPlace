import { Router } from 'express';
import { cancelMyOrder, getMyOrder, listMyOrders, placeOrder } from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  cancelOrderSchemas,
  createOrderSchemas,
  listOrdersSchemas,
  orderNumberSchemas,
} from '../validators/order.validators';

/** A customer's own orders — mounted at `/api/orders`. */
export const orderRouter = Router();
orderRouter.use(authenticate);

orderRouter.post('/', rateLimit({ name: 'orders:create', requests: 20, windowSeconds: 600 }), validate(createOrderSchemas), placeOrder);
orderRouter.get('/', validate(listOrdersSchemas), listMyOrders);
orderRouter.get('/:orderNumber', validate(orderNumberSchemas), getMyOrder);
orderRouter.post('/:orderNumber/cancel', validate(cancelOrderSchemas), cancelMyOrder);
