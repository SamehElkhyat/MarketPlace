import { model, Schema } from 'mongoose';

export interface BrandAttrs {
  name: string;
  slug: string;
  logo?: string;
  description: { ar: string; en: string };
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<BrandAttrs>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true },
    logo: String,
    description: {
      type: { ar: { type: String, default: '' }, en: { type: String, default: '' } },
      _id: false,
      default: () => ({ ar: '', en: '' }),
    },
  },
  { timestamps: true },
);

export const BrandModel = model<BrandAttrs>('Brand', brandSchema);
