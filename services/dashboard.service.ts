import mongoose from 'mongoose';
import { OrderModel } from '../models/Order';
import { ProductModel } from '../models/Product';

const TZ = 'Africa/Cairo';
/** Orders that represent real sales (excludes cancelled, refunded and unpaid online attempts). */
const REVENUE_STATUSES = ['paid', 'pending_confirmation', 'confirmed', 'processing', 'shipped', 'delivered'];
const LOW_STOCK_THRESHOLD = 5;

/** Start of "today" and "this month" in Cairo time, computed by MongoDB (handles DST correctly). */
async function periodStarts(): Promise<{ today: Date; month: Date; since30: Date }> {
  const db = mongoose.connection.db!;
  const [row] = await db
    .aggregate<{ today: Date; month: Date; since30: Date }>([
      { $documents: [{}] },
      {
        $project: {
          _id: 0,
          today: { $dateTrunc: { date: '$$NOW', unit: 'day', timezone: TZ } },
          month: { $dateTrunc: { date: '$$NOW', unit: 'month', timezone: TZ } },
          since30: { $dateSubtract: { startDate: { $dateTrunc: { date: '$$NOW', unit: 'day', timezone: TZ } }, unit: 'day', amount: 29, timezone: TZ } },
        },
      },
    ])
    .toArray();
  return row!;
}

export const dashboardService = {
  async overview() {
    const { today, month, since30 } = await periodStarts();
    const earliest = month < since30 ? month : since30;
    const sales = { status: { $in: REVENUE_STATUSES } };

    const [orders, statusCounts, lowStock] = await Promise.all([
      OrderModel.aggregate<{
        periods: Record<string, number>[];
        daily: { _id: string; revenue: number; orders: number }[];
        products: { _id: string; title: { ar: string; en: string }; image?: string; qty: number; revenue: number }[];
        categories: { _id: string; name: { ar: string; en: string }; qty: number; revenue: number }[];
      }>([
        { $match: { createdAt: { $gte: earliest }, ...sales } },
        {
          $facet: {
            periods: [
              {
                $group: {
                  _id: null,
                  monthRevenue: { $sum: { $cond: [{ $gte: ['$createdAt', month] }, '$total', 0] } },
                  monthOrders: { $sum: { $cond: [{ $gte: ['$createdAt', month] }, 1, 0] } },
                  todayRevenue: { $sum: { $cond: [{ $gte: ['$createdAt', today] }, '$total', 0] } },
                  todayOrders: { $sum: { $cond: [{ $gte: ['$createdAt', today] }, 1, 0] } },
                },
              },
            ],
            daily: [
              { $match: { createdAt: { $gte: since30 } } },
              {
                $group: {
                  _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: TZ } },
                  revenue: { $sum: '$total' },
                  orders: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ],
            products: [
              { $match: { createdAt: { $gte: since30 } } },
              { $unwind: '$items' },
              {
                $group: {
                  _id: '$items.productId',
                  title: { $first: '$items.title' },
                  image: { $first: '$items.image' },
                  qty: { $sum: '$items.qty' },
                  revenue: { $sum: '$items.lineTotal' },
                },
              },
              { $sort: { revenue: -1 } },
              { $limit: 5 },
            ],
            categories: [
              { $match: { createdAt: { $gte: since30 } } },
              { $unwind: '$items' },
              { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p', pipeline: [{ $project: { categoryPath: 1 } }] } },
              { $unwind: '$p' },
              // Credit the sale to the top-level (root) category of the product.
              { $group: { _id: { $arrayElemAt: ['$p.categoryPath', 0] }, qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
              { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'c', pipeline: [{ $project: { name: 1 } }] } },
              { $unwind: '$c' },
              { $project: { name: '$c.name', qty: 1, revenue: 1 } },
              { $sort: { revenue: -1 } },
              { $limit: 5 },
            ],
          },
        },
      ]),
      OrderModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      ProductModel.aggregate<{ sku: string; stock: number; productId: string; title: { ar: string; en: string } }>([
        { $match: { status: 'published', variants: { $elemMatch: { stock: { $lte: LOW_STOCK_THRESHOLD } } } } },
        { $unwind: '$variants' },
        { $match: { 'variants.stock': { $lte: LOW_STOCK_THRESHOLD } } },
        { $sort: { 'variants.stock': 1 } },
        { $limit: 10 },
        { $project: { _id: 0, sku: '$variants.sku', stock: '$variants.stock', productId: '$_id', title: 1 } },
      ]),
    ]);

    const facet = orders[0];
    const p = facet?.periods[0] ?? {};
    const monthOrders = p['monthOrders'] ?? 0;
    const monthRevenue = p['monthRevenue'] ?? 0;

    return {
      today: { revenue: p['todayRevenue'] ?? 0, orders: p['todayOrders'] ?? 0 },
      month: {
        revenue: monthRevenue,
        orders: monthOrders,
        averageOrderValue: monthOrders > 0 ? Math.round(monthRevenue / monthOrders) : 0,
      },
      salesByDay: facet?.daily.map((d) => ({ date: d._id, revenue: d.revenue, orders: d.orders })) ?? [],
      topProducts: facet?.products.map((x) => ({ productId: String(x._id), title: x.title, image: x.image, qty: x.qty, revenue: x.revenue })) ?? [],
      topCategories: facet?.categories.map((x) => ({ categoryId: String(x._id), name: x.name, qty: x.qty, revenue: x.revenue })) ?? [],
      orderStatusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
      lowStock: lowStock.map((s) => ({ ...s, productId: String(s.productId) })),
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    };
  },
};
