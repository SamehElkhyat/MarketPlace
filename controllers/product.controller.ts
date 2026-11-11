import type { RequestHandler } from 'express';
import { validated } from '../middleware/validate.middleware';
import { recordAudit } from '../services/audit.service';
import { productService } from '../services/product.service';
import { importProducts } from '../services/productImport.service';
import { listProducts, suggestProducts } from '../services/productQuery.service';
import type {
  adminListProductsSchemas,
  createProductSchemas,
  importProductsSchemas,
  listProductsSchemas,
  productIdSchemas,
  productSlugSchemas,
  suggestSchemas,
  updateProductSchemas,
} from '../validators/product.validators';

// ── public ───────────────────────────────────────────────────────────────────
export const listPublicProducts: RequestHandler = async (req, res) => {
  const { query } = validated<typeof listProductsSchemas>(req);
  res.json(await listProducts(query));
};

export const suggest: RequestHandler = async (req, res) => {
  const { query } = validated<typeof suggestSchemas>(req);
  res.json({ items: await suggestProducts(query.q, query.limit) });
};

export const getProduct: RequestHandler = async (req, res) => {
  const { params } = validated<typeof productSlugSchemas>(req);
  res.json(await productService.getBySlug(params.slug));
};

// ── admin ────────────────────────────────────────────────────────────────────
export const listAdminProducts: RequestHandler = async (req, res) => {
  const { query } = validated<typeof adminListProductsSchemas>(req);
  res.json(await productService.listAdmin(query));
};

export const getAdminProduct: RequestHandler = async (req, res) => {
  const { params } = validated<typeof productIdSchemas>(req);
  res.json({ product: await productService.getAdmin(params.id) });
};

export const createProduct: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createProductSchemas>(req);
  const product = await productService.create(body);
  await recordAudit(req, { action: 'product.create', entity: 'product', entityId: product.id as string });
  res.status(201).json({ product });
};

export const updateProduct: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateProductSchemas>(req);
  const product = await productService.update(params.id, body);
  await recordAudit(req, { action: 'product.update', entity: 'product', entityId: params.id });
  res.json({ product });
};

export const deleteProduct: RequestHandler = async (req, res) => {
  const { params } = validated<typeof productIdSchemas>(req);
  const outcome = await productService.remove(params.id);
  await recordAudit(req, { action: `product.${outcome}`, entity: 'product', entityId: params.id });
  res.json({ outcome });
};

/** The browser parses the CSV; the API validates every row and reports per-row errors. */
export const importAdminProducts: RequestHandler = async (req, res) => {
  const { body } = validated<typeof importProductsSchemas>(req);
  const results = await importProducts(body.rows);
  await recordAudit(req, {
    action: 'product.import',
    entity: 'product',
    meta: { rows: body.rows.length, created: results.filter((r) => r.ok).length },
  });
  res.json({ results });
};
