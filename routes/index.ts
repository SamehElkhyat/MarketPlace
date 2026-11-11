import { Router } from 'express';
import { health } from '../controllers/health.controller';
import { adminRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { brandRouter } from './brand.routes';
import { cartRouter } from './cart.routes';
import { categoryRouter } from './category.routes';
import { collectionRouter } from './collection.routes';
import { checkoutRouter } from './checkout.routes';
import { orderRouter } from './order.routes';
import { paymentRouter } from './payment.routes';
import { productRouter } from './product.routes';
import { reviewRouter } from './review.routes';
import { shippingRouter } from './shipping.routes';
import { userRouter } from './user.routes';

/** Everything mounted under `/api`. */
export const apiRouter = Router();

apiRouter.get('/health', health);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/brands', brandRouter);
apiRouter.use('/collections', collectionRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/reviews', reviewRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/shipping', shippingRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/admin', adminRouter);
