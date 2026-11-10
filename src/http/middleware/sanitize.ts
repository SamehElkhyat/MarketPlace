import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors';

/**
 * NoSQL-injection guard. Rejects any object key beginning with `$` (operator injection such as
 * `{ "email": { "$ne": null } }`) or containing `.` in bodies (field-path injection), at any depth.
 * Zod still validates shapes afterwards; this is defence in depth that also covers free-form maps.
 */
function findForbiddenKey(value: unknown, allowDots: boolean, depth = 0): string | null {
  if (depth > 12) return '<too deep>';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item, allowDots, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('$') || (!allowDots && key.includes('.'))) return key;
      const found = findForbiddenKey(child, allowDots, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export const sanitizeInput: RequestHandler = (req, _res, next) => {
  const offending =
    findForbiddenKey(req.body, false) ??
    findForbiddenKey(req.query, true) ??
    findForbiddenKey(req.params, true);
  if (offending) throw AppError.badRequest('Request contains forbidden keys', { key: offending });
  next();
};
