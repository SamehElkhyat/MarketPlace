import { OrderModel } from '../models/Order';
import { ProductModel } from '../models/Product';
import { ReviewModel } from '../models/Review';
import { UserModel } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { toObjectId } from '../utils/objectId';
import { toPage, type PaginationQuery } from '../validators/common.validators';

/** Only customers with a DELIVERED order containing the product may review it (verified purchase). */
const hasDeliveredPurchase = (userId: string, productId: string) =>
  OrderModel.exists({ userId, status: 'delivered', 'items.productId': toObjectId(productId) });

/** "Sara M." — reviews never expose a customer's full name. */
const publicName = (name: string) => {
  const [first = '', last] = name.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

async function recomputeRating(productId: string) {
  const [stats] = await ReviewModel.aggregate<{ avg: number; count: number }>([
    { $match: { productId: toObjectId(productId) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await ProductModel.updateOne(
    { _id: productId },
    { $set: { ratingAvg: stats ? Math.round(stats.avg * 10) / 10 : 0, ratingCount: stats?.count ?? 0 } },
  );
}

export const reviewService = {
  async list(productId: string, query: PaginationQuery) {
    const filter = { productId: toObjectId(productId) };
    const [reviews, total] = await Promise.all([
      ReviewModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
      ReviewModel.countDocuments(filter),
    ]);
    const users = await UserModel.find({ _id: { $in: reviews.map((r) => r.userId) } })
      .select('name')
      .lean();
    const names = new Map(users.map((u) => [String(u._id), u.name]));

    return toPage(
      reviews.map((r) => ({
        id: String(r._id),
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        verifiedPurchase: r.verifiedPurchase,
        author: publicName(names.get(String(r.userId)) ?? ''),
        createdAt: r.createdAt,
      })),
      total,
      query,
    );
  },

  async eligibility(userId: string, productId: string) {
    const [purchased, existing] = await Promise.all([
      hasDeliveredPurchase(userId, productId),
      ReviewModel.exists({ productId, userId }),
    ]);
    return { canReview: Boolean(purchased) && !existing, alreadyReviewed: Boolean(existing) };
  },

  async create(userId: string, input: { productId: string; rating: number; title?: string | undefined; comment: string }) {
    if (!(await hasDeliveredPurchase(userId, input.productId))) {
      throw ApiError.forbidden('Only customers who received this product can review it');
    }
    const review = await ReviewModel.create({ ...input, userId: toObjectId(userId), verifiedPurchase: true }); // duplicate → 409
    await recomputeRating(input.productId);
    return review;
  },
};
