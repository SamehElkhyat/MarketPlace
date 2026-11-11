import { z } from 'zod';

/** Blank values in `.env` files (KEY=) should behave like "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  /** Reverse-proxy hops in front of the API (Express `trust proxy`). Tune so rate limits see the real client IP. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

  /** Public URL of the storefront. Used to build links inside emails. */
  APP_URL: z.url().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  REQUIRE_VERIFIED_EMAIL_FOR_ORDERS: bool,

  GOOGLE_CLIENT_ID: optional(z.string()),

  /** Multiplies every rate-limit budget. Leave at 1 in production; raise it for E2E/load tests only. */
  RATE_LIMIT_SCALE: z.coerce.number().int().min(1).max(1000).default(1),

  UPSTASH_REDIS_REST_URL: optional(z.url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string()),

  CLOUDINARY_CLOUD_NAME: optional(z.string()),
  CLOUDINARY_API_KEY: optional(z.string()),
  CLOUDINARY_API_SECRET: optional(z.string()),

  RESEND_API_KEY: optional(z.string()),
  SMTP_URL: optional(z.string()),
  EMAIL_FROM: z.string().default('Atelier <no-reply@example.com>'),

  SENTRY_DSN: optional(z.url()),

  /** Max cash-on-delivery order value, in piasters (default 20,000 EGP). */
  COD_MAX_AMOUNT: z.coerce.number().int().positive().default(2_000_000),

  /** Enables the Mock payment provider (demo + tests, no real keys needed). */
  PAYMENTS_MOCK_ENABLED: bool,
  PAYMENTS_MOCK_SECRET: optional(z.string().min(8)),

  /** Revalidation hook the API calls when a product changes (Next.js on-demand ISR). */
  REVALIDATE_URL: optional(z.url()),
  REVALIDATE_SECRET: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
