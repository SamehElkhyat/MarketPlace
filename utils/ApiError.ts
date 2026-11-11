export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'TOKEN_REUSE_DETECTED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'ACCOUNT_BANNED'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_TAKEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'PRODUCT_UNAVAILABLE'
  | 'INVALID_TRANSITION'
  | 'COUPON_INVALID'
  | 'PRICE_CHANGED'
  | 'EMAIL_UNVERIFIED_FOR_ORDER'
  | 'EMPTY_CART'
  | 'SHIPPING_UNAVAILABLE'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'COD_LIMIT_EXCEEDED'
  | 'INVALID_SIGNATURE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/**
 * Operational error with a stable machine-readable `code`.
 * The frontend maps `code` to a localized message; `message` is for logs/developers.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static validation(details: unknown, message = 'Validation failed') {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
  static unauthenticated(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHENTICATED', message);
  }
  static invalidCredentials() {
    return new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(what = 'Resource') {
    return new ApiError(404, 'NOT_FOUND', `${what} not found`);
  }
  static conflict(message: string, code: ErrorCode = 'CONFLICT', details?: unknown) {
    return new ApiError(409, code, message, details);
  }
  static unprocessable(code: ErrorCode, message: string, details?: unknown) {
    return new ApiError(422, code, message, details);
  }
  static tooManyRequests(retryAfterSeconds: number) {
    return new ApiError(429, 'RATE_LIMITED', 'Too many requests, please try again later', {
      retryAfterSeconds,
    });
  }
}
