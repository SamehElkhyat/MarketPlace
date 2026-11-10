import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate, validated } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { objectIdSchema } from '../../lib/object-id';
import { idParams, localizedOptionalLongSchema, localizedSchema, slugSchema } from '../../lib/schemas';
import { uniqueSlug } from '../../lib/unique-slug';
import { revalidateStorefront } from '../../lib/revalidate';
import { recordAudit } from '../admin/audit.service';
import { ProductModel } from '../products/product.model';
import { CARD_PROJECTION, toCard, type CardRow } from '../products/product.query';
import { CollectionModel } from './collection.model';

const fields = z.object({
  title: localizedSchema,
  slug: slugSchema,
  description: localizedOptionalLongSchema,
  image: z.url(),
  productIds: z.array(objectIdSchema).max(200),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
});
// Defaults on CREATE only (Zod 4 re-applies defaults inside .partial(), which would reset fields on PATCH).
const createSchemas = {
  body: fields.partial({ slug: true, description: true, image: true }).extend({
    productIds: fields.shape.productIds.default([]),
    sortOrder: fields.shape.sortOrder.default(0),
    isActive: fields.shape.isActive.default(true),
  }),
};
const updateSchemas = { params: idParams, body: fields.partial() };
const idSchemas = { params: idParams };
const slugSchemas = { params: z.object({ slug: slugSchema }) };

/**
 * Collections are admin-curated product sets ("New arrivals", "Best sellers", "On sale").
 * Listing pages reuse the product query with `?collection=slug`; these endpoints serve metadata + a preview.
 */
export const collectionRouter = Router();

collectionRouter.get('/', async (_req, res) => {
  const items = await CollectionModel.find({ isActive: true })
    .sort({ sortOrder: 1 })
    .select('-productIds')
    .lean();
  res.json({ items });
});

collectionRouter.get('/:slug', validate(slugSchemas), async (req, res) => {
  const { params } = validated<typeof slugSchemas>(req);
  const collection = await CollectionModel.findOne({ slug: params.slug, isActive: true }).lean();
  if (!collection) throw AppError.notFound('Collection');

  const preview = await ProductModel.aggregate<CardRow>([
    { $match: { _id: { $in: collection.productIds.slice(0, 12) }, status: 'published' } },
    { $project: CARD_PROJECTION as never },
  ]);
  const { productIds: _omit, ...meta } = collection;
  res.json({ collection: meta, preview: preview.map(toCard) });
});

const create: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createSchemas>(req);
  const slug = body.slug ?? (await uniqueSlug(body.title.en, (s) => CollectionModel.exists({ slug: s }).then(Boolean)));
  const collection = await CollectionModel.create({ ...body, slug });
  await recordAudit(req, { action: 'collection.create', entity: 'collection', entityId: collection.id as string });
  revalidateStorefront(['collections']);
  res.status(201).json({ collection });
};

const update: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateSchemas>(req);
  const collection = await CollectionModel.findByIdAndUpdate(params.id, { $set: body }, { returnDocument: 'after', runValidators: true });
  if (!collection) throw AppError.notFound('Collection');
  await recordAudit(req, { action: 'collection.update', entity: 'collection', entityId: params.id });
  revalidateStorefront(['collections']);
  res.json({ collection });
};

const remove: RequestHandler = async (req, res) => {
  const { params } = validated<typeof idSchemas>(req);
  if (!(await CollectionModel.findByIdAndDelete(params.id))) throw AppError.notFound('Collection');
  await recordAudit(req, { action: 'collection.delete', entity: 'collection', entityId: params.id });
  revalidateStorefront(['collections']);
  res.status(204).end();
};

export const collectionAdminRouter = Router();
collectionAdminRouter.get('/', async (_req, res) => {
  res.json({ items: await CollectionModel.find().sort({ sortOrder: 1 }).lean() });
});
collectionAdminRouter.post('/', validate(createSchemas), create);
collectionAdminRouter.patch('/:id', validate(updateSchemas), update);
collectionAdminRouter.delete('/:id', validate(idSchemas), remove);
