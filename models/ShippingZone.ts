import { model, Schema } from 'mongoose';

export interface ShippingZoneAttrs {
  governorate: string;
  /** Integer piasters. */
  fee: number;
  estimatedDays: { min: number; max: number };
  isActive: boolean;
}

const shippingZoneSchema = new Schema<ShippingZoneAttrs>(
  {
    governorate: { type: String, required: true, unique: true },
    fee: { type: Number, required: true, min: 0, validate: Number.isInteger },
    estimatedDays: {
      type: { min: { type: Number, required: true }, max: { type: Number, required: true } },
      _id: false,
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const ShippingZoneModel = model<ShippingZoneAttrs>('ShippingZone', shippingZoneSchema);
