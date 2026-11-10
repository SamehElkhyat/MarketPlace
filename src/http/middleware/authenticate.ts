import type { RequestHandler } from 'express';
import type { UserRole } from '../../config/constants';
import { AppError } from '../../lib/errors';
import { verifyAccessToken } from '../../modules/auth/tokens';

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Requires a valid access token. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw AppError.unauthenticated();
  req.auth = await verifyAccessToken(token);
  next();
};

/** Attaches `req.auth` when a valid token is present; anonymous requests pass through. */
export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (token) {
    try {
      req.auth = await verifyAccessToken(token);
    } catch {
      // Treat an expired/invalid token as anonymous; the client refreshes on 401 from protected routes.
    }
  }
  next();
};

/** RBAC — enforced on the server for every protected endpoint (never just hidden in the UI). */
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) throw AppError.unauthenticated();
    if (!roles.includes(req.auth.role)) throw AppError.forbidden();
    next();
  };

export function currentUserId(req: Express.Request): string {
  if (!req.auth) throw AppError.unauthenticated();
  return req.auth.userId;
}
