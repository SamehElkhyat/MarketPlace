import { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  getCategoryDetails,
  getCategoryTree,
  listCategories,
  updateCategory,
} from '../controllers/category.controller';
import { validate } from '../middleware/validate.middleware';
import {
  categoryIdSchemas,
  categorySlugSchemas,
  createCategorySchemas,
  updateCategorySchemas,
} from '../validators/category.validators';

/** Public catalogue endpoints — mounted at `/api/categories`. */
export const categoryRouter = Router();
categoryRouter.get('/', getCategoryTree);
categoryRouter.get('/:slug', validate(categorySlugSchemas), getCategoryDetails);

/** Mounted under `/api/admin/categories` (already behind authenticate + requireRole). */
export const categoryAdminRouter = Router();
categoryAdminRouter.get('/', listCategories);
categoryAdminRouter.post('/', validate(createCategorySchemas), createCategory);
categoryAdminRouter.patch('/:id', validate(updateCategorySchemas), updateCategory);
categoryAdminRouter.delete('/:id', validate(categoryIdSchemas), deleteCategory);
