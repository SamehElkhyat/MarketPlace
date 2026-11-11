import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { PAYMENT_METHODS } from './constants';
import {
  forgotPasswordSchemas,
  googleSchemas,
  loginSchemas,
  registerSchemas,
  resetPasswordSchemas,
  verifyEmailSchemas,
} from '../validators/auth.validators';
import { productBodySchema, PRODUCT_SORTS } from '../validators/product.validators';

extendZodWithOpenApi(z);

/**
 * OpenAPI is generated from the SAME Zod schemas that validate requests at runtime, so the
 * documentation can never drift from the behaviour.
 */
const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });

const bearer = [{ bearerAuth: [] }];
const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const ok = (description: string) => ({ 200: { description } });
const errors = { 401: { description: 'UNAUTHENTICATED' }, 403: { description: 'FORBIDDEN' }, 422: { description: 'VALIDATION_ERROR' } };

// ── Auth ─────────────────────────────────────────────────────────────────────
registry.registerPath({ method: 'post', path: '/api/auth/register', tags: ['Auth'], summary: 'Register with e-mail + password (sends a verification e-mail)', request: { body: json(registerSchemas.body) }, responses: { 201: { description: 'Returns an access token; the refresh token is set as an httpOnly cookie' }, 409: { description: 'EMAIL_TAKEN' } } });
registry.registerPath({ method: 'post', path: '/api/auth/login', tags: ['Auth'], summary: 'Sign in (rate limited)', request: { body: json(loginSchemas.body) }, responses: { ...ok('Access token + refresh cookie'), 401: { description: 'INVALID_CREDENTIALS' }, 429: { description: 'RATE_LIMITED' } } });
registry.registerPath({ method: 'post', path: '/api/auth/google', tags: ['Auth'], summary: 'Sign in with a Google ID token', request: { body: json(googleSchemas.body) }, responses: ok('Access token + refresh cookie') });
registry.registerPath({ method: 'post', path: '/api/auth/refresh', tags: ['Auth'], summary: 'Rotate the refresh token (cookie). Re-using an old token revokes the whole session family.', responses: { ...ok('New access token + rotated refresh cookie'), 401: { description: 'UNAUTHENTICATED or TOKEN_REUSE_DETECTED' } } });
registry.registerPath({ method: 'post', path: '/api/auth/logout', tags: ['Auth'], summary: 'Sign out this device', responses: { 204: { description: 'Signed out' } } });
registry.registerPath({ method: 'post', path: '/api/auth/logout-all', tags: ['Auth'], summary: 'Sign out of every device', security: bearer, responses: { 204: { description: 'All sessions revoked' } } });
registry.registerPath({ method: 'post', path: '/api/auth/verify-email', tags: ['Auth'], summary: 'Confirm e-mail address (one-time token)', request: { body: json(verifyEmailSchemas.body) }, responses: { 204: { description: 'Verified' } } });
registry.registerPath({ method: 'post', path: '/api/auth/forgot-password', tags: ['Auth'], summary: 'Request a reset link (valid 15 min, single use)', request: { body: json(forgotPasswordSchemas.body) }, responses: { 202: { description: 'Always 202 — never reveals whether the e-mail exists' } } });
registry.registerPath({ method: 'post', path: '/api/auth/reset-password', tags: ['Auth'], summary: 'Set a new password and revoke all sessions', request: { body: json(resetPasswordSchemas.body) }, responses: { 204: { description: 'Password changed' } } });

// ── Catalogue ────────────────────────────────────────────────────────────────
registry.registerPath({
  method: 'get',
  path: '/api/products',
  tags: ['Catalogue'],
  summary: 'List/search products with dynamic facets',
  description: 'Returns items, pagination and facets (brand/attribute counts + price range). Repeat `attr=key:value` for attribute filters.',
  request: {
    query: z.object({
      q: z.string().optional(),
      category: z.string().optional().describe('Category slug (includes all descendants)'),
      brand: z.string().optional().describe('Comma separated brand slugs'),
      collection: z.string().optional(),
      minPrice: z.number().int().optional().describe('Piasters'),
      maxPrice: z.number().int().optional().describe('Piasters'),
      rating: z.number().optional(),
      inStock: z.boolean().optional(),
      attr: z.array(z.string()).optional().describe('e.g. size:M'),
      sort: z.enum(PRODUCT_SORTS).optional(),
      page: z.number().int().optional(),
      limit: z.number().int().optional(),
    }),
  },
  responses: ok('Products + facets'),
});
registry.registerPath({ method: 'get', path: '/api/products/suggest', tags: ['Catalogue'], summary: 'Type-ahead suggestions (Arabic + English)', request: { query: z.object({ q: z.string() }) }, responses: ok('Suggestions') });
registry.registerPath({ method: 'get', path: '/api/products/{slug}', tags: ['Catalogue'], summary: 'Product details, breadcrumbs, option definitions, related products', request: { params: z.object({ slug: z.string() }) }, responses: { ...ok('Product'), 404: { description: 'NOT_FOUND' } } });
registry.registerPath({ method: 'get', path: '/api/categories', tags: ['Catalogue'], summary: 'Category tree (max 3 levels)', responses: ok('Tree') });
registry.registerPath({ method: 'get', path: '/api/categories/{slug}', tags: ['Catalogue'], summary: 'Category with inherited attribute definitions (drives the dynamic filters)', request: { params: z.object({ slug: z.string() }) }, responses: ok('Category') });
registry.registerPath({ method: 'post', path: '/api/admin/products', tags: ['Admin'], summary: 'Create a product (validated against its category attributes)', security: bearer, request: { body: json(productBodySchema) }, responses: { 201: { description: 'Created' }, ...errors } });

