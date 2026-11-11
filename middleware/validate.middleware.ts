import type { Request, RequestHandler } from 'express';
import type { z, ZodType } from 'zod';

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

type Output<S, K extends keyof RequestSchemas> = S extends { [P in K]: infer T extends ZodType }
  ? z.output<T>
  : undefined;

export interface Validated<S extends RequestSchemas> {
  body: Output<S, 'body'>;
  query: Output<S, 'query'>;
  params: Output<S, 'params'>;
}

/**
 * Validates and parses body/query/params with Zod. Express 5 made `req.query` read-only, so parsed
 * values live on `req.validated` and are read back (fully typed) with {@link validated}.
 * Zod errors bubble to the central error handler (→ 422 VALIDATION_ERROR).
 */
export function validate<S extends RequestSchemas>(schemas: S): RequestHandler {
  return (req, _res, next) => {
    req.validated = {
      body: schemas.body ? schemas.body.parse(req.body) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
}

export function validated<S extends RequestSchemas>(req: Request): Validated<S> {
  if (!req.validated) throw new Error('validated() called on a route without validate() middleware');
  return req.validated as Validated<S>;
}
