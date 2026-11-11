import { ApiError } from '../utils/ApiError';
import { tokenize } from '../utils/text';
import type { AttributeDef } from '../models/Category';
import type { FilterAttr } from '../models/Product';
import type { ProductInput } from '../validators/product.validators';

export interface DerivedProductData {
  filterAttrs: FilterAttr[];
  minPrice: number;
  maxPrice: number;
  searchKeywords: string[];
}

interface Issue {
  path: string;
  message: string;
}

const fail = (issues: Issue[]): never => {
  throw ApiError.validation(issues, 'Product does not match its category definition');
};

/**
 * Validates a product against the effective attributes of its category and derives the
 * query-friendly denormalised fields (facet pairs, price range, search keywords).
 *
 * This is where "categories define attributes, products fill them in" is enforced — adding a new
 * kind of product is a data change (new category attributes), never a code change.
 */
export function validateAndDerive(
  input: Pick<ProductInput, 'title' | 'options' | 'variants' | 'specs' | 'tags'>,
  attributes: readonly AttributeDef[],
  searchTerms: readonly string[] = [],
): DerivedProductData {
  const issues: Issue[] = [];
  const attrByKey = new Map(attributes.map((a) => [a.key, a]));

  // ── options ──────────────────────────────────────────────────────────────
  const optionKeys = new Set<string>();
  input.options.forEach((option, i) => {
    const at = `options.${i}`;
    const attribute = attrByKey.get(option.key);
    if (optionKeys.has(option.key)) issues.push({ path: at, message: `Duplicate option "${option.key}"` });
    optionKeys.add(option.key);

    if (!attribute?.variantOption) {
      issues.push({ path: `${at}.key`, message: `"${option.key}" is not a variant option of this category` });
      return;
    }
    const allowed = new Set(attribute.values.map((v) => v.value));
    if (new Set(option.values).size !== option.values.length) {
      issues.push({ path: `${at}.values`, message: 'Option values must be unique' });
    }
    for (const value of option.values) {
      if (allowed.size > 0 && !allowed.has(value)) {
        issues.push({ path: `${at}.values`, message: `"${value}" is not an allowed ${option.key}` });
      }
    }
  });

  // ── variants ─────────────────────────────────────────────────────────────
  const skus = new Set<string>();
  const combos = new Set<string>();
  const optionByKey = new Map(input.options.map((o) => [o.key, new Set(o.values)]));

  input.variants.forEach((variant, i) => {
    const at = `variants.${i}`;
    if (skus.has(variant.sku)) issues.push({ path: `${at}.sku`, message: `Duplicate SKU "${variant.sku}"` });
    skus.add(variant.sku);

    if (variant.compareAtPrice !== undefined && variant.compareAtPrice <= variant.price) {
      issues.push({ path: `${at}.compareAtPrice`, message: 'compareAtPrice must be greater than price' });
    }

    const keys = Object.keys(variant.optionValues);
    if (keys.length !== optionKeys.size || keys.some((k) => !optionKeys.has(k))) {
      issues.push({
        path: `${at}.optionValues`,
        message: `Variant must define exactly these options: ${[...optionKeys].join(', ') || '(none)'}`,
      });
      return;
    }
    for (const [key, value] of Object.entries(variant.optionValues)) {
      if (!optionByKey.get(key)?.has(value)) {
        issues.push({ path: `${at}.optionValues.${key}`, message: `"${value}" is not listed in option "${key}"` });
      }
    }
    const combo = keys.sort().map((k) => `${k}=${variant.optionValues[k]}`).join('|');
    if (combos.has(combo)) issues.push({ path: at, message: 'Two variants share the same option combination' });
    combos.add(combo);
  });

  if (issues.length > 0) fail(issues);

  // ── derived data ─────────────────────────────────────────────────────────
  const filterAttrs: FilterAttr[] = [];
  const seen = new Set<string>();
  const addFacet = (k: string, v: string) => {
    const id = `${k}\u0000${v}`;
    if (!seen.has(id)) {
      seen.add(id);
      filterAttrs.push({ k, v });
    }
  };

  for (const option of input.options) {
    if (attrByKey.get(option.key)?.filterable) {
      // Only advertise values that at least one variant actually uses.
      for (const value of option.values) {
        if (input.variants.some((v) => v.optionValues[option.key] === value)) addFacet(option.key, value);
      }
    }
  }
  for (const attribute of attributes) {
    if (attribute.filterable && !attribute.variantOption) {
      const value = input.specs[attribute.key];
      if (value) addFacet(attribute.key, value);
    }
  }

  const prices = input.variants.map((v) => v.price);
  return {
    filterAttrs,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    searchKeywords: tokenize(
      input.title.ar,
      input.title.en,
      ...input.tags,
      ...searchTerms,
      ...input.variants.map((v) => v.sku),
    ),
  };
}
