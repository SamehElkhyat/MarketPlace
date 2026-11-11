import { Router } from 'express';
import { deleteZone, listAllZones, listZones, upsertZone } from '../controllers/shipping.controller';
import { validate } from '../middleware/validate.middleware';
import { upsertZoneSchemas, zoneKeySchemas } from '../validators/shipping.validators';

/** Public — mounted at `/api/shipping`. */
export const shippingRouter = Router();
shippingRouter.get('/zones', listZones);

/** Mounted under `/api/admin/shipping-zones`. */
export const shippingAdminRouter = Router();
shippingAdminRouter.get('/', listAllZones);
shippingAdminRouter.put('/:governorate', validate(upsertZoneSchemas), upsertZone);
shippingAdminRouter.delete('/:governorate', validate(zoneKeySchemas), deleteZone);
