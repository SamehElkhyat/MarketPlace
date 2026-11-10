import type { PipelineStage, Types } from 'mongoose';
import { AppError } from '../../lib/errors';
import { escapeRegex, tokenize } from '../../lib/text';
import { BrandModel } from '../brands/brand.model';
import { CategoryModel, type AttributeDef, type AttributeValue } from '../categories/category.model';
import { mergeAttributes } from '../categories/category.service';
import { CollectionModel } from '../collections/collection.model';
import { ProductModel } from './product.model';
import type { ListProductsQuery } from './product.schemas';

type Clause = Record<string, unknown>;

/** Lightweight shape used by listing/search/related cards. */
export const CARD_PROJECTION = {
  title: 1,
  slug: 1,
  images: { $slice: ['$images', 2] },
  brandId: 1,
  minPrice: 1,
  maxPrice: 1,
  ratingAvg: 1,
  ratingCount: 1,
  options: 1,
  inStock: { $anyElementTrue: [{ $map: { input: '$variants', as: 'v', in: { $gt: ['$$v.stock', 0] } } }] },
  onSale: {
    $anyElementTrue: [{ $map: { input: '$variants', as: 'v', in: { $gt: ['$$v.compareAtPrice', '$$v.price'] } } }],
  },
} as const;

export interface ProductCard {
  id: string;
  title: { ar: string; en: string };
  slug: string;
  images: { url: string; alt?: string }[];
  brandId?: string;
  minPrice: number;
  maxPrice: number;
  ratingAvg: number;
  ratingCount: number;
  options: { key: string; values: string[] }[];
  inStock: boolean;
  onSale: boolean;
}

export interface CardRow extends Omit<ProductCard, 'id' | 'brandId'> {
  _id: Types.ObjectId;
  brandId?: Types.ObjectId;
}

export const toCard = ({ _id, brandId, ...rest }: CardRow): ProductCard => ({
  id: String(_id),
  ...(brandId ? { brandId: String(brandId) } : {}),
  ...rest,
});

const SORTS: Record<ListProductsQuery['sort'], Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  price_asc: { minPrice: 1 },
  price_desc: { maxPrice: -1 },
  bestselling: { soldCount: -1 },
  rating: { ratingAvg: -1, ratingCount: -1 },
};

const allOf = (clauses: Clause[]): Clause => (clauses.length > 0 ? { $and: clauses } : {});

/** Search = every typed word must prefix-match a normalised keyword (works for Arabic + English). */
const searchClauses = (q?: string): Clause[] =>
  tokenize(q ?? '').map((token) => ({ searchKeywords: { $regex: `^${escapeRegex(token)}` } }));

