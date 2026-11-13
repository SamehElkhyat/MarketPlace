import { model, Schema, type Types } from 'mongoose';
import { PRODUCT_STATUSES, type ProductStatus } from '../config/constants';

export interface ProductImage {
  url: string;
  publicId?: string;
  alt?: string;
}

export interface ProductOption {
  key: string;
  values: string[];
}

export interface Variant {
  _id: Types.ObjectId;
  /** Globally unique stock-keeping unit. Carts and orders reference variants by SKU. */
  sku: string;
  optionValues: Record<string, string>;
  /** Integer piasters. */
  price: number;
  compareAtPrice?: number;
  stock: number;
}

export interface FilterAttr {
  k: string;
  v: string;
}

export interface ProductAttrs {
  title: { ar: string; en: string };
  slug: string;
  description: { ar: string; en: string };
  categoryId: Types.ObjectId;
  /** Every ancestor id + the category itself, so "all of Fashion" is one indexed query. */
  categoryPath: Types.ObjectId[];
  brandId?: Types.ObjectId;
  images: ProductImage[];
  /** Descriptive specs (not variant-defining), e.g. { material: 'cotton' }. */
  specs: Record<string, string>;
  options: ProductOption[];
  variants: Variant[];
  /** Denormalised, query-friendly facet pairs derived from options + filterable specs. */
  filterAttrs: FilterAttr[];
  /** Lowest variant price — denormalised for sorting/price filters. */
  minPrice: number;
  maxPrice: number;
  /** Normalised word list powering Arabic + English search and type-ahead. */
  searchKeywords: string[];
  tags: string[];
  status: ProductStatus;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const localized = { ar: { type: String, default: '' }, en: { type: String, default: '' } };

const variantSchema = new Schema<Variant>(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    optionValues: { type: Schema.Types.Mixed, default: {} },
    price: { type: Number, required: true, min: 0, validate: Number.isInteger },
    compareAtPrice: { type: Number, min: 0, validate: Number.isInteger },
    stock: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
  },
  // `minimize` is a per-schema option: the parent's `minimize: false` does not reach sub-schemas, so without
  // this a single-variant product (no options) is stored WITHOUT `optionValues` and clients receive undefined.
  { minimize: false },
);

const productSchema = new Schema<ProductAttrs>(
  {
    title: { type: localized, required: true, _id: false },
    slug: { type: String, required: true, unique: true },
    description: { type: localized, _id: false, default: () => ({ ar: '', en: '' }) },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    categoryPath: { type: [Schema.Types.ObjectId], required: true },
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand' },
    images: {
      type: [new Schema<ProductImage>({ url: { type: String, required: true }, publicId: String, alt: String }, { _id: false })],
      default: [],
    },
    specs: { type: Schema.Types.Mixed, default: {} },
    options: {
      type: [new Schema<ProductOption>({ key: { type: String, required: true }, values: [String] }, { _id: false })],
      default: [],
    },
    variants: { type: [variantSchema], validate: (v: unknown[]) => v.length > 0 },
    filterAttrs: {
      type: [new Schema<FilterAttr>({ k: String, v: String }, { _id: false })],
      default: [],
    },
    minPrice: { type: Number, required: true },
    maxPrice: { type: Number, required: true },
    searchKeywords: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'draft' },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);

// Listing pages: "everything in category X that is published", sorted newest / cheapest / best-selling.
productSchema.index({ categoryPath: 1, status: 1, createdAt: -1 });
productSchema.index({ categoryPath: 1, status: 1, minPrice: 1 });
productSchema.index({ categoryPath: 1, status: 1, soldCount: -1 });
productSchema.index({ brandId: 1, status: 1, createdAt: -1 });
productSchema.index({ status: 1, soldCount: -1 });
productSchema.index({ status: 1, createdAt: -1 });
// Facet filtering + search (anchored prefix regex on a multikey index).
productSchema.index({ 'filterAttrs.k': 1, 'filterAttrs.v': 1 });
productSchema.index({ searchKeywords: 1 });
// SKUs are globally unique; the cart/checkout look variants up by SKU.
productSchema.index({ 'variants.sku': 1 }, { unique: true });

export const ProductModel = model<ProductAttrs>('Product', productSchema);
