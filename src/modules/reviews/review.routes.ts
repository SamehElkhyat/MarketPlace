import { Router } from 'express';
import { z } from 'zod';
import { authenticate, currentUserId } from '../../http/middleware/authenticate';
import { validate, validated } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { objectIdSchema, toObjectId } from '../../lib/object-id';
import { paginationQuery, toPage } from '../../lib/schemas';
import { OrderModel } from '../orders/order.model';
import { ProductModel } from '../products/product.model';
import { UserModel } from '../users/user.model';
import { ReviewModel } from './review.model';

const listSchemas = { query: paginationQuery.extend({ productId: objectIdSchema }) };
const createSchemas = {
  body: z.object({
    productId: objectIdSchema,
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional(),
    comment: z.string().trim().min(3).max(2000),
  }),
};
const eligibilitySchemas = { params: z.object({ productId: objectIdSchema }) };

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

export const reviewRouter = Router();

reviewRouter.get('/', validate(listSchemas), async (req, res) => {
  const { query } = validated<typeof listSchemas>(req);
  const filter = { productId: toObjectId(query.productId) };
  const [reviews, total] = await Promise.all([
    ReviewModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    ReviewModel.countDocuments(filter),
  ]);
  const users = await UserModel.find({ _id: { $in: reviews.map((r) => r.userId) } }).select('name').lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));

  res.json(
    toPage(
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
    ),
  );
});

reviewRouter.get('/eligibility/:productId', authenticate, validate(eligibilitySchemas), async (req, res) => {
  const { params } = validated<typeof eligibilitySchemas>(req);
  const userId = currentUserId(req);
  const [purchased, existing] = await Promise.all([
    hasDeliveredPurchase(userId, params.productId),
    ReviewModel.exists({ productId: params.productId, userId }),
  ]);
  res.json({ canReview: Boolean(purchased) && !existing, alreadyReviewed: Boolean(existing) });
});

reviewRouter.post('/', authenticate, validate(createSchemas), async (req, res) => {
  const { body } = validated<typeof createSchemas>(req);
  const userId = currentUserId(req);

  if (!(await hasDeliveredPurchase(userId, body.productId))) {
    throw AppError.forbidden('Only customers who received this product can review it');
  }
  const review = await ReviewModel.create({ ...body, userId: toObjectId(userId), verifiedPurchase: true }); // duplicate → 409
  await recomputeRating(body.productId);
  res.status(201).json({ id: review.id });
});
