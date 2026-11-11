import { Router } from 'express';
import {
  adjustStock,
  getAuditLogs,
  getCustomer,
  getDashboard,
  getInventoryLogs,
  getNewOrdersCount,
  getOrder,
  listCustomers,
  listOrders,
  setCustomerStatus,
  signUpload,
  transition,
} from '../controllers/admin.controller';
import { authenticate, denyDemoWrites, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  adjustStockSchemas,
  adminListOrdersSchemas,
  adminOrderIdSchemas,
  auditLogsSchemas,
  customerIdSchemas,
  customerStatusSchemas,
  inventoryLogsSchemas,
  listCustomersSchemas,
  newOrdersSchemas,
  transitionOrderSchemas,
} from '../validators/admin.validators';
import { brandAdminRouter } from './brand.routes';
import { categoryAdminRouter } from './category.routes';
import { collectionAdminRouter } from './collection.routes';
import { couponAdminRouter } from './coupon.routes';
import { productAdminRouter } from './product.routes';
import { shippingAdminRouter } from './shipping.routes';

/** Mounted at `/api/admin`. */
export const adminRouter = Router();

// Every admin endpoint requires a valid token AND a back-office role — enforced here, server-side.
adminRouter.use(authenticate, requireRole('admin', 'demo_admin'));
adminRouter.use(denyDemoWrites); // the demo reviewer can look at everything but change nothing

adminRouter.get('/dashboard', getDashboard);

adminRouter.use('/products', productAdminRouter);
adminRouter.use('/categories', categoryAdminRouter);
adminRouter.use('/brands', brandAdminRouter);
adminRouter.use('/collections', collectionAdminRouter);
adminRouter.use('/coupons', couponAdminRouter);
adminRouter.use('/shipping-zones', shippingAdminRouter);

// orders (static `/new-count` is declared before `/:id`)
adminRouter.get('/orders', validate(adminListOrdersSchemas), listOrders);
adminRouter.get('/orders/new-count', validate(newOrdersSchemas), getNewOrdersCount);
adminRouter.get('/orders/:id', validate(adminOrderIdSchemas), getOrder);
adminRouter.post('/orders/:id/transition', validate(transitionOrderSchemas), transition);

// inventory
adminRouter.post('/inventory/adjust', validate(adjustStockSchemas), adjustStock);
adminRouter.get('/inventory/logs', validate(inventoryLogsSchemas), getInventoryLogs);

// customers
adminRouter.get('/customers', validate(listCustomersSchemas), listCustomers);
adminRouter.get('/customers/:id', validate(customerIdSchemas), getCustomer);
adminRouter.patch('/customers/:id/status', validate(customerStatusSchemas), setCustomerStatus);

// audit log + signed image uploads
adminRouter.get('/audit-logs', validate(auditLogsSchemas), getAuditLogs);
adminRouter.post('/uploads/sign', signUpload);
