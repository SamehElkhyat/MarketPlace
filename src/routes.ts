import { Router } from 'express';
import { health } from './http/health';
import { adminRouter } from './modules/admin/admin.routes';
import { authRouter } from './modules/auth/auth.routes';
import { brandRouter } from './modules/brands/brand.routes';
import { cartRouter } from './modules/cart/cart.routes';
import { categoryRouter } from './modules/categories/category.routes';
import { collectionRouter } from './modules/collections/collection.routes';
import { checkoutRouter, orderRouter } from './modules/orders/order.routes';
import { paymentRouter } from './modules/payments/payment.routes';
import { productRouter } from './modules/products/product.routes';
import { reviewRouter } from './modules/reviews/review.routes';
import { shippingRouter } from './modules/shipping/shipping.routes';
import { userRouter } from './modules/users/user.routes';

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