// ── Cart, checkout, orders ───────────────────────────────────────────────────
registry.registerPath({ method: 'post', path: '/api/cart/preview', tags: ['Cart'], summary: 'Price a guest cart (nothing is stored)', request: { body: json(z.object({ items: z.array(z.object({ sku: z.string(), qty: z.number().int() })) })) }, responses: ok('Priced cart with stock/price warnings') });
registry.registerPath({ method: 'post', path: '/api/cart/merge', tags: ['Cart'], summary: 'Merge the guest cart into the account cart after sign-in', security: bearer, request: { body: json(z.object({ items: z.array(z.object({ sku: z.string(), qty: z.number().int() })) })) }, responses: ok('Merged cart') });
registry.registerPath({ method: 'get', path: '/api/checkout/payment-methods', tags: ['Checkout'], summary: 'Payment methods; unavailable ones are flagged `comingSoon`', responses: ok('Methods') });
registry.registerPath({ method: 'post', path: '/api/checkout/quote', tags: ['Checkout'], summary: 'Server-computed totals (subtotal, shipping, discount, total)', security: bearer, request: { body: json(z.object({ addressId: z.string().optional(), couponCode: z.string().optional() })) }, responses: ok('Quote') });
registry.registerPath({
  method: 'post',
  path: '/api/orders',
  tags: ['Orders'],
  summary: 'Place an order (idempotent, transactional, server-priced)',
  description: 'Requires an `Idempotency-Key` header. Repeating the request with the same key returns the original order (HTTP 200).',
  security: bearer,
  request: {
    body: json(z.object({ addressId: z.string(), paymentMethod: z.enum(PAYMENT_METHODS), couponCode: z.string().optional(), note: z.string().optional(), expectedTotal: z.number().int().optional() })),
  },
  responses: { 201: { description: 'Order created' }, 200: { description: 'Replay of an earlier identical request' }, 409: { description: 'INSUFFICIENT_STOCK or PRICE_CHANGED' }, 422: { description: 'COD_LIMIT_EXCEEDED, COUPON_INVALID, PAYMENT_METHOD_UNAVAILABLE…' } },
});
registry.registerPath({ method: 'post', path: '/api/orders/{orderNumber}/cancel', tags: ['Orders'], summary: 'Cancel before processing — stock is restored', security: bearer, request: { params: z.object({ orderNumber: z.string() }) }, responses: { ...ok('Cancelled order'), 422: { description: 'INVALID_TRANSITION' } } });
registry.registerPath({ method: 'post', path: '/api/admin/orders/{id}/transition', tags: ['Admin'], summary: 'Move an order along its lifecycle (state machine enforced)', security: bearer, request: { params: z.object({ id: z.string() }), body: json(z.object({ to: z.string(), note: z.string().optional() })) }, responses: { ...ok('Updated order'), 422: { description: 'INVALID_TRANSITION' } } });

// ── Payments ─────────────────────────────────────────────────────────────────
registry.registerPath({ method: 'post', path: '/api/payments/webhooks/{provider}', tags: ['Payments'], summary: 'Gateway callback — HMAC verified, idempotent, amount-checked', request: { params: z.object({ provider: z.string() }) }, responses: { 200: { description: 'Acknowledged' }, 401: { description: 'INVALID_SIGNATURE' } } });

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Atelier Marketplace API',
      version: '1.0.0',
      description:
        'REST API for the storefront. All prices are **integer piasters** (1 EGP = 100). Errors use `{ error: { code, message, details?, requestId } }`.',
    },
    servers: [{ url: '/' }],
  });
}
