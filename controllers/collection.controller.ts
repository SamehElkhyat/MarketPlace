import type { RequestHandler } from 'express';
import { validated } from '../middleware/validate.middleware';
import { CollectionModel } from '../models/Collection';
import { ProductModel } from '../models/Product';
import { recordAudit } from '../services/audit.service';
import { CARD_PROJECTION, toCard, type CardRow } from '../services/productQuery.service';
import { ApiError } from '../utils/ApiError';
import { revalidateStorefront } from '../utils/revalidate';
import { uniqueSlug } from '../utils/uniqueSlug';
import type {
  collectionIdSchemas,
  collectionSlugSchemas,
  createCollectionSchemas,
  updateCollectionSchemas,
} from '../validators/collection.validators';

/**
 * Collections are admin-curated product sets ("New arrivals", "Best sellers", "On sale").
 * Listing pages reuse the product query with `?collection=slug`; these endpoints serve metadata + a preview.
 */
export const listCollections: RequestHandler = async (_req, res) => {
  const items = await CollectionModel.find({ isActive: true }).sort({ sortOrder: 1 }).select('-productIds').lean();
  res.json({ items });
};

export const getCollection: RequestHandler = async (req, res) => {
  const { params } = validated<typeof collectionSlugSchemas>(req);
  const collection = await CollectionModel.findOne({ slug: params.slug, isActive: true }).lean();
  if (!collection) throw ApiError.notFound('Collection');

  const preview = await ProductModel.aggregate<CardRow>([
    { $match: { _id: { $in: collection.productIds.slice(0, 12) }, status: 'published' } },
    { $project: CARD_PROJECTION as never },
  ]);
  const { productIds: _omit, ...meta } = collection;
  res.json({ collection: meta, preview: preview.map(toCard) });
};

// ── admin ────────────────────────────────────────────────────────────────────
export const listAllCollections: RequestHandler = async (_req, res) => {
  res.json({ items: await CollectionModel.find().sort({ sortOrder: 1 }).lean() });
};

export const createCollection: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createCollectionSchemas>(req);
  const slug = body.slug ?? (await uniqueSlug(body.title.en, (s) => CollectionModel.exists({ slug: s }).then(Boolean)));
  const collection = await CollectionModel.create({ ...body, slug });
  await recordAudit(req, { action: 'collection.create', entity: 'collection', entityId: collection.id as string });
  revalidateStorefront(['collections']);
  res.status(201).json({ collection });
};

export const updateCollection: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateCollectionSchemas>(req);
  const collection = await CollectionModel.findByIdAndUpdate(params.id, { $set: body }, { returnDocument: 'after', runValidators: true });
  if (!collection) throw ApiError.notFound('Collection');
  await recordAudit(req, { action: 'collection.update', entity: 'collection', entityId: params.id });
  revalidateStorefront(['collections']);
  res.json({ collection });
};

export const deleteCollection: RequestHandler = async (req, res) => {
  const { params } = validated<typeof collectionIdSchemas>(req);
  if (!(await CollectionModel.findByIdAndDelete(params.id))) throw ApiError.notFound('Collection');
  await recordAudit(req, { action: 'collection.delete', entity: 'collection', entityId: params.id });
  revalidateStorefront(['collections']);
  res.status(204).end();
};
