import { Router } from 'express';
import { z } from 'zod';
import { GOVERNORATE_KEYS, GOVERNORATES } from '../../config/constants';
import { validate, validated } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { piastersSchema } from '../../lib/schemas';
import { recordAudit } from '../admin/audit.service';
import { ShippingZoneModel } from './shipping-zone.model';

const labelFor = (key: string) => GOVERNORATES.find((g) => g.key === key);

/** Public — checkout shows fees/ETAs per governorate. */
export const shippingRouter = Router();
shippingRouter.get('/zones', async (_req, res) => {
  const zones = await ShippingZoneModel.find({ isActive: true }).lean();
  res.json({
    items: zones
      .map((z) => ({
        governorate: z.governorate,
        name: labelFor(z.governorate) ?? { ar: z.governorate, en: z.governorate },
        fee: z.fee,
        estimatedDays: z.estimatedDays,
      }))
      .sort((a, b) => a.name.en.localeCompare(b.name.en)),
  });
});

const upsertSchemas = {
  params: z.object({ governorate: z.enum(GOVERNORATE_KEYS) }),
  body: z
    .object({
      fee: piastersSchema,
      estimatedDays: z.object({ min: z.number().int().min(0).max(30), max: z.number().int().min(0).max(30) }),
      isActive: z.boolean().default(true),
    })
    .refine((b) => b.estimatedDays.min <= b.estimatedDays.max, { message: 'min must be ≤ max' }),
};

export const shippingAdminRouter = Router();
shippingAdminRouter.get('/', async (_req, res) => {
  res.json({ items: await ShippingZoneModel.find().sort({ governorate: 1 }).lean() });
});
shippingAdminRouter.put('/:governorate', validate(upsertSchemas), async (req, res) => {
  const { params, body } = validated<typeof upsertSchemas>(req);
  const zone = await ShippingZoneModel.findOneAndUpdate(
    { governorate: params.governorate },
    { $set: body },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  await recordAudit(req, { action: 'shipping.upsert', entity: 'shipping_zone', entityId: params.governorate, meta: body });
  res.json({ zone });
});
shippingAdminRouter.delete('/:governorate', validate({ params: upsertSchemas.params }), async (req, res) => {
  const { params } = validated<{ params: typeof upsertSchemas.params }>(req);
  if (!(await ShippingZoneModel.findOneAndDelete({ governorate: params.governorate }))) throw AppError.notFound('Shipping zone');
  await recordAudit(req, { action: 'shipping.delete', entity: 'shipping_zone', entityId: params.governorate });
  res.status(204).end();
});
