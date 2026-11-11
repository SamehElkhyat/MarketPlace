import { z } from 'zod';
import { GOVERNORATE_KEYS } from '../config/constants';
import { piastersSchema } from './common.validators';

export const upsertZoneSchemas = {
  params: z.object({ governorate: z.enum(GOVERNORATE_KEYS) }),
  body: z
    .object({
      fee: piastersSchema,
      estimatedDays: z.object({ min: z.number().int().min(0).max(30), max: z.number().int().min(0).max(30) }),
      isActive: z.boolean().default(true),
    })
    .refine((b) => b.estimatedDays.min <= b.estimatedDays.max, { message: 'min must be ≤ max' }),
};
export const zoneKeySchemas = { params: upsertZoneSchemas.params };
