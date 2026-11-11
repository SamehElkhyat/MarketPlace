import type { RequestHandler } from 'express';
import { GOVERNORATES } from '../config/constants';
import { validated } from '../middleware/validate.middleware';
import { ShippingZoneModel } from '../models/ShippingZone';
import { recordAudit } from '../services/audit.service';
import { ApiError } from '../utils/ApiError';
import type { upsertZoneSchemas, zoneKeySchemas } from '../validators/shipping.validators';

const labelFor = (key: string) => GOVERNORATES.find((g) => g.key === key);

/** Public — checkout shows fees/ETAs per governorate. */
export const listZones: RequestHandler = async (_req, res) => {
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
};

// ── admin ────────────────────────────────────────────────────────────────────
export const listAllZones: RequestHandler = async (_req, res) => {
  res.json({ items: await ShippingZoneModel.find().sort({ governorate: 1 }).lean() });
};

export const upsertZone: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof upsertZoneSchemas>(req);
  const zone = await ShippingZoneModel.findOneAndUpdate(
    { governorate: params.governorate },
    { $set: body },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );
  await recordAudit(req, { action: 'shipping.upsert', entity: 'shipping_zone', entityId: params.governorate, meta: body });
  res.json({ zone });
};

export const deleteZone: RequestHandler = async (req, res) => {
  const { params } = validated<typeof zoneKeySchemas>(req);
  if (!(await ShippingZoneModel.findOneAndDelete({ governorate: params.governorate }))) {
    throw ApiError.notFound('Shipping zone');
  }
  await recordAudit(req, { action: 'shipping.delete', entity: 'shipping_zone', entityId: params.governorate });
  res.status(204).end();
};
