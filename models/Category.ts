import { model, Schema, type Types } from 'mongoose';

export const ATTRIBUTE_TYPES = ['select', 'color', 'text', 'number'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export interface AttributeValue {
  value: string;
  label?: { ar: string; en: string };
  /** Optional swatch (CSS color) for `color` attributes. */
  swatch?: string;
}

/**
 * A category-defined attribute. This is what makes the catalogue extensible without code changes:
 *  - `filterable`    → shows up as a sidebar facet on listing pages.
 *  - `variantOption` → products in this category build their variants from it (size, colour, RAM…).
 */
export interface AttributeDef {
  key: string;
  label: { ar: string; en: string };
  type: AttributeType;
  values: AttributeValue[];
  filterable: boolean;
  variantOption: boolean;
}

export interface CategoryAttrs {
  name: { ar: string; en: string };
  slug: string;
  parentId: Types.ObjectId | null;
  /** 1 = root, max 3. */
  level: number;
  /** Ancestor ids from the root down to (and including) this category. */
  path: Types.ObjectId[];
  image?: string;
  attributes: AttributeDef[];
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const localized = { ar: { type: String, required: true }, en: { type: String, required: true } };

const attributeSchema = new Schema<AttributeDef>(
  {
    key: { type: String, required: true, match: /^[a-z][a-z0-9_]{0,31}$/ },
    label: { type: localized, required: true, _id: false },
    type: { type: String, enum: ATTRIBUTE_TYPES, default: 'select' },
    values: {
      type: [
        new Schema<AttributeValue>(
          {
            value: { type: String, required: true },
            label: { type: { ar: String, en: String }, _id: false },
            swatch: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    filterable: { type: Boolean, default: false },
    variantOption: { type: Boolean, default: false },
  },
  { _id: false },
);

const categorySchema = new Schema<CategoryAttrs>(
  {
    name: { type: localized, required: true, _id: false },
    slug: { type: String, required: true, unique: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    level: { type: Number, required: true, min: 1, max: 3 },
    path: { type: [Schema.Types.ObjectId], default: [] },
    image: String,
    attributes: { type: [attributeSchema], default: [] },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

categorySchema.index({ path: 1 });

export const CategoryModel = model<CategoryAttrs>('Category', categorySchema);
