import { z } from 'zod';
import { objectIdSchema } from '../utils/objectId';
import { idParams, localizedOptionalLongSchema, localizedSchema, slugSchema } from './common.validators';

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
export const createCollectionSchemas = {
  body: fields.partial({ slug: true, description: true, image: true }).extend({
    productIds: fields.shape.productIds.default([]),
    sortOrder: fields.shape.sortOrder.default(0),
    isActive: fields.shape.isActive.default(true),
  }),
};
export const updateCollectionSchemas = { params: idParams, body: fields.partial() };
export const collectionIdSchemas = { params: idParams };
export const collectionSlugSchemas = { params: z.object({ slug: slugSchema }) };
