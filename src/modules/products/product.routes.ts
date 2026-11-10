import { Router, type RequestHandler } from 'express';
import { validate, validated } from '../../http/validate';
import { recordAudit } from '../admin/audit.service';
import { listProducts, suggestProducts } from './product.query';
import {
  adminListProductsSchemas,
  createProductSchemas,
  listProductsSchemas,
  productIdSchemas,
  productSlugSchemas,
  suggestSchemas,
  updateProductSchemas,
} from './product.schemas';
import { productService } from './product.service';

const list: RequestHandler = async (req, res) => {
  const { query } = validated<typeof listProductsSchemas>(req);
  res.json(await listProducts(query));
};

const suggest: RequestHandler = async (req, res) => {
  const { query } = validated<typeof suggestSchemas>(req);
  res.json({ items: await suggestProducts(query.q, query.limit) });
};

const detail: RequestHandler = async (req, res) => {
  const { params } = validated<typeof productSlugSchemas>(req);
  res.json(await productService.getBySlug(params.slug));
};

/** Public catalogue endpoints (`/api/products`). Static routes are declared before `/:slug`. */
export const productRouter = Router();
productRouter.get('/', validate(listProductsSchemas), list);
productRouter.get('/suggest', validate(suggestSchemas), suggest);
productRouter.get('/:slug', validate(productSlugSchemas), detail);

const adminList: RequestHandler = async (req, res) => {
  const { query } = validated<typeof adminListProductsSchemas>(req);
  res.json(await productService.listAdmin(query));
};

const adminGet: RequestHandler = async (req, res) => {
  const { params } = validated<typeof productIdSchemas>(req);
  res.json({ product: await productService.getAdmin(params.id) });
};

const create: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createProductSchemas>(req);
  const product = await productService.create(body);
  await recordAudit(req, { action: 'product.create', entity: 'product', entityId: product.id as string });
  res.status(201).json({ product });
};

const update: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateProductSchemas>(req);
  const product = await productService.update(params.id, body);
  await recordAudit(req, { action: 'product.update', entity: 'product', entityId: params.id });
  res.json({ product });
};

const remove: RequestHandler = async (req, res) => {
  const { params } = validated<typeof productIdSchemas>(req);
  const outcome = await productService.remove(params.id);
  await recordAudit(req, { action: `product.${outcome}`, entity: 'product', entityId: params.id });
  res.json({ outcome });
};

/** Mounted under `/api/admin/products`. */
export const productAdminRouter = Router();
productAdminRouter.get('/', validate(adminListProductsSchemas), adminList);
productAdminRouter.post('/', validate(createProductSchemas), create);
productAdminRouter.get('/:id', validate(productIdSchemas), adminGet);
productAdminRouter.put('/:id', validate(updateProductSchemas), update);
productAdminRouter.delete('/:id', validate(productIdSchemas), remove);
