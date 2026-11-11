import type { RequestHandler } from 'express';
import { validated } from '../middleware/validate.middleware';
import { categoryService } from '../services/category.service';
import { recordAudit } from '../services/audit.service';
import { revalidateStorefront } from '../utils/revalidate';
import type {
  categoryIdSchemas,
  categorySlugSchemas,
  createCategorySchemas,
  updateCategorySchemas,
} from '../validators/category.validators';

// ── public ───────────────────────────────────────────────────────────────────
export const getCategoryTree: RequestHandler = async (_req, res) => {
  res.json({ items: await categoryService.tree() });
};

export const getCategoryDetails: RequestHandler = async (req, res) => {
  const { params } = validated<typeof categorySlugSchemas>(req);
  res.json(await categoryService.getDetailsBySlug(params.slug));
};

// ── admin ────────────────────────────────────────────────────────────────────
export const listCategories: RequestHandler = async (_req, res) => {
  res.json({ items: await categoryService.listAll() });
};

export const createCategory: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createCategorySchemas>(req);
  const category = await categoryService.create(body);
  await recordAudit(req, { action: 'category.create', entity: 'category', entityId: category.id as string });
  revalidateStorefront(['categories']);
  res.status(201).json({ category });
};

export const updateCategory: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateCategorySchemas>(req);
  const category = await categoryService.update(params.id, body);
  await recordAudit(req, { action: 'category.update', entity: 'category', entityId: params.id });
  revalidateStorefront(['categories', 'products']);
  res.json({ category });
};

export const deleteCategory: RequestHandler = async (req, res) => {
  const { params } = validated<typeof categoryIdSchemas>(req);
  await categoryService.remove(params.id);
  await recordAudit(req, { action: 'category.delete', entity: 'category', entityId: params.id });
  revalidateStorefront(['categories']);
  res.status(204).end();
};
