import type { ClientSession } from 'mongoose';
import { AppError } from '../../lib/errors';
import { toObjectId } from '../../lib/object-id';
import { describeOptions, loadAttributesByProduct, type OptionLabel } from '../categories/option-labels';
import { ProductModel } from '../products/product.model';
import { CartModel, type CartItem } from './cart.model';

export type CartWarning = 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'PRICE_CHANGED';

export interface CartLine {
  sku: string;
  qty: number;
  available: boolean;
  productId?: string;
  slug?: string;
  title?: { ar: string; en: string };
  image?: string;
  optionValues?: Record<string, string>;
  /** Localized option labels, e.g. Color: Black / اللون: أسود. */
  options?: OptionLabel[];
  unitPrice: number;
  compareAtPrice?: number;
  /** Units currently in stock. */
  stock: number;
  /** Price (piasters) when the shopper added the item — only set when it differs from `unitPrice`. */
  previousPrice?: number;
  lineTotal: number;
  warnings: CartWarning[];
}

export interface CartView {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  /** True when something blocks checkout (unavailable, out of stock, qty above stock). */
  hasBlockingIssues: boolean;
}

export interface CartInputItem {
  sku: string;
  qty: number;
  priceAtAdd?: number | undefined;
}

const MAX_QTY_PER_LINE = 99;

/**
 * Prices every line from the database — the server is the only source of truth for price and stock.
 * Used both for stored carts (`GET /cart`) and guest previews (`POST /cart/preview`).
 */
export async function buildCartView(inputs: readonly CartInputItem[]): Promise<CartView> {
  const skus = inputs.map((i) => i.sku);
  const products = await ProductModel.find({ 'variants.sku': { $in: skus }, status: 'published' })
    .select('title slug images variants categoryPath')
    .lean();
  const attributesByProduct = await loadAttributesByProduct(products);

  const bySku = new Map<string, { product: (typeof products)[number]; variant: (typeof products)[number]['variants'][number] }>();
  for (const product of products) for (const variant of product.variants) bySku.set(variant.sku, { product, variant });

  const items: CartLine[] = inputs.map((input) => {
    const found = bySku.get(input.sku);
    if (!found) {
      return { sku: input.sku, qty: input.qty, available: false, unitPrice: 0, stock: 0, lineTotal: 0, warnings: ['UNAVAILABLE'] };
    }
    const { product, variant } = found;
    const warnings: CartWarning[] = [];
    if (variant.stock === 0) warnings.push('OUT_OF_STOCK');
    else if (input.qty > variant.stock) warnings.push('INSUFFICIENT_STOCK');
    const priceChanged = input.priceAtAdd !== undefined && input.priceAtAdd !== variant.price;
    if (priceChanged) warnings.push('PRICE_CHANGED');

    return {
      sku: variant.sku,
      qty: input.qty,
      available: true,
      productId: String(product._id),
      slug: product.slug,
      title: product.title,
      ...(product.images[0] ? { image: product.images[0].url } : {}),
      optionValues: variant.optionValues,
      options: describeOptions(attributesByProduct.get(String(product._id)) ?? [], variant.optionValues),
      unitPrice: variant.price,
      ...(variant.compareAtPrice ? { compareAtPrice: variant.compareAtPrice } : {}),
      stock: variant.stock,
      ...(priceChanged ? { previousPrice: input.priceAtAdd! } : {}),
      lineTotal: variant.price * input.qty,
      warnings,
    };
  });

  const purchasable = items.filter((i) => i.available);
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    subtotal: purchasable.reduce((sum, i) => sum + i.lineTotal, 0),
    hasBlockingIssues: items.some((i) => i.warnings.some((w) => w !== 'PRICE_CHANGED')),
  };
}

async function variantInfo(sku: string): Promise<{ price: number; stock: number }> {
  const product = await ProductModel.findOne({ 'variants.sku': sku, status: 'published' }).select('variants').lean();
  const variant = product?.variants.find((v) => v.sku === sku);
  if (!variant) throw AppError.unprocessable('PRODUCT_UNAVAILABLE', 'This product is no longer available', { sku });
  return { price: variant.price, stock: variant.stock };
}

