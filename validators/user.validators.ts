import { z } from 'zod';
import { GOVERNORATE_KEYS } from '../config/constants';
import { objectIdSchema } from '../utils/objectId';
import { phoneSchema } from './common.validators';

const addressBody = z.object({
  label: z.string().trim().max(40).optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  governorate: z.enum(GOVERNORATE_KEYS),
  city: z.string().trim().min(2).max(80),
  street: z.string().trim().min(3).max(240),
  notes: z.string().trim().max(300).optional(),
  isDefault: z.boolean().default(false),
});

export const updateProfileSchemas = {
  body: z.object({ name: z.string().trim().min(2).max(120).optional(), locale: z.enum(['ar', 'en']).optional() }),
};
export const addAddressSchemas = { body: addressBody };
export const updateAddressSchemas = { params: z.object({ addressId: objectIdSchema }), body: addressBody };
export const addressIdSchemas = { params: z.object({ addressId: objectIdSchema }) };
export const wishlistSchemas = { params: z.object({ productId: objectIdSchema }) };
