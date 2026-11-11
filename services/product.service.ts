import { Types, type QueryFilter } from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { revalidateStorefront } from '../utils/revalidate';
import { escapeRegex, tokenize } from '../utils/text';
import { uniqueSlug } from '../utils/uniqueSlug';
import { BrandModel } from '../models/Brand';
import { CategoryModel } from '../models/Category';
import { categoryService } from './category.service';
import { InventoryLogModel } from '../models/InventoryLog';
import { OrderModel } from '../models/Order';
import { ReviewModel } from '../models/Review';
import { validateAndDerive } from './productBuilder.service';
import { ProductModel, type ProductAttrs } from '../models/Product';
import { relatedProducts } from './productQuery.service';
import type { ProductInput } from '../validators/product.validators';

const revalidate = (slug: string) => revalidateStorefront(['products', `product:${slug}`]);

/** Loads everything a product must be validated against. */
async function resolveContext(input: ProductInput) {
  const category = await CategoryModel.findById(input.categoryId).lean();
  if (!category) throw ApiError.notFound('Category');

  const [attributes, brand, ancestors] = await Promise.all([
    categoryService.effectiveAttributes(category),
    input.brandId ? BrandModel.findById(input.brandId).lean() : Promise.resolve(null),
    CategoryModel.find({ _id: { $in: category.path } }).lean(),
  ]);
  if (input.brandId && !brand) throw ApiError.notFound('Brand');

  const searchTerms = [brand?.name ?? '', ...ancestors.flatMap((c) => [c.name.ar, c.name.en])];
  const derived = validateAndDerive(input, attributes, searchTerms);
  return { category, derived };
}

/**
 * Update pipeline that rewrites variants WITHOUT touching live stock.
 *
 * Orders decrement `variants.$.stock` atomically at any moment; if the admin form simply `$set` the whole
 * variants array it could silently resurrect stock that was just sold. Instead each incoming variant is
 * matched to its existing one by SKU inside the database, keeping `_id` and `stock` from the stored copy.
 * New SKUs take their initial stock from the form; SKUs missing from the form are dropped.
 */
function variantsPipelineExpression(variants: ProductInput['variants']) {
  const incoming = variants.map(({ sku, optionValues, price, compareAtPrice, stock }) => ({
    _id: new Types.ObjectId(),
    sku,
    optionValues,
    price,
    ...(compareAtPrice !== undefined ? { compareAtPrice } : {}),
    stock,
  }));

  return {
    $map: {
      input: { $literal: incoming },
      as: 'n',
      in: {
        $let: {
          vars: {
            old: { $first: { $filter: { input: '$variants', as: 'o', cond: { $eq: ['$$o.sku', '$$n.sku'] } } } },
          },
          in: {
            $cond: [
              { $ifNull: ['$$old', false] },
              { $mergeObjects: ['$$n', { _id: '$$old._id', stock: '$$old.stock' }] },
              '$$n',
            ],
          },
        },
      },
    },
  };
}

