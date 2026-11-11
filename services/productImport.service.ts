import { z } from 'zod';
import { piastersSchema } from '../validators/common.validators';
import { BrandModel } from '../models/Brand';
import { CategoryModel } from '../models/Category';
import { productService } from './product.service';
import { skuSchema } from '../validators/product.validators';

export interface ImportResult {
  row: number;
  ok: boolean;
  sku?: string;
  error?: string;
}

/**
 * CSV columns (one single-variant product per row):
 * title_en, title_ar, category_slug, brand_slug?, sku, price_egp, stock, image_url?, description_en?, description_ar?, status?
 * Prices are in EGP (e.g. 149.99) and converted to integer piasters here.
 */
const rowSchema = z.object({
  title_en: z.string().trim().min(1).max(200),
  title_ar: z.string().trim().min(1).max(200),
  category_slug: z.string().trim().min(1),
  brand_slug: z.string().trim().optional(),
  sku: skuSchema,
  price_egp: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'price_egp must be like 149.99'),
  stock: z.string().trim().regex(/^\d+$/),
  image_url: z.url().optional().or(z.literal('')),
  description_en: z.string().optional(),
  description_ar: z.string().optional(),
  status: z.enum(['draft', 'published']).optional(),
});

export async function importProducts(rows: readonly Record<string, string>[]): Promise<ImportResult[]> {
  const results: ImportResult[] = [];

  for (const [index, raw] of rows.entries()) {
    const row = index + 1;
    try {
      const data = rowSchema.parse(raw);
      const [category, brand] = await Promise.all([
        CategoryModel.findOne({ slug: data.category_slug }).select('_id').lean(),
        data.brand_slug ? BrandModel.findOne({ slug: data.brand_slug }).select('_id').lean() : null,
      ]);
      if (!category) throw new Error(`Unknown category "${data.category_slug}"`);
      if (data.brand_slug && !brand) throw new Error(`Unknown brand "${data.brand_slug}"`);

      await productService.create({
        title: { en: data.title_en, ar: data.title_ar },
        description: { en: data.description_en ?? '', ar: data.description_ar ?? '' },
        categoryId: String(category._id),
        ...(brand ? { brandId: String(brand._id) } : {}),
        images: data.image_url ? [{ url: data.image_url }] : [],
        specs: {},
        options: [],
        variants: [
          { sku: data.sku, optionValues: {}, price: piastersSchema.parse(Math.round(Number(data.price_egp) * 100)), stock: Number(data.stock) },
        ],
        tags: [],
        status: data.status ?? 'draft',
      });
      results.push({ row, ok: true, sku: data.sku });
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : (error as Error).message;
      results.push({ row, ok: false, error: message });
    }
  }
  return results;
}