function parseAttrFilters(attr: string[] | undefined): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const pair of attr ?? []) {
    const idx = pair.indexOf(':');
    const key = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

export interface ListingFacets {
  brands: { id: string; slug: string; name: string; count: number }[];
  attributes: {
    key: string;
    label: AttributeDef['label'];
    type: AttributeDef['type'];
    values: { value: string; label?: { ar: string; en: string } | undefined; swatch?: string | undefined; count: number }[];
  }[];
  price: { min: number; max: number } | null;
}

interface FacetRow {
  items: CardRow[];
  total: { n: number }[];
  brands: { _id: Types.ObjectId | null; count: number }[];
  attrs: { _id: { k: string; v: string }; count: number }[];
  price: { min: number; max: number }[];
}

export async function listProducts(query: ListProductsQuery) {
  const base: Clause[] = [{ status: 'published' }];
  let attributeDefs: AttributeDef[] = [];

  if (query.category) {
    const category = await CategoryModel.findOne({ slug: query.category, isActive: true }).lean();
    if (!category) throw AppError.notFound('Category');
    base.push({ categoryPath: category._id });
    const chain = await CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean();
    attributeDefs = mergeAttributes(chain).filter((a) => a.filterable);
  }

  if (query.collection) {
    const collection = await CollectionModel.findOne({ slug: query.collection, isActive: true }).lean();
    if (!collection) throw AppError.notFound('Collection');
    base.push({ _id: { $in: collection.productIds } });
  }

  base.push(...searchClauses(query.q));
  if (query.rating) base.push({ ratingAvg: { $gte: query.rating } });
  if (query.inStock) base.push({ variants: { $elemMatch: { stock: { $gt: 0 } } } });
  if (query.onSale) base.push({ $expr: { $anyElementTrue: [{ $map: { input: '$variants', as: 'v', in: { $gt: ['$$v.compareAtPrice', '$$v.price'] } } }] } });

  // Filters that facets must be able to "exclude" (so a facet keeps showing its alternatives).
  const brandClause: Clause[] = [];
  if (query.brand?.length) {
    const brands = await BrandModel.find({ slug: { $in: query.brand } }).select('_id').lean();
    brandClause.push({ brandId: { $in: brands.map((b) => b._id) } });
  }
  const priceClauses: Clause[] = [];
  if (query.minPrice !== undefined) priceClauses.push({ maxPrice: { $gte: query.minPrice } });
  if (query.maxPrice !== undefined) priceClauses.push({ minPrice: { $lte: query.maxPrice } });

  const attrFilters = parseAttrFilters(query.attr);
  const attrClauses: Clause[] = [...attrFilters].map(([k, v]) => ({
    filterAttrs: { $elemMatch: { k, v: { $in: v } } },
  }));

  const everything = allOf([...brandClause, ...priceClauses, ...attrClauses]);
  const withoutBrand = allOf([...priceClauses, ...attrClauses]);
  const withoutAttrs = allOf([...brandClause, ...priceClauses]);
  const withoutPrice = allOf([...brandClause, ...attrClauses]);

  const pipeline: PipelineStage[] = [
    { $match: allOf(base) as never },
    {
      $facet: {
        items: [
          { $match: everything as never },
          { $sort: { ...SORTS[query.sort], _id: -1 } },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          { $project: CARD_PROJECTION as never },
        ],
        total: [{ $match: everything as never }, { $count: 'n' }],
        brands: [{ $match: withoutBrand as never }, { $group: { _id: '$brandId', count: { $sum: 1 } } }],
        attrs: [
          { $match: withoutAttrs as never },
          { $unwind: '$filterAttrs' },
          { $group: { _id: { k: '$filterAttrs.k', v: '$filterAttrs.v' }, count: { $sum: 1 } } },
        ],
        price: [
          { $match: withoutPrice as never },
          { $group: { _id: null, min: { $min: '$minPrice' }, max: { $max: '$maxPrice' } } },
        ],
      },
    },
  ];

  const [row] = await ProductModel.aggregate<FacetRow>(pipeline);
  const facet: FacetRow = row ?? { items: [], total: [], brands: [], attrs: [], price: [] };
  const total = facet.total[0]?.n ?? 0;

  const brandDocs = await BrandModel.find({ _id: { $in: facet.brands.map((b) => b._id).filter(Boolean) } })
    .select('name slug')
    .lean();
  const brandById = new Map(brandDocs.map((b) => [String(b._id), b]));

  const attrCounts = new Map<string, Map<string, number>>();
  for (const { _id, count } of facet.attrs) {
    const values = attrCounts.get(_id.k) ?? new Map<string, number>();
    values.set(_id.v, count);
    attrCounts.set(_id.k, values);
  }

  const facets: ListingFacets = {
    brands: facet.brands
      .flatMap(({ _id, count }) => {
        const brand = _id ? brandById.get(String(_id)) : undefined;
        return brand ? [{ id: String(brand._id), slug: brand.slug, name: brand.name, count }] : [];
      })
      .sort((a, b) => b.count - a.count),
    attributes: attributeDefs
      .map((def) => {
        const counts = attrCounts.get(def.key) ?? new Map<string, number>();
        const ordered: AttributeValue[] = def.values.length > 0 ? def.values : [...counts.keys()].map((value) => ({ value }));
        return {
          key: def.key,
          label: def.label,
          type: def.type,
          values: ordered
            .map((v) => ({
              value: v.value,
              label: v.label,
              swatch: v.swatch,
              count: counts.get(v.value) ?? 0,
            }))
            // keep selected values visible even when their count is 0
            .filter((v) => v.count > 0 || attrFilters.get(def.key)?.includes(v.value)),
        };
      })
      .filter((a) => a.values.length > 0),
    price: facet.price[0] ? { min: facet.price[0].min, max: facet.price[0].max } : null,
  };

  return {
    items: facet.items.map(toCard),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    facets,
  };
}

/** Type-ahead suggestions: anchored prefix match on the indexed, normalised keyword list. */
export async function suggestProducts(q: string, limit: number) {
  const clauses = searchClauses(q);
  if (clauses.length === 0) return [];
  const rows = await ProductModel.aggregate<CardRow>([
    { $match: { status: 'published', $and: clauses } },
    { $sort: { soldCount: -1, _id: -1 } },
    { $limit: limit },
    { $project: CARD_PROJECTION },
  ]);
  return rows.map(toCard);
}

export async function relatedProducts(categoryId: Types.ObjectId, excludeId: Types.ObjectId, limit = 8) {
  const rows = await ProductModel.aggregate<CardRow>([
    { $match: { status: 'published', categoryId, _id: { $ne: excludeId } } },
    { $sort: { soldCount: -1, _id: -1 } },
    { $limit: limit },
    { $project: CARD_PROJECTION },
  ]);
  return rows.map(toCard);
}
