import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate, validated } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { idParams, localizedOptionalLongSchema, slugSchema } from '../../lib/schemas';
import { uniqueSlug } from '../../lib/unique-slug';
import { revalidateStorefront } from '../../lib/revalidate';
import { recordAudit } from '../admin/audit.service';
import { ProductModel } from '../products/product.model';
import { BrandModel } from './brand.model';

const createSchemas = {
  body: z.object({
    name: z.string().trim().min(1).max(80),
    slug: slugSchema.optional(),
    logo: z.url().optional(),
    description: localizedOptionalLongSchema.optional(),
  }),
};
const updateSchemas = { params: idParams, body: createSchemas.body.partial() };
const idSchemas = { params: idParams };
const slugSchemas = { params: z.object({ slug: slugSchema }) };

/** Public. */
export const brandRouter = Router();

brandRouter.get('/', async (_req, res) => {
  res.json({ items: await BrandModel.find().sort({ name: 1 }).lean() });
});

brandRouter.get('/:slug', validate(slugSchemas), async (req, res) => {
  const { params } = validated<typeof slugSchemas>(req);
  const brand = await BrandModel.findOne({ slug: params.slug }).lean();
  if (!brand) throw AppError.notFound('Brand');
  res.json({ brand });
});

const create: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createSchemas>(req);
  const slug = body.slug ?? (await uniqueSlug(body.name, (s) => BrandModel.exists({ slug: s }).then(Boolean)));
  const brand = await BrandModel.create({ ...body, slug });
  await recordAudit(req, { action: 'brand.create', entity: 'brand', entityId: brand.id as string });
  revalidateStorefront(['brands', 'products']);
  res.status(201).json({ brand });
};

const update: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateSchemas>(req);
  const brand = await BrandModel.findByIdAndUpdate(params.id, { $set: body }, { returnDocument: 'after', runValidators: true });
  if (!brand) throw AppError.notFound('Brand');
  await recordAudit(req, { action: 'brand.update', entity: 'brand', entityId: params.id });
  revalidateStorefront(['brands', 'products']);
  res.json({ brand });
};

const remove: RequestHandler = async (req, res) => {
  const { params } = validated<typeof idSchemas>(req);
  if (await ProductModel.exists({ brandId: params.id })) throw AppError.conflict('This brand still has products');
  if (!(await BrandModel.findByIdAndDelete(params.id))) throw AppError.notFound('Brand');
  await recordAudit(req, { action: 'brand.delete', entity: 'brand', entityId: params.id });
  revalidateStorefront(['brands', 'products']);
  res.status(204).end();
};

export const brandAdminRouter = Router();
brandAdminRouter.get('/', async (_req, res) => {
  res.json({ items: await BrandModel.find().sort({ name: 1 }).lean() });
});
brandAdminRouter.post('/', validate(createSchemas), create);
brandAdminRouter.patch('/:id', validate(updateSchemas), update);
brandAdminRouter.delete('/:id', validate(idSchemas), remove);
