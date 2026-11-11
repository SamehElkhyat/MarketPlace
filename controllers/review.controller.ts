import type { RequestHandler } from 'express';
import { currentUserId } from '../middleware/auth.middleware';
import { validated } from '../middleware/validate.middleware';
import { reviewService } from '../services/review.service';
import type {
  createReviewSchemas,
  eligibilitySchemas,
  listReviewsSchemas,
} from '../validators/review.validators';

export const listReviews: RequestHandler = async (req, res) => {
  const { query } = validated<typeof listReviewsSchemas>(req);
  res.json(await reviewService.list(query.productId, query));
};

export const getEligibility: RequestHandler = async (req, res) => {
  const { params } = validated<typeof eligibilitySchemas>(req);
  res.json(await reviewService.eligibility(currentUserId(req), params.productId));
};

export const createReview: RequestHandler = async (req, res) => {
  const { body } = validated<typeof createReviewSchemas>(req);
  const review = await reviewService.create(currentUserId(req), body);
  res.status(201).json({ id: review.id });
};
