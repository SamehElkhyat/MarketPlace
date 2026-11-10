import { Router, type RequestHandler } from 'express';
import { revalidateStorefront } from '../../lib/revalidate';
import { recordAudit } from '../admin/audit.service';
import { validate, validated } from '../../http/validate';
import {
  categoryIdSchemas,
  categorySlugSchemas,
  createCategorySchemas,
  updateCategorySchemas,
} from './category.schemas';
import { categoryService } from './category.service';

const tree: RequestHandler = async (_req, res) => {
  res.json({ items: await categoryService.tree() });
};

const details: RequestHandler = async (req, res) => {
  const { params } = validated<typeof categorySlugSchemas>(req);
  res.json(await categoryService.getDetailsBySlug(params.slug));
};

/** Public catalogue endpoints. */
export const categoryRouter = Router();
categoryRouter.get('/', tree);
categoryRouter.get('/:slug', validate(categorySlugSchemas), details);

const list: RequestHandler = async (_req, res) => {
  res.json({ items: await categoryService.listAll() });
};

const create: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createCategorySchemas>(req);
  const category = await categoryService.create(body);
  await recordAudit(req, { action: 'category.create', entity: 'category', entityId: category.id as string });
  revalidateStorefront(['categories']);
  res.status(201).json({ category });
};

const update: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateCategorySchemas>(req);
  const category = await categoryService.update(params.id, body);
  await recordAudit(req, { action: 'category.update', entity: 'category', entityId: params.id });
  revalidateStorefront(['categories', 'products']);
  res.json({ category });
};

const remove: RequestHandler = async (req, res) => {
  const { params } = validated<typeof categoryIdSchemas>(req);
  await categoryService.remove(params.id);
  await recordAudit(req, { action: 'category.delete', entity: 'category', entityId: params.id });
  revalidateStorefront(['categories']);
  res.status(204).end();
};

/** Mounted under `/api/admin/categories` (already behind authenticate + requireRole('admin')). */
export const categoryAdminRouter = Router();
categoryAdminRouter.get('/', list);
categoryAdminRouter.post('/', validate(createCategorySchemas), create);
categoryAdminRouter.patch('/:id', validate(updateCategorySchemas), update);
categoryAdminRouter.delete('/:id', validate(categoryIdSchemas), remove);
