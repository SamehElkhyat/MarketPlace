import type { RequestHandler } from 'express';
import { validated } from '../middleware/validate.middleware';
import { BrandModel } from '../models/Brand';
import { ProductModel } from '../models/Product';
import { recordAudit } from '../services/audit.service';
import { ApiError } from '../utils/ApiError';
import { revalidateStorefront } from '../utils/revalidate';
import { uniqueSlug } from '../utils/uniqueSlug';
import type {
  brandIdSchemas,
  brandSlugSchemas,
  createBrandSchemas,
  updateBrandSchemas,
} from '../validators/brand.validators';

// ── public (and the admin list, which is identical) ──────────────────────────
export const listBrands: RequestHandler = async (_req, res) => {
  res.json({ items: await BrandModel.find().sort({ name: 1 }).lean() });
};

export const getBrand: RequestHandler = async (req, res) => {
  const { params } = validated<typeof brandSlugSchemas>(req);
  const brand = await BrandModel.findOne({ slug: params.slug }).lean();
  if (!brand) throw ApiError.notFound('Brand');
  res.json({ brand });
};

// ── admin ────────────────────────────────────────────────────────────────────
export const createBrand: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createBrandSchemas>(req);
  const slug = body.slug ?? (await uniqueSlug(body.name, (s) => BrandModel.exists({ slug: s }).then(Boolean)));
  const brand = await BrandModel.create({ ...body, slug });
  await recordAudit(req, { action: 'brand.create', entity: 'brand', entityId: brand.id as string });
  revalidateStorefront(['brands', 'products']);
  res.status(201).json({ brand });
};

export const updateBrand: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateBrandSchemas>(req);
  const brand = await BrandModel.findByIdAndUpdate(params.id, { $set: body }, { returnDocument: 'after', runValidators: true });
  if (!brand) throw ApiError.notFound('Brand');
  await recordAudit(req, { action: 'brand.update', entity: 'brand', entityId: params.id });
  revalidateStorefront(['brands', 'products']);
  res.json({ brand });
};

export const deleteBrand: RequestHandler = async (req, res) => {
  const { params } = validated<typeof brandIdSchemas>(req);
  if (await ProductModel.exists({ brandId: params.id })) throw ApiError.conflict('This brand still has products');
  if (!(await BrandModel.findByIdAndDelete(params.id))) throw ApiError.notFound('Brand');
  await recordAudit(req, { action: 'brand.delete', entity: 'brand', entityId: params.id });
  revalidateStorefront(['brands', 'products']);
  res.status(204).end();
};
