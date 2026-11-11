import { model, Schema, type Types } from 'mongoose';

export interface CollectionAttrs {
  title: { ar: string; en: string };
  slug: string;
  description: { ar: string; en: string };
  image?: string;
  productIds: Types.ObjectId[];
  /** Pinned collections render on the home page, ordered by `sortOrder`. */
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const localized = { ar: { type: String, default: '' }, en: { type: String, default: '' } };

const collectionSchema = new Schema<CollectionAttrs>(
  {
    title: { type: localized, required: true, _id: false },
    slug: { type: String, required: true, unique: true },
    description: { type: localized, _id: false, default: () => ({ ar: '', en: '' }) },
    image: String,
    productIds: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const CollectionModel = model<CollectionAttrs>('Collection', collectionSchema);
