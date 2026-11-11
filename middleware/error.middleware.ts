import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.path}`));
};

interface MongoDuplicateKeyError {
  code: 11000;
  keyPattern?: Record<string, unknown>;
}

const isDuplicateKey = (error: unknown): error is MongoDuplicateKeyError =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

function toAppError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.validation(
      error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message, code: issue.code })),
    );
  }
  if (isDuplicateKey(error)) {
    return ApiError.conflict('Duplicate value', 'CONFLICT', { fields: Object.keys(error.keyPattern ?? {}) });
  }
  const named = error as { name?: string; status?: number; type?: string };
  if (named?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');
  if (named?.type === 'entity.too.large') return new ApiError(413, 'BAD_REQUEST', 'Request body too large');
  if (named?.name === 'CastError') return ApiError.badRequest('Invalid identifier');

  return new ApiError(500, 'INTERNAL', 'Internal server error');
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const appError = toAppError(error);

  if (appError.status >= 500) {
    (req as { log?: typeof logger }).log?.error({ err: error }, 'unhandled error');
    if (!(req as { log?: unknown }).log) logger.error({ err: error }, 'unhandled error');
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.status >= 500 ? 'Internal server error' : appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      requestId: String(req.id ?? ''),
    },
  });
};
