import type { Types } from 'mongoose';
import { CategoryModel, type AttributeDef } from './category.model';
import { mergeAttributes } from './category.service';

export interface OptionLabel {
  key: string;
  label: { ar: string; en: string };
  value: { ar: string; en: string };
}

/** Turns `{ color: 'black' }` into localized labels: `[{ label: {ar:'اللون'}, value: {ar:'أسود'} }]`. */
export function describeOptions(
  attributes: readonly AttributeDef[],
  optionValues: Record<string, string>,
): OptionLabel[] {
  return Object.entries(optionValues).map(([key, value]) => {
    const definition = attributes.find((a) => a.key === key);
    const known = definition?.values.find((v) => v.value === value);
    return {
      key,
      label: definition?.label ?? { ar: key, en: key },
      value: known?.label ?? { ar: value, en: value },
    };
  });
}

/** Effective (inherited) attribute definitions for a batch of products, using one category query. */
export async function loadAttributesByProduct(
  products: readonly { _id: Types.ObjectId; categoryPath: Types.ObjectId[] }[],
): Promise<Map<string, AttributeDef[]>> {
  const ids = [...new Set(products.flatMap((p) => p.categoryPath.map(String)))];
  const categories = await CategoryModel.find({ _id: { $in: ids } }).select('attributes level').lean();
  const byId = new Map(categories.map((c) => [String(c._id), c]));

  return new Map(
    products.map((product) => {
      const chain = product.categoryPath.flatMap((id) => {
        const category = byId.get(String(id));
        return category ? [category] : [];
      });
      return [String(product._id), mergeAttributes(chain)] as const;
    }),
  );
}