async function getOrCreateCart(userId: string) {
  return CartModel.findOneAndUpdate(
    { userId: toObjectId(userId) },
    { $setOnInsert: { userId: toObjectId(userId), items: [] } },
    { upsert: true, returnDocument: 'after' },
  );
}

export const cartService = {
  async get(userId: string): Promise<CartView> {
    const cart = await CartModel.findOne({ userId }).lean();
    return buildCartView(cart?.items ?? []);
  },

  preview: (items: readonly CartInputItem[]) => buildCartView(items),

  /** Adds `qty` units (or sets the exact quantity when `mode` is "set"). Never exceeds live stock. */
  async setItem(userId: string, sku: string, qty: number, mode: 'add' | 'set'): Promise<CartView> {
    const { price, stock } = await variantInfo(sku);
    const cart = await getOrCreateCart(userId);
    const existing = cart.items.find((i) => i.sku === sku);
    const target = mode === 'add' ? (existing?.qty ?? 0) + qty : qty;

    if (target > MAX_QTY_PER_LINE) throw AppError.badRequest(`Maximum ${MAX_QTY_PER_LINE} units per item`);
    if (target > stock) {
      throw AppError.conflict(`Only ${stock} unit(s) available`, 'INSUFFICIENT_STOCK', { sku, available: stock });
    }

    if (target <= 0) {
      cart.set('items', cart.items.filter((i) => i.sku !== sku));
    } else if (existing) {
      existing.qty = target;
      existing.priceAtAdd = price;
    } else {
      cart.items.push({ sku, qty: target, priceAtAdd: price });
    }
    await cart.save();
    return buildCartView(cart.items);
  },

  async removeItem(userId: string, sku: string): Promise<CartView> {
    const cart = await CartModel.findOneAndUpdate({ userId }, { $pull: { items: { sku } } }, { returnDocument: 'after' });
    return buildCartView(cart?.items ?? []);
  },

  async clear(userId: string, session?: ClientSession): Promise<void> {
    await CartModel.updateOne({ userId }, { $set: { items: [] } }, session ? { session } : {});
  },

  /** Marks current prices as accepted so the "price changed" notice disappears. */
  async acknowledgePrices(userId: string): Promise<CartView> {
    const cart = await CartModel.findOne({ userId });
    if (!cart) return buildCartView([]);
    const view = await buildCartView(cart.items);
    for (const line of view.items) {
      const item = cart.items.find((i) => i.sku === line.sku);
      if (item && line.available) item.priceAtAdd = line.unitPrice;
    }
    await cart.save();
    return buildCartView(cart.items);
  },

  /**
   * Merges a guest cart (kept in the browser) into the account cart right after sign-in.
   * Quantities add up and are silently clamped to available stock — the returned view carries warnings.
   */
  async merge(userId: string, guestItems: readonly { sku: string; qty: number }[]): Promise<CartView> {
    const cart = await getOrCreateCart(userId);
    const info = new Map<string, { price: number; stock: number } | null>();

    for (const guest of guestItems) {
      if (!info.has(guest.sku)) info.set(guest.sku, await variantInfo(guest.sku).catch(() => null));
      const variant = info.get(guest.sku);
      if (!variant) continue; // product disappeared — drop it
      const existing: CartItem | undefined = cart.items.find((i) => i.sku === guest.sku);
      const wanted = Math.min((existing?.qty ?? 0) + guest.qty, MAX_QTY_PER_LINE);
      const qty = Math.min(wanted, variant.stock);
      if (qty <= 0) continue;
      if (existing) existing.qty = qty;
      else cart.items.push({ sku: guest.sku, qty, priceAtAdd: variant.price });
    }
    await cart.save();
    return buildCartView(cart.items);
  },
};
