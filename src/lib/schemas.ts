import { z } from 'zod';
import { objectIdSchema } from './object-id';

/** Shared, reusable Zod building blocks. */

export const localizedSchema = z.object({
  ar: z.string().trim().min(1).max(200),
  en: z.string().trim().min(1).max(200),
});
export type Localized = z.infer<typeof localizedSchema>;

export const localizedOptionalLongSchema = z.object({
  ar: z.string().trim().max(5000).default(''),
  en: z.string().trim().max(5000).default(''),
});

export const piastersSchema = z.number().int().nonnegative().max(1_000_000_000);

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, 'Invalid slug');

/** Attribute / option keys are used as Mongo field names, so keep them tame. */
export const attributeKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'Invalid key');

export const idParams = z.object({ id: objectIdSchema });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function toPage<T>(items: T[], total: number, { page, limit }: PaginationQuery): Page<T> {
  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export const phoneSchema = z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
