import { Router } from 'express';
import {
  createProduct,
  deleteProduct,
  getAdminProduct,
  getProduct,
  importAdminProducts,
  listAdminProducts,
  listPublicProducts,
  suggest,
  updateProduct,
} from '../controllers/product.controller';
import { validate } from '../middleware/validate.middleware';
import {
  adminListProductsSchemas,
  createProductSchemas,
  importProductsSchemas,
  listProductsSchemas,
  productIdSchemas,
  productSlugSchemas,
  suggestSchemas,
  updateProductSchemas,
} from '../validators/product.validators';

/** Public catalogue — mounted at `/api/products`. Static paths are declared before `/:slug`. */
export const productRouter = Router();
productRouter.get('/', validate(listProductsSchemas), listPublicProducts);
productRouter.get('/suggest', validate(suggestSchemas), suggest);
productRouter.get('/:slug', validate(productSlugSchemas), getProduct);

/** Mounted under `/api/admin/products`. */
export const productAdminRouter = Router();
productAdminRouter.get('/', validate(adminListProductsSchemas), listAdminProducts);
productAdminRouter.post('/', validate(createProductSchemas), createProduct);
productAdminRouter.post('/import', validate(importProductsSchemas), importAdminProducts);
productAdminRouter.get('/:id', validate(productIdSchemas), getAdminProduct);
productAdminRouter.put('/:id', validate(updateProductSchemas), updateProduct);
productAdminRouter.delete('/:id', validate(productIdSchemas), deleteProduct);
