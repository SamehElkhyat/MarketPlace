import { z } from 'zod';
import { objectIdSchema } from '../utils/objectId';
import { paginationQuery } from './common.validators';

export const listReviewsSchemas = { query: paginationQuery.extend({ productId: objectIdSchema }) };
export const createReviewSchemas = {
  body: z.object({
    productId: objectIdSchema,
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional(),
    comment: z.string().trim().min(3).max(2000),
  }),
};
export const eligibilitySchemas = { params: z.object({ productId: objectIdSchema }) };
