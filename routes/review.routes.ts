import { Router } from 'express';
import { createReview, getEligibility, listReviews } from '../controllers/review.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createReviewSchemas, eligibilitySchemas, listReviewsSchemas } from '../validators/review.validators';

/** Mounted at `/api/reviews`. */
export const reviewRouter = Router();
reviewRouter.get('/', validate(listReviewsSchemas), listReviews);
reviewRouter.get('/eligibility/:productId', authenticate, validate(eligibilitySchemas), getEligibility);
reviewRouter.post('/', authenticate, validate(createReviewSchemas), createReview);
