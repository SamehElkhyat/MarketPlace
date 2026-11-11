import type { RequestHandler } from 'express';
import type { UserRole } from '../config/constants';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../services/token.service';

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Requires a valid access token. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw ApiError.unauthenticated();
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
    if (!req.auth) throw ApiError.unauthenticated();
    if (!roles.includes(req.auth.role)) throw ApiError.forbidden();
    next();
  };

export function currentUserId(req: Express.Request): string {
  if (!req.auth) throw ApiError.unauthenticated();
  return req.auth.userId;
}

/** The read-only demo reviewer may use GET/HEAD on back-office routes and nothing else. */
export const denyDemoWrites: RequestHandler = (req, _res, next) => {
  if (req.auth?.role === 'demo_admin' && !['GET', 'HEAD'].includes(req.method)) {
    throw ApiError.forbidden('This is a read-only demo account');
  }
  next();
};
