import { Router } from 'express';
import { createBrand, deleteBrand, getBrand, listBrands, updateBrand } from '../controllers/brand.controller';
import { validate } from '../middleware/validate.middleware';
import {
  brandIdSchemas,
  brandSlugSchemas,
  createBrandSchemas,
  updateBrandSchemas,
} from '../validators/brand.validators';

/** Public — mounted at `/api/brands`. */
export const brandRouter = Router();
brandRouter.get('/', listBrands);
brandRouter.get('/:slug', validate(brandSlugSchemas), getBrand);

/** Mounted under `/api/admin/brands`. */
export const brandAdminRouter = Router();
brandAdminRouter.get('/', listBrands);
brandAdminRouter.post('/', validate(createBrandSchemas), createBrand);
brandAdminRouter.patch('/:id', validate(updateBrandSchemas), updateBrand);
brandAdminRouter.delete('/:id', validate(brandIdSchemas), deleteBrand);