export const productService = {
  async create(input: ProductInput) {
    const { category, derived } = await resolveContext(input);
    const slug =
      input.slug ?? (await uniqueSlug(input.title.en, (s) => ProductModel.exists({ slug: s }).then(Boolean)));

    const product = await ProductModel.create({
      title: input.title,
      slug,
      description: input.description,
      categoryId: category._id,
      categoryPath: category.path,
      ...(input.brandId ? { brandId: new Types.ObjectId(input.brandId) } : {}),
      images: input.images,
      specs: input.specs,
      options: input.options,
      variants: input.variants,
      tags: input.tags,
      status: input.status,
      ...derived,
    });

    revalidate(product.slug);
    return product;
  },

  async update(id: string, input: ProductInput) {
    const existing = await ProductModel.findById(id).select('slug').lean();
    if (!existing) throw ApiError.notFound('Product');

    const { category, derived } = await resolveContext(input);
    const slug = input.slug ?? existing.slug;

    const lit = <T>(value: T) => ({ $literal: value });
    const result = await ProductModel.updateOne({ _id: id }, [
      {
        $set: {
          title: lit(input.title),
          slug: lit(slug),
          description: lit(input.description),
          categoryId: category._id,
          categoryPath: category.path,
          brandId: input.brandId ? new Types.ObjectId(input.brandId) : '$$REMOVE',
          images: lit(input.images),
          specs: lit(input.specs),
          options: lit(input.options),
          variants: variantsPipelineExpression(input.variants),
          tags: lit(input.tags),
          status: lit(input.status),
          filterAttrs: lit(derived.filterAttrs),
          minPrice: derived.minPrice,
          maxPrice: derived.maxPrice,
          searchKeywords: lit(derived.searchKeywords),
          updatedAt: '$$NOW',
        },
      },
    ], { updatePipeline: true });
    if (result.matchedCount === 0) throw ApiError.notFound('Product');

    revalidate(existing.slug);
    if (slug !== existing.slug) revalidate(slug);
    return ProductModel.findById(id).lean();
  },

  /** Products that were ever ordered are archived (back to draft) instead of deleted, preserving history. */
  async remove(id: string): Promise<'deleted' | 'archived'> {
    const product = await ProductModel.findById(id);
    if (!product) throw ApiError.notFound('Product');

    const ordered = await OrderModel.exists({ 'items.productId': product._id });
    if (ordered) {
      product.status = 'draft';
      await product.save();
      revalidate(product.slug);
      return 'archived';
    }
    await Promise.all([product.deleteOne(), ReviewModel.deleteMany({ productId: product._id })]);
    revalidate(product.slug);
    return 'deleted';
  },

  async getBySlug(slug: string) {
    const product = await ProductModel.findOne({ slug, status: 'published' })
      .select('-searchKeywords -filterAttrs')
      .lean();
    if (!product) throw ApiError.notFound('Product');

    const [brand, category, related] = await Promise.all([
      product.brandId ? BrandModel.findById(product.brandId).lean() : Promise.resolve(null),
      CategoryModel.findById(product.categoryId).lean(),
      relatedProducts(product.categoryId, product._id),
    ]);
    const chain = category ? await CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean() : [];

    return {
      product,
      brand,
      breadcrumbs: chain.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug })),
      /** Attribute definitions (labels, swatches) so the UI can render option pickers nicely. */
      attributes: chain.length > 0 ? (await categoryService.effectiveAttributes(category!)).filter((a) => a.variantOption) : [],
      related,
    };
  },

  async getAdmin(id: string) {
    const product = await ProductModel.findById(id).lean();
    if (!product) throw ApiError.notFound('Product');
    return product;
  },

  async listAdmin(query: { page: number; limit: number; q?: string | undefined; status?: string | undefined; category?: string | undefined; lowStock?: number | undefined }) {
    const filter: QueryFilter<ProductAttrs> = {};
    if (query.status) filter.status = query.status as ProductAttrs['status'];
    if (query.category) filter.categoryPath = new Types.ObjectId(query.category);
    if (query.lowStock !== undefined) filter.variants = { $elemMatch: { stock: { $lte: query.lowStock } } };
    const tokens = tokenize(query.q ?? '');
    if (tokens.length > 0) filter.$and = tokens.map((t) => ({ searchKeywords: { $regex: `^${escapeRegex(t)}` } }));

    const [items, total] = await Promise.all([
      ProductModel.find(filter)
        .select('title slug images status minPrice maxPrice variants.sku variants.stock categoryId updatedAt soldCount')
        .sort({ updatedAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      ProductModel.countDocuments(filter),
    ]);
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  },

  async inventoryHistory(sku: string, limit = 50) {
    return InventoryLogModel.find({ sku }).sort({ createdAt: -1 }).limit(limit).lean();
  },
};
