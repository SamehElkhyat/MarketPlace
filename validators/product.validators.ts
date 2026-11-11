import { z } from 'zod';
import { PRODUCT_STATUSES } from '../config/constants';
import { objectIdSchema } from '../utils/objectId';
import {
  attributeKeySchema,
  idParams,
  localizedOptionalLongSchema,
  localizedSchema,
  paginationQuery,
  piastersSchema,
  slugSchema,
} from './common.validators';

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'SKU must be 2–40 chars: letters, digits, "-" or "_"');

export const variantInputSchema = z.object({
  sku: skuSchema,
  optionValues: z.record(attributeKeySchema, z.string().trim().min(1).max(60)).default({}),
  price: piastersSchema,
  compareAtPrice: piastersSchema.optional(),
  /** Initial stock for NEW variants only. Existing variants keep their live stock (use inventory adjust). */
  stock: z.number().int().min(0).max(1_000_000).default(0),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

const imageSchema = z.object({
  url: z.url(),
  publicId: z.string().max(200).optional(),
  alt: z.string().max(200).optional(),
});

export const productBodySchema = z.object({
  title: localizedSchema,
  slug: slugSchema.optional(),
  description: localizedOptionalLongSchema.default({ ar: '', en: '' }),
  categoryId: objectIdSchema,
  brandId: objectIdSchema.optional(),
  images: z.array(imageSchema).max(12).default([]),
  specs: z.record(attributeKeySchema, z.string().trim().max(200)).default({}),
  options: z
    .array(z.object({ key: attributeKeySchema, values: z.array(z.string().trim().min(1).max(60)).min(1).max(50) }))
    .max(5)
    .default([]),
  variants: z.array(variantInputSchema).min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  status: z.enum(PRODUCT_STATUSES).default('draft'),
});
export type ProductInput = z.infer<typeof productBodySchema>;

export const createProductSchemas = { body: productBodySchema };
export const updateProductSchemas = { params: idParams, body: productBodySchema };
export const productIdSchemas = { params: idParams };
export const productSlugSchemas = { params: z.object({ slug: slugSchema }) };

const csvList = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.string().max(80)).max(30));

const oneOrMany = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema)]).transform((v) => (Array.isArray(v) ? v : [v]));

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'bestselling', 'rating'] as const;

export const listProductsSchemas = {
  query: paginationQuery.extend({
    limit: z.coerce.number().int().min(1).max(60).default(24),
    q: z.string().trim().max(100).optional(),
    category: slugSchema.optional(),
    brand: csvList.optional(),
    collection: slugSchema.optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    rating: z.coerce.number().min(1).max(5).optional(),
    inStock: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    onSale: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    /** Repeatable `attr=key:value` pairs (e.g. `attr=size:M&attr=color:black`). */
    attr: oneOrMany(z.string().regex(/^[a-z][a-z0-9_]{0,31}:.{1,60}$/)).optional(),
    sort: z.enum(PRODUCT_SORTS).default('newest'),
  }),
};
export type ListProductsQuery = z.infer<typeof listProductsSchemas.query>;

export const suggestSchemas = {
  query: z.object({ q: z.string().trim().min(1).max(60), limit: z.coerce.number().int().min(1).max(10).default(6) }),
};

export const adminListProductsSchemas = {
  query: paginationQuery.extend({
    q: z.string().trim().max(100).optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    category: objectIdSchema.optional(),
    lowStock: z.coerce.number().int().min(0).max(1000).optional(),
  }),
};

/** CSV import: the browser parses the file, the API validates up to 500 rows. */
export const importProductsSchemas = { body: z.object({ rows: z.array(z.record(z.string(), z.string())).min(1).max(500) }) };
