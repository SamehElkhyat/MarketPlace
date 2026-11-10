import { describe, expect, it } from 'vitest';
import { mergeAttributes } from '../../src/modules/categories/category.service';
import type { AttributeDef } from '../../src/modules/categories/category.model';
import { validateAndDerive } from '../../src/modules/products/product.builder';
import { normalizeText, tokenize } from '../../src/lib/text';

const attr = (key: string, over: Partial<AttributeDef> = {}): AttributeDef => ({
  key,
  label: { ar: key, en: key },
  type: 'select',
  values: [],
  filterable: false,
  variantOption: false,
  ...over,
});
const values = (...v: string[]) => v.map((value) => ({ value }));

const fashion: AttributeDef[] = [
  attr('size', { variantOption: true, filterable: true, values: values('S', 'M', 'L') }),
  attr('color', { variantOption: true, filterable: true, values: values('black', 'sand') }),
  attr('material', { filterable: true }),
];

const input = (overrides: Record<string, unknown> = {}) => ({
  title: { ar: 'تيشيرت قطن', en: 'Cotton tee' },
  tags: [],
  specs: { material: 'cotton' },
  options: [
    { key: 'size', values: ['S', 'M'] },
    { key: 'color', values: ['black'] },
  ],
  variants: [
    { sku: 'TEE-S-BLK', optionValues: { size: 'S', color: 'black' }, price: 49_900, stock: 3 },
    { sku: 'TEE-M-BLK', optionValues: { size: 'M', color: 'black' }, price: 52_900, stock: 0 },
  ],
  ...overrides,
});

describe('validateAndDerive — categories define attributes, products fill them in', () => {
  it('derives facets, price range and Arabic+English search keywords', () => {
    const derived = validateAndDerive(input() as never, fashion, ['Atelier']);
    expect(derived.minPrice).toBe(49_900);
    expect(derived.maxPrice).toBe(52_900);
    expect(derived.filterAttrs).toEqual(
      expect.arrayContaining([
        { k: 'size', v: 'S' },
        { k: 'size', v: 'M' },
        { k: 'color', v: 'black' },
        { k: 'material', v: 'cotton' }, // filterable non-variant spec
      ]),
    );
    expect(derived.searchKeywords).toEqual(expect.arrayContaining(['cotton', 'tee', 'تيشيرت', 'قطن', 'atelier']));
  });

  it('works for a completely different category with no code change (electronics)', () => {
    const electronics = [attr('ram', { variantOption: true, filterable: true, values: values('8GB', '16GB') })];
    const derived = validateAndDerive(
      {
        title: { ar: 'لابتوب', en: 'Laptop' },
        tags: [],
        specs: {},
        options: [{ key: 'ram', values: ['16GB'] }],
        variants: [{ sku: 'LAP-16', optionValues: { ram: '16GB' }, price: 3_000_000, stock: 2 }],
      } as never,
      electronics,
    );
    expect(derived.filterAttrs).toEqual([{ k: 'ram', v: '16GB' }]);
  });

  it('rejects options the category does not define as variant options', () => {
    expect(() =>
      validateAndDerive(input({ options: [{ key: 'material', values: ['cotton'] }], variants: [{ sku: 'X1', optionValues: { material: 'cotton' }, price: 1, stock: 1 }] }) as never, fashion),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('rejects values outside the allowed list', () => {
    expect(() => validateAndDerive(input({ options: [{ key: 'size', values: ['XXL'] }, { key: 'color', values: ['black'] }] }) as never, fashion)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('rejects duplicate SKUs, duplicate combinations and missing option values', () => {
    const dupSku = input({ variants: [
      { sku: 'A1', optionValues: { size: 'S', color: 'black' }, price: 100, stock: 1 },
      { sku: 'A1', optionValues: { size: 'M', color: 'black' }, price: 100, stock: 1 },
    ] });
    expect(() => validateAndDerive(dupSku as never, fashion)).toThrow();

    const dupCombo = input({ variants: [
      { sku: 'A1', optionValues: { size: 'S', color: 'black' }, price: 100, stock: 1 },
      { sku: 'A2', optionValues: { size: 'S', color: 'black' }, price: 100, stock: 1 },
    ] });
    expect(() => validateAndDerive(dupCombo as never, fashion)).toThrow();

    const missing = input({ variants: [{ sku: 'A1', optionValues: { size: 'S' }, price: 100, stock: 1 }] });
    expect(() => validateAndDerive(missing as never, fashion)).toThrow();
  });

  it('requires compareAtPrice to be greater than price', () => {
    const bad = input({ variants: [{ sku: 'A1', optionValues: { size: 'S', color: 'black' }, price: 500, compareAtPrice: 500, stock: 1 }] });
    expect(() => validateAndDerive(bad as never, fashion)).toThrow();
  });
});

describe('category attribute inheritance', () => {
  it('children inherit parent attributes and can override a key', () => {
    const parent = { attributes: [attr('size', { values: values('S', 'M') }), attr('color')] };
    const child = { attributes: [attr('size', { values: values('36', '38') })] };
    const merged = mergeAttributes([parent, child]);
    expect(merged.map((a) => a.key).sort()).toEqual(['color', 'size']);
    expect(merged.find((a) => a.key === 'size')!.values.map((v) => v.value)).toEqual(['36', '38']);
  });
});

describe('Arabic-aware text normalisation', () => {
  it('unifies alef/ya/ta-marbuta variants and strips diacritics', () => {
    expect(normalizeText('أحذيّة')).toBe(normalizeText('احذيه'));
    expect(normalizeText('إلكترونيات')).toBe('الكترونيات');
  });
  it('tokenises mixed Arabic/English input uniquely', () => {
    expect(tokenize('Cotton T-Shirt قميص قطن', 'cotton')).toEqual(['cotton', 'shirt', 'قميص', 'قطن']);
  });
});
