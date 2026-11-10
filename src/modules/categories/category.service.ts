import { Types, type HydratedDocument } from 'mongoose';
import { MAX_CATEGORY_DEPTH } from '../../config/constants';
import { AppError } from '../../lib/errors';
import { toObjectId } from '../../lib/object-id';
import { uniqueSlug } from '../../lib/unique-slug';
import { ProductModel } from '../products/product.model';
import { CategoryModel, type AttributeDef, type CategoryAttrs } from './category.model';

type CategoryDoc = HydratedDocument<CategoryAttrs>;

export interface CategoryNode {
  id: string;
  name: CategoryAttrs['name'];
  slug: string;
  image?: string;
  level: number;
  children: CategoryNode[];
}

interface CreateInput {
  name: CategoryAttrs['name'];
  slug?: string | undefined;
  parentId: string | null;
  image?: string | undefined;
  sortOrder: number;
  isActive: boolean;
  attributes: AttributeDef[];
}

/**
 * Attributes are inherited down the tree: "Fashion" defines size/colour/material once and every
 * sub-category (Men → T-shirts) uses them. A child can override an inherited key by redefining it.
 */
export function mergeAttributes(chain: readonly Pick<CategoryAttrs, 'attributes'>[]): AttributeDef[] {
  const byKey = new Map<string, AttributeDef>();
  for (const category of chain) for (const attribute of category.attributes) byKey.set(attribute.key, attribute);
  return [...byKey.values()];
}

export const categoryService = {
  async create(input: CreateInput): Promise<CategoryDoc> {
    const _id = new Types.ObjectId();
    let level = 1;
    let path: Types.ObjectId[] = [_id];

    if (input.parentId) {
      const parent = await CategoryModel.findById(input.parentId);
      if (!parent) throw AppError.notFound('Parent category');
      if (parent.level >= MAX_CATEGORY_DEPTH) {
        throw AppError.unprocessable('VALIDATION_ERROR', `Categories can be nested at most ${MAX_CATEGORY_DEPTH} levels deep`);
      }
      level = parent.level + 1;
      path = [...parent.path, _id];
    }

    const slug = input.slug ?? (await uniqueSlug(input.name.en, (s) => CategoryModel.exists({ slug: s }).then(Boolean)));

    return CategoryModel.create({
      _id,
      name: input.name,
      slug,
      parentId: input.parentId ? toObjectId(input.parentId) : null,
      level,
      path,
      ...(input.image ? { image: input.image } : {}),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      attributes: input.attributes,
    });
  },

  async update(id: string, patch: Partial<Omit<CreateInput, 'parentId'>>): Promise<CategoryDoc> {
    const category = await CategoryModel.findById(id);
    if (!category) throw AppError.notFound('Category');
    if (patch.name) category.name = patch.name;
    if (patch.slug) category.slug = patch.slug;
    if (patch.image !== undefined) category.image = patch.image;
    if (patch.sortOrder !== undefined) category.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) category.isActive = patch.isActive;
    if (patch.attributes) category.set('attributes', patch.attributes);
    await category.save();
    return category;
  },

  async remove(id: string): Promise<void> {
    const [hasChildren, hasProducts] = await Promise.all([
      CategoryModel.exists({ parentId: id }),
      ProductModel.exists({ categoryPath: id }),
    ]);
    if (hasChildren) throw AppError.conflict('Delete or move the sub-categories first');
    if (hasProducts) throw AppError.conflict('This category still has products');
    const deleted = await CategoryModel.findByIdAndDelete(id);
    if (!deleted) throw AppError.notFound('Category');
  },

  /** Nested tree (max 3 levels) of active categories, for the mega-menu and navigation. */
  async tree(): Promise<CategoryNode[]> {
    const all = await CategoryModel.find({ isActive: true }).sort({ level: 1, sortOrder: 1, 'name.en': 1 }).lean();
    const nodes = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const c of all) {
      nodes.set(String(c._id), {
        id: String(c._id),
        name: c.name,
        slug: c.slug,
        ...(c.image ? { image: c.image } : {}),
        level: c.level,
        children: [],
      });
    }
    for (const c of all) {
      const node = nodes.get(String(c._id))!;
      const parent = c.parentId ? nodes.get(String(c.parentId)) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  },

  /** Admin view: every category (also inactive), flat, with raw attribute definitions. */
  listAll() {
    return CategoryModel.find().sort({ level: 1, sortOrder: 1 }).lean();
  },

  async effectiveAttributes(category: Pick<CategoryAttrs, 'path'>): Promise<AttributeDef[]> {
    const chain = await CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean();
    return mergeAttributes(chain);
  },

  /** Category + breadcrumb ancestors + inherited attribute definitions (drives the dynamic filters). */
  async getDetailsBySlug(slug: string) {
    const category = await CategoryModel.findOne({ slug, isActive: true }).lean();
    if (!category) throw AppError.notFound('Category');

    const [ancestors, children] = await Promise.all([
      CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean(),
      CategoryModel.find({ parentId: category._id, isActive: true }).sort({ sortOrder: 1 }).lean(),
    ]);

    return {
      category,
      breadcrumbs: ancestors.map((a) => ({ id: String(a._id), name: a.name, slug: a.slug })),
      children: children.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug, image: c.image })),
      attributes: mergeAttributes(ancestors),
    };
  },
};
