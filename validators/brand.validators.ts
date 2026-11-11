import { z } from 'zod';
import { idParams, localizedOptionalLongSchema, slugSchema } from './common.validators';

export const createBrandSchemas = {
  body: z.object({
    name: z.string().trim().min(1).max(80),
    slug: slugSchema.optional(),
    logo: z.url().optional(),
    description: localizedOptionalLongSchema.optional(),
  }),
};
export const updateBrandSchemas = { params: idParams, body: createBrandSchemas.body.partial() };
export const brandIdSchemas = { params: idParams };
export const brandSlugSchemas = { params: z.object({ slug: slugSchema }) };
