import { z } from 'zod';
import { attributeKeySchema, idParams, localizedSchema, slugSchema } from './common.validators';
import { objectIdSchema } from '../utils/objectId';
import { ATTRIBUTE_TYPES } from '../models/Category';

const attributeValueSchema = z.object({
  value: z.string().trim().min(1).max(60),
  label: localizedSchema.optional(),
  swatch: z.string().trim().max(32).optional(),
});

export const attributeDefSchema = z
  .object({
    key: attributeKeySchema,
    label: localizedSchema,
    type: z.enum(ATTRIBUTE_TYPES).default('select'),
    values: z.array(attributeValueSchema).max(100).default([]),
    filterable: z.boolean().default(false),
    variantOption: z.boolean().default(false),
  })
  .refine((a) => !a.variantOption || a.values.length > 0, {
    message: 'A variant option needs at least one allowed value',
    path: ['values'],
  });

const attributesSchema = z
  .array(attributeDefSchema)
  .max(20)
  .refine((attrs) => new Set(attrs.map((a) => a.key)).size === attrs.length, {
    message: 'Attribute keys must be unique within a category',
  });

// NB: defaults exist on CREATE only. Zod 4 re-applies defaults inside .partial(), which would silently
// reset isActive/attributes/sortOrder on every PATCH.
const categoryFields = z.object({
  name: localizedSchema,
  slug: slugSchema,
  image: z.url(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
  attributes: attributesSchema,
});

export const createCategorySchemas = {
  body: categoryFields.partial({ slug: true, image: true }).extend({
    sortOrder: categoryFields.shape.sortOrder.default(0),
    isActive: categoryFields.shape.isActive.default(true),
    attributes: categoryFields.shape.attributes.default([]),
    parentId: objectIdSchema.nullable().default(null),
  }),
};

export const updateCategorySchemas = { params: idParams, body: categoryFields.partial() };

export const categoryIdSchemas = { params: idParams };

export const categorySlugSchemas = { params: z.object({ slug: slugSchema }) };
