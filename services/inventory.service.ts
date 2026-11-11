import type { ClientSession, Types } from 'mongoose';
import { ApiError } from '../utils/ApiError';
import { toObjectId } from '../utils/objectId';
import { ProductModel } from '../models/Product';
import { InventoryLogModel, type InventoryReason } from '../models/InventoryLog';

export interface StockLine {
  sku: string;
  qty: number;
  productId: Types.ObjectId;
}

interface StockContext {
  session: ClientSession;
  reason: InventoryReason;
  orderId?: Types.ObjectId;
  byUserId?: string;
  note?: string;
}

const logEntry = (line: StockLine, delta: number, ctx: StockContext) => ({
  sku: line.sku,
  productId: line.productId,
  delta,
  reason: ctx.reason,
  ...(ctx.orderId ? { orderId: ctx.orderId } : {}),
  ...(ctx.byUserId ? { byUserId: toObjectId(ctx.byUserId) } : {}),
  ...(ctx.note ? { note: ctx.note } : {}),
});

export const inventoryService = {
  /**
   * Removes stock with ONE atomic conditional update — the stock check lives inside the write itself:
   *
   *   updateOne({ variants: { $elemMatch: { sku, stock: { $gte: qty } } } },
   *             { $inc: { 'variants.$.stock': -qty } })
   *
   * If two shoppers race for the last unit, MongoDB serialises the two updates; exactly one matches the
   * filter (modifiedCount 1), the other sees stock 0 and matches nothing. No read-then-write window exists.
   * Runs inside the caller's transaction so a multi-item order is all-or-nothing.
   */
  async reserve(lines: readonly StockLine[], ctx: StockContext): Promise<void> {
    // Stable order keeps lock acquisition identical across concurrent transactions.
    const ordered = [...lines].sort((a, b) => a.sku.localeCompare(b.sku));

    for (const line of ordered) {
      const result = await ProductModel.updateOne(
        { status: 'published', variants: { $elemMatch: { sku: line.sku, stock: { $gte: line.qty } } } },
        { $inc: { 'variants.$.stock': -line.qty } },
        { session: ctx.session },
      );
      if (result.modifiedCount !== 1) {
        throw ApiError.conflict(`Not enough stock for ${line.sku}`, 'INSUFFICIENT_STOCK', { sku: line.sku });
      }
    }
    await InventoryLogModel.insertMany(
      ordered.map((line) => logEntry(line, -line.qty, ctx)),
      { session: ctx.session },
    );
  },

  /** Puts units back (cancellation / refund / manual restock). */
  async release(lines: readonly StockLine[], ctx: StockContext): Promise<void> {
    for (const line of lines) {
      await ProductModel.updateOne(
        { 'variants.sku': line.sku },
        { $inc: { 'variants.$.stock': line.qty } },
        { session: ctx.session },
      );
    }
    await InventoryLogModel.insertMany(
      lines.map((line) => logEntry(line, line.qty, ctx)),
      { session: ctx.session },
    );
  },

  /** Manual admin correction with a mandatory written reason; never lets stock go negative. */
  async adjust(input: { sku: string; delta: number; note: string; byUserId: string }): Promise<{ stock: number }> {
    const product = await ProductModel.findOneAndUpdate(
      {
        'variants.sku': input.sku,
        ...(input.delta < 0 ? { variants: { $elemMatch: { sku: input.sku, stock: { $gte: -input.delta } } } } : {}),
      },
      { $inc: { 'variants.$.stock': input.delta } },
      { returnDocument: 'after' },
    );
    if (!product) {
      const exists = await ProductModel.exists({ 'variants.sku': input.sku });
      throw exists
        ? ApiError.conflict('Adjustment would make stock negative', 'INSUFFICIENT_STOCK', { sku: input.sku })
        : ApiError.notFound('SKU');
    }

    await InventoryLogModel.create({
      sku: input.sku,
      productId: product._id,
      delta: input.delta,
      reason: input.delta > 0 ? 'restock' : 'manual_adjustment',
      note: input.note,
      byUserId: toObjectId(input.byUserId),
    });
    const variant = product.variants.find((v) => v.sku === input.sku);
    return { stock: variant?.stock ?? 0 };
  },
};
