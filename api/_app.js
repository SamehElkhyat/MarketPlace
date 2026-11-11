var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/config/env.ts
import { z } from "zod";
function loadEnv(source = process.env) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details2 = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:
${details2}`);
  }
  return parsed.data;
}
var optional, bool, envSchema, env, isProduction, isTest;
var init_env = __esm({
  "src/config/env.ts"() {
    "use strict";
    optional = (schema) => z.preprocess((value) => value === "" ? void 0 : value, schema.optional());
    bool = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
    envSchema = z.object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      PORT: z.coerce.number().int().positive().default(4e3),
      LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
      MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
      /** Reverse-proxy hops in front of the API (Express `trust proxy`). Tune so rate limits see the real client IP. */
      TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
      /** Public URL of the storefront. Used to build links inside emails. */
      APP_URL: z.url().default("http://localhost:3000"),
      JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
      ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
      REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
      BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
      REQUIRE_VERIFIED_EMAIL_FOR_ORDERS: bool,
      GOOGLE_CLIENT_ID: optional(z.string()),
      /** Multiplies every rate-limit budget. Leave at 1 in production; raise it for E2E/load tests only. */
      RATE_LIMIT_SCALE: z.coerce.number().int().min(1).max(1e3).default(1),
      UPSTASH_REDIS_REST_URL: optional(z.url()),
      UPSTASH_REDIS_REST_TOKEN: optional(z.string()),
      CLOUDINARY_CLOUD_NAME: optional(z.string()),
      CLOUDINARY_API_KEY: optional(z.string()),
      CLOUDINARY_API_SECRET: optional(z.string()),
      RESEND_API_KEY: optional(z.string()),
      SMTP_URL: optional(z.string()),
      EMAIL_FROM: z.string().default("Atelier <no-reply@example.com>"),
      SENTRY_DSN: optional(z.url()),
      /** Max cash-on-delivery order value, in piasters (default 20,000 EGP). */
      COD_MAX_AMOUNT: z.coerce.number().int().positive().default(2e6),
      /** Enables the Mock payment provider (demo + tests, no real keys needed). */
      PAYMENTS_MOCK_ENABLED: bool,
      PAYMENTS_MOCK_SECRET: optional(z.string().min(8)),
      /** Revalidation hook the API calls when a product changes (Next.js on-demand ISR). */
      REVALIDATE_URL: optional(z.url()),
      REVALIDATE_SECRET: optional(z.string())
    });
    env = loadEnv();
    isProduction = env.NODE_ENV === "production";
    isTest = env.NODE_ENV === "test";
  }
});

// src/lib/logger.ts
import { pino } from "pino";
var prettyLogs, logger;
var init_logger = __esm({
  "src/lib/logger.ts"() {
    "use strict";
    init_env();
    prettyLogs = env.NODE_ENV === "development" && !process.env["VERCEL"];
    logger = pino({
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'res.headers["set-cookie"]',
          "*.password",
          "*.passwordHash",
          "*.refreshToken"
        ],
        censor: "[redacted]"
      },
      ...prettyLogs ? { transport: { target: "pino-pretty", options: { colorize: true, singleLine: true } } } : {}
    });
  }
});

// src/lib/db.ts
import mongoose from "mongoose";
async function connectDb(uri = env.MONGODB_URI) {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;
  cache.promise ??= mongoose.connect(uri, {
    // Small pool: each serverless instance handles few concurrent requests.
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8e3,
    autoIndex: env.NODE_ENV !== "production"
  }).then((m) => {
    logger.info("MongoDB connected");
    return m;
  });
  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
  return cache.conn;
}
var globalForMongoose, cache;
var init_db = __esm({
  "src/lib/db.ts"() {
    "use strict";
    init_env();
    init_logger();
    globalForMongoose = globalThis;
    cache = globalForMongoose.__mongooseCache ??= { conn: null, promise: null };
  }
});

// src/http/health.ts
import mongoose2 from "mongoose";
var health;
var init_health = __esm({
  "src/http/health.ts"() {
    "use strict";
    init_db();
    health = async (_req, res) => {
      let db = "down";
      try {
        await connectDb();
        await mongoose2.connection.db?.admin().ping();
        db = "up";
      } catch {
      }
      res.status(db === "up" ? 200 : 503).json({
        status: db === "up" ? "ok" : "degraded",
        db,
        uptimeSeconds: Math.round(process.uptime()),
        time: (/* @__PURE__ */ new Date()).toISOString()
      });
    };
  }
});

// src/lib/errors.ts
var AppError;
var init_errors = __esm({
  "src/lib/errors.ts"() {
    "use strict";
    AppError = class _AppError extends Error {
      constructor(status, code, message, details2) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details2;
        this.name = "AppError";
      }
      status;
      code;
      details;
      static badRequest(message = "Bad request", details2) {
        return new _AppError(400, "BAD_REQUEST", message, details2);
      }
      static validation(details2, message = "Validation failed") {
        return new _AppError(422, "VALIDATION_ERROR", message, details2);
      }
      static unauthenticated(message = "Authentication required") {
        return new _AppError(401, "UNAUTHENTICATED", message);
      }
      static invalidCredentials() {
        return new _AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
      }
      static forbidden(message = "You do not have permission to perform this action") {
        return new _AppError(403, "FORBIDDEN", message);
      }
      static notFound(what = "Resource") {
        return new _AppError(404, "NOT_FOUND", `${what} not found`);
      }
      static conflict(message, code = "CONFLICT", details2) {
        return new _AppError(409, code, message, details2);
      }
      static unprocessable(code, message, details2) {
        return new _AppError(422, code, message, details2);
      }
      static tooManyRequests(retryAfterSeconds) {
        return new _AppError(429, "RATE_LIMITED", "Too many requests, please try again later", {
          retryAfterSeconds
        });
      }
    };
  }
});

// src/http/middleware/error-handler.ts
import { ZodError } from "zod";
function toAppError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return AppError.validation(
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message, code: issue.code }))
    );
  }
  if (isDuplicateKey(error)) {
    return AppError.conflict("Duplicate value", "CONFLICT", { fields: Object.keys(error.keyPattern ?? {}) });
  }
  const named = error;
  if (named?.type === "entity.parse.failed") return AppError.badRequest("Malformed JSON body");
  if (named?.type === "entity.too.large") return new AppError(413, "BAD_REQUEST", "Request body too large");
  if (named?.name === "CastError") return AppError.badRequest("Invalid identifier");
  return new AppError(500, "INTERNAL", "Internal server error");
}
var notFoundHandler, isDuplicateKey, errorHandler;
var init_error_handler = __esm({
  "src/http/middleware/error-handler.ts"() {
    "use strict";
    init_errors();
    init_logger();
    notFoundHandler = (req, _res, next) => {
      next(AppError.notFound(`Route ${req.method} ${req.path}`));
    };
    isDuplicateKey = (error) => typeof error === "object" && error !== null && error.code === 11e3;
    errorHandler = (error, req, res, _next) => {
      const appError = toAppError(error);
      if (appError.status >= 500) {
        req.log?.error({ err: error }, "unhandled error");
        if (!req.log) logger.error({ err: error }, "unhandled error");
      }
      res.status(appError.status).json({
        error: {
          code: appError.code,
          message: appError.status >= 500 ? "Internal server error" : appError.message,
          ...appError.details !== void 0 ? { details: appError.details } : {},
          requestId: String(req.id ?? "")
        }
      });
    };
  }
});

// src/http/middleware/sanitize.ts
function findForbiddenKey(value, allowDots, depth = 0) {
  if (depth > 12) return "<too deep>";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item, allowDots, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith("$") || !allowDots && key.includes(".")) return key;
      const found = findForbiddenKey(child, allowDots, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
var sanitizeInput;
var init_sanitize = __esm({
  "src/http/middleware/sanitize.ts"() {
    "use strict";
    init_errors();
    sanitizeInput = (req, _res, next) => {
      const offending = findForbiddenKey(req.body, false) ?? findForbiddenKey(req.query, true) ?? findForbiddenKey(req.params, true);
      if (offending) throw AppError.badRequest("Request contains forbidden keys", { key: offending });
      next();
    };
  }
});

// src/lib/sentry.ts
import * as Sentry from "@sentry/node";
function initSentry() {
  if (initialised || !env.SENTRY_DSN) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });
  initialised = true;
}
function attachSentryErrorHandler(app) {
  if (initialised) Sentry.setupExpressErrorHandler(app);
}
var initialised;
var init_sentry = __esm({
  "src/lib/sentry.ts"() {
    "use strict";
    init_env();
    initialised = false;
  }
});

// src/config/constants.ts
var USER_ROLES, USER_STATUSES, PRODUCT_STATUSES, MAX_CATEGORY_DEPTH, PAYMENT_METHODS, GOVERNORATES, GOVERNORATE_KEYS;
var init_constants = __esm({
  "src/config/constants.ts"() {
    "use strict";
    USER_ROLES = ["customer", "admin", "demo_admin"];
    USER_STATUSES = ["active", "banned"];
    PRODUCT_STATUSES = ["draft", "published"];
    MAX_CATEGORY_DEPTH = 3;
    PAYMENT_METHODS = ["cod", "card", "wallet", "fawry"];
    GOVERNORATES = [
      { key: "cairo", ar: "\u0627\u0644\u0642\u0627\u0647\u0631\u0629", en: "Cairo" },
      { key: "giza", ar: "\u0627\u0644\u062C\u064A\u0632\u0629", en: "Giza" },
      { key: "alexandria", ar: "\u0627\u0644\u0625\u0633\u0643\u0646\u062F\u0631\u064A\u0629", en: "Alexandria" },
      { key: "dakahlia", ar: "\u0627\u0644\u062F\u0642\u0647\u0644\u064A\u0629", en: "Dakahlia" },
      { key: "red-sea", ar: "\u0627\u0644\u0628\u062D\u0631 \u0627\u0644\u0623\u062D\u0645\u0631", en: "Red Sea" },
      { key: "beheira", ar: "\u0627\u0644\u0628\u062D\u064A\u0631\u0629", en: "Beheira" },
      { key: "fayoum", ar: "\u0627\u0644\u0641\u064A\u0648\u0645", en: "Fayoum" },
      { key: "gharbia", ar: "\u0627\u0644\u063A\u0631\u0628\u064A\u0629", en: "Gharbia" },
      { key: "ismailia", ar: "\u0627\u0644\u0625\u0633\u0645\u0627\u0639\u064A\u0644\u064A\u0629", en: "Ismailia" },
      { key: "monufia", ar: "\u0627\u0644\u0645\u0646\u0648\u0641\u064A\u0629", en: "Monufia" },
      { key: "minya", ar: "\u0627\u0644\u0645\u0646\u064A\u0627", en: "Minya" },
      { key: "qalyubia", ar: "\u0627\u0644\u0642\u0644\u064A\u0648\u0628\u064A\u0629", en: "Qalyubia" },
      { key: "new-valley", ar: "\u0627\u0644\u0648\u0627\u062F\u064A \u0627\u0644\u062C\u062F\u064A\u062F", en: "New Valley" },
      { key: "suez", ar: "\u0627\u0644\u0633\u0648\u064A\u0633", en: "Suez" },
      { key: "aswan", ar: "\u0623\u0633\u0648\u0627\u0646", en: "Aswan" },
      { key: "assiut", ar: "\u0623\u0633\u064A\u0648\u0637", en: "Assiut" },
      { key: "beni-suef", ar: "\u0628\u0646\u064A \u0633\u0648\u064A\u0641", en: "Beni Suef" },
      { key: "port-said", ar: "\u0628\u0648\u0631\u0633\u0639\u064A\u062F", en: "Port Said" },
      { key: "damietta", ar: "\u062F\u0645\u064A\u0627\u0637", en: "Damietta" },
      { key: "sharqia", ar: "\u0627\u0644\u0634\u0631\u0642\u064A\u0629", en: "Sharqia" },
      { key: "south-sinai", ar: "\u062C\u0646\u0648\u0628 \u0633\u064A\u0646\u0627\u0621", en: "South Sinai" },
      { key: "kafr-el-sheikh", ar: "\u0643\u0641\u0631 \u0627\u0644\u0634\u064A\u062E", en: "Kafr El Sheikh" },
      { key: "matrouh", ar: "\u0645\u0637\u0631\u0648\u062D", en: "Matrouh" },
      { key: "luxor", ar: "\u0627\u0644\u0623\u0642\u0635\u0631", en: "Luxor" },
      { key: "qena", ar: "\u0642\u0646\u0627", en: "Qena" },
      { key: "north-sinai", ar: "\u0634\u0645\u0627\u0644 \u0633\u064A\u0646\u0627\u0621", en: "North Sinai" },
      { key: "sohag", ar: "\u0633\u0648\u0647\u0627\u062C", en: "Sohag" }
    ];
    GOVERNORATE_KEYS = GOVERNORATES.map((g) => g.key);
  }
});

// src/lib/object-id.ts
import { Types } from "mongoose";
import { z as z2 } from "zod";
var objectIdSchema, toObjectId;
var init_object_id = __esm({
  "src/lib/object-id.ts"() {
    "use strict";
    objectIdSchema = z2.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
    toObjectId = (id) => typeof id === "string" ? new Types.ObjectId(id) : id;
  }
});

// src/lib/schemas.ts
import { z as z3 } from "zod";
function toPage(items, total, { page, limit }) {
  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
var localizedSchema, localizedOptionalLongSchema, piastersSchema, slugSchema, attributeKeySchema, idParams, paginationQuery, phoneSchema, passwordSchema, emailSchema;
var init_schemas = __esm({
  "src/lib/schemas.ts"() {
    "use strict";
    init_object_id();
    localizedSchema = z3.object({
      ar: z3.string().trim().min(1).max(200),
      en: z3.string().trim().min(1).max(200)
    });
    localizedOptionalLongSchema = z3.object({
      ar: z3.string().trim().max(5e3).default(""),
      en: z3.string().trim().max(5e3).default("")
    });
    piastersSchema = z3.number().int().nonnegative().max(1e9);
    slugSchema = z3.string().trim().min(1).max(80).regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, "Invalid slug");
    attributeKeySchema = z3.string().regex(/^[a-z][a-z0-9_]{0,31}$/, "Invalid key");
    idParams = z3.object({ id: objectIdSchema });
    paginationQuery = z3.object({
      page: z3.coerce.number().int().min(1).default(1),
      limit: z3.coerce.number().int().min(1).max(100).default(20)
    });
    phoneSchema = z3.string().trim().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number");
    passwordSchema = z3.string().min(8, "Password must be at least 8 characters").max(128).regex(/[A-Za-z]/, "Password must contain a letter").regex(/[0-9]/, "Password must contain a number");
    emailSchema = z3.string().trim().toLowerCase().pipe(z3.email().max(254));
  }
});

// src/modules/auth/auth.schemas.ts
import { z as z4 } from "zod";
var registerSchemas, loginSchemas, googleSchemas, verifyEmailSchemas, forgotPasswordSchemas, resetPasswordSchemas;
var init_auth_schemas = __esm({
  "src/modules/auth/auth.schemas.ts"() {
    "use strict";
    init_schemas();
    registerSchemas = {
      body: z4.object({
        name: z4.string().trim().min(2).max(120),
        email: emailSchema,
        password: passwordSchema,
        locale: z4.enum(["ar", "en"]).default("ar")
      })
    };
    loginSchemas = {
      body: z4.object({ email: emailSchema, password: z4.string().min(1).max(128) })
    };
    googleSchemas = {
      body: z4.object({ credential: z4.string().min(20), locale: z4.enum(["ar", "en"]).default("ar") })
    };
    verifyEmailSchemas = { body: z4.object({ token: z4.string().min(20).max(200) }) };
    forgotPasswordSchemas = { body: z4.object({ email: emailSchema }) };
    resetPasswordSchemas = {
      body: z4.object({ token: z4.string().min(20).max(200), password: passwordSchema })
    };
  }
});

// src/modules/products/product.schemas.ts
import { z as z5 } from "zod";
var skuSchema, variantInputSchema, imageSchema, productBodySchema, createProductSchemas, updateProductSchemas, productIdSchemas, productSlugSchemas, csvList, oneOrMany, PRODUCT_SORTS, listProductsSchemas, suggestSchemas, adminListProductsSchemas;
var init_product_schemas = __esm({
  "src/modules/products/product.schemas.ts"() {
    "use strict";
    init_constants();
    init_object_id();
    init_schemas();
    skuSchema = z5.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'SKU must be 2\u201340 chars: letters, digits, "-" or "_"');
    variantInputSchema = z5.object({
      sku: skuSchema,
      optionValues: z5.record(attributeKeySchema, z5.string().trim().min(1).max(60)).default({}),
      price: piastersSchema,
      compareAtPrice: piastersSchema.optional(),
      /** Initial stock for NEW variants only. Existing variants keep their live stock (use inventory adjust). */
      stock: z5.number().int().min(0).max(1e6).default(0)
    });
    imageSchema = z5.object({
      url: z5.url(),
      publicId: z5.string().max(200).optional(),
      alt: z5.string().max(200).optional()
    });
    productBodySchema = z5.object({
      title: localizedSchema,
      slug: slugSchema.optional(),
      description: localizedOptionalLongSchema.default({ ar: "", en: "" }),
      categoryId: objectIdSchema,
      brandId: objectIdSchema.optional(),
      images: z5.array(imageSchema).max(12).default([]),
      specs: z5.record(attributeKeySchema, z5.string().trim().max(200)).default({}),
      options: z5.array(z5.object({ key: attributeKeySchema, values: z5.array(z5.string().trim().min(1).max(60)).min(1).max(50) })).max(5).default([]),
      variants: z5.array(variantInputSchema).min(1).max(100),
      tags: z5.array(z5.string().trim().min(1).max(40)).max(20).default([]),
      status: z5.enum(PRODUCT_STATUSES).default("draft")
    });
    createProductSchemas = { body: productBodySchema };
    updateProductSchemas = { params: idParams, body: productBodySchema };
    productIdSchemas = { params: idParams };
    productSlugSchemas = { params: z5.object({ slug: slugSchema }) };
    csvList = z5.string().transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)).pipe(z5.array(z5.string().max(80)).max(30));
    oneOrMany = (schema) => z5.union([schema, z5.array(schema)]).transform((v) => Array.isArray(v) ? v : [v]);
    PRODUCT_SORTS = ["newest", "price_asc", "price_desc", "bestselling", "rating"];
    listProductsSchemas = {
      query: paginationQuery.extend({
        limit: z5.coerce.number().int().min(1).max(60).default(24),
        q: z5.string().trim().max(100).optional(),
        category: slugSchema.optional(),
        brand: csvList.optional(),
        collection: slugSchema.optional(),
        minPrice: z5.coerce.number().int().min(0).optional(),
        maxPrice: z5.coerce.number().int().min(0).optional(),
        rating: z5.coerce.number().min(1).max(5).optional(),
        inStock: z5.enum(["true", "false"]).transform((v) => v === "true").optional(),
        onSale: z5.enum(["true", "false"]).transform((v) => v === "true").optional(),
        /** Repeatable `attr=key:value` pairs (e.g. `attr=size:M&attr=color:black`). */
        attr: oneOrMany(z5.string().regex(/^[a-z][a-z0-9_]{0,31}:.{1,60}$/)).optional(),
        sort: z5.enum(PRODUCT_SORTS).default("newest")
      })
    };
    suggestSchemas = {
      query: z5.object({ q: z5.string().trim().min(1).max(60), limit: z5.coerce.number().int().min(1).max(10).default(6) })
    };
    adminListProductsSchemas = {
      query: paginationQuery.extend({
        q: z5.string().trim().max(100).optional(),
        status: z5.enum(PRODUCT_STATUSES).optional(),
        category: objectIdSchema.optional(),
        lowStock: z5.coerce.number().int().min(0).max(1e3).optional()
      })
    };
  }
});

// src/openapi/spec.ts
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z as z6 } from "zod";
function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Atelier Marketplace API",
      version: "1.0.0",
      description: "REST API for the storefront. All prices are **integer piasters** (1 EGP = 100). Errors use `{ error: { code, message, details?, requestId } }`."
    },
    servers: [{ url: "/" }]
  });
}
var registry, bearer, json, ok, errors;
var init_spec = __esm({
  "src/openapi/spec.ts"() {
    "use strict";
    init_constants();
    init_auth_schemas();
    init_product_schemas();
    extendZodWithOpenApi(z6);
    registry = new OpenAPIRegistry();
    registry.registerComponent("securitySchemes", "bearerAuth", { type: "http", scheme: "bearer", bearerFormat: "JWT" });
    bearer = [{ bearerAuth: [] }];
    json = (schema) => ({ content: { "application/json": { schema } } });
    ok = (description) => ({ 200: { description } });
    errors = { 401: { description: "UNAUTHENTICATED" }, 403: { description: "FORBIDDEN" }, 422: { description: "VALIDATION_ERROR" } };
    registry.registerPath({ method: "post", path: "/api/auth/register", tags: ["Auth"], summary: "Register with e-mail + password (sends a verification e-mail)", request: { body: json(registerSchemas.body) }, responses: { 201: { description: "Returns an access token; the refresh token is set as an httpOnly cookie" }, 409: { description: "EMAIL_TAKEN" } } });
    registry.registerPath({ method: "post", path: "/api/auth/login", tags: ["Auth"], summary: "Sign in (rate limited)", request: { body: json(loginSchemas.body) }, responses: { ...ok("Access token + refresh cookie"), 401: { description: "INVALID_CREDENTIALS" }, 429: { description: "RATE_LIMITED" } } });
    registry.registerPath({ method: "post", path: "/api/auth/google", tags: ["Auth"], summary: "Sign in with a Google ID token", request: { body: json(googleSchemas.body) }, responses: ok("Access token + refresh cookie") });
    registry.registerPath({ method: "post", path: "/api/auth/refresh", tags: ["Auth"], summary: "Rotate the refresh token (cookie). Re-using an old token revokes the whole session family.", responses: { ...ok("New access token + rotated refresh cookie"), 401: { description: "UNAUTHENTICATED or TOKEN_REUSE_DETECTED" } } });
    registry.registerPath({ method: "post", path: "/api/auth/logout", tags: ["Auth"], summary: "Sign out this device", responses: { 204: { description: "Signed out" } } });
    registry.registerPath({ method: "post", path: "/api/auth/logout-all", tags: ["Auth"], summary: "Sign out of every device", security: bearer, responses: { 204: { description: "All sessions revoked" } } });
    registry.registerPath({ method: "post", path: "/api/auth/verify-email", tags: ["Auth"], summary: "Confirm e-mail address (one-time token)", request: { body: json(verifyEmailSchemas.body) }, responses: { 204: { description: "Verified" } } });
    registry.registerPath({ method: "post", path: "/api/auth/forgot-password", tags: ["Auth"], summary: "Request a reset link (valid 15 min, single use)", request: { body: json(forgotPasswordSchemas.body) }, responses: { 202: { description: "Always 202 \u2014 never reveals whether the e-mail exists" } } });
    registry.registerPath({ method: "post", path: "/api/auth/reset-password", tags: ["Auth"], summary: "Set a new password and revoke all sessions", request: { body: json(resetPasswordSchemas.body) }, responses: { 204: { description: "Password changed" } } });
    registry.registerPath({
      method: "get",
      path: "/api/products",
      tags: ["Catalogue"],
      summary: "List/search products with dynamic facets",
      description: "Returns items, pagination and facets (brand/attribute counts + price range). Repeat `attr=key:value` for attribute filters.",
      request: {
        query: z6.object({
          q: z6.string().optional(),
          category: z6.string().optional().describe("Category slug (includes all descendants)"),
          brand: z6.string().optional().describe("Comma separated brand slugs"),
          collection: z6.string().optional(),
          minPrice: z6.number().int().optional().describe("Piasters"),
          maxPrice: z6.number().int().optional().describe("Piasters"),
          rating: z6.number().optional(),
          inStock: z6.boolean().optional(),
          attr: z6.array(z6.string()).optional().describe("e.g. size:M"),
          sort: z6.enum(PRODUCT_SORTS).optional(),
          page: z6.number().int().optional(),
          limit: z6.number().int().optional()
        })
      },
      responses: ok("Products + facets")
    });
    registry.registerPath({ method: "get", path: "/api/products/suggest", tags: ["Catalogue"], summary: "Type-ahead suggestions (Arabic + English)", request: { query: z6.object({ q: z6.string() }) }, responses: ok("Suggestions") });
    registry.registerPath({ method: "get", path: "/api/products/{slug}", tags: ["Catalogue"], summary: "Product details, breadcrumbs, option definitions, related products", request: { params: z6.object({ slug: z6.string() }) }, responses: { ...ok("Product"), 404: { description: "NOT_FOUND" } } });
    registry.registerPath({ method: "get", path: "/api/categories", tags: ["Catalogue"], summary: "Category tree (max 3 levels)", responses: ok("Tree") });
    registry.registerPath({ method: "get", path: "/api/categories/{slug}", tags: ["Catalogue"], summary: "Category with inherited attribute definitions (drives the dynamic filters)", request: { params: z6.object({ slug: z6.string() }) }, responses: ok("Category") });
    registry.registerPath({ method: "post", path: "/api/admin/products", tags: ["Admin"], summary: "Create a product (validated against its category attributes)", security: bearer, request: { body: json(productBodySchema) }, responses: { 201: { description: "Created" }, ...errors } });
    registry.registerPath({ method: "post", path: "/api/cart/preview", tags: ["Cart"], summary: "Price a guest cart (nothing is stored)", request: { body: json(z6.object({ items: z6.array(z6.object({ sku: z6.string(), qty: z6.number().int() })) })) }, responses: ok("Priced cart with stock/price warnings") });
    registry.registerPath({ method: "post", path: "/api/cart/merge", tags: ["Cart"], summary: "Merge the guest cart into the account cart after sign-in", security: bearer, request: { body: json(z6.object({ items: z6.array(z6.object({ sku: z6.string(), qty: z6.number().int() })) })) }, responses: ok("Merged cart") });
    registry.registerPath({ method: "get", path: "/api/checkout/payment-methods", tags: ["Checkout"], summary: "Payment methods; unavailable ones are flagged `comingSoon`", responses: ok("Methods") });
    registry.registerPath({ method: "post", path: "/api/checkout/quote", tags: ["Checkout"], summary: "Server-computed totals (subtotal, shipping, discount, total)", security: bearer, request: { body: json(z6.object({ addressId: z6.string().optional(), couponCode: z6.string().optional() })) }, responses: ok("Quote") });
    registry.registerPath({
      method: "post",
      path: "/api/orders",
      tags: ["Orders"],
      summary: "Place an order (idempotent, transactional, server-priced)",
      description: "Requires an `Idempotency-Key` header. Repeating the request with the same key returns the original order (HTTP 200).",
      security: bearer,
      request: {
        body: json(z6.object({ addressId: z6.string(), paymentMethod: z6.enum(PAYMENT_METHODS), couponCode: z6.string().optional(), note: z6.string().optional(), expectedTotal: z6.number().int().optional() }))
      },
      responses: { 201: { description: "Order created" }, 200: { description: "Replay of an earlier identical request" }, 409: { description: "INSUFFICIENT_STOCK or PRICE_CHANGED" }, 422: { description: "COD_LIMIT_EXCEEDED, COUPON_INVALID, PAYMENT_METHOD_UNAVAILABLE\u2026" } }
    });
    registry.registerPath({ method: "post", path: "/api/orders/{orderNumber}/cancel", tags: ["Orders"], summary: "Cancel before processing \u2014 stock is restored", security: bearer, request: { params: z6.object({ orderNumber: z6.string() }) }, responses: { ...ok("Cancelled order"), 422: { description: "INVALID_TRANSITION" } } });
    registry.registerPath({ method: "post", path: "/api/admin/orders/{id}/transition", tags: ["Admin"], summary: "Move an order along its lifecycle (state machine enforced)", security: bearer, request: { params: z6.object({ id: z6.string() }), body: json(z6.object({ to: z6.string(), note: z6.string().optional() })) }, responses: { ...ok("Updated order"), 422: { description: "INVALID_TRANSITION" } } });
    registry.registerPath({ method: "post", path: "/api/payments/webhooks/{provider}", tags: ["Payments"], summary: "Gateway callback \u2014 HMAC verified, idempotent, amount-checked", request: { params: z6.object({ provider: z6.string() }) }, responses: { 200: { description: "Acknowledged" }, 401: { description: "INVALID_SIGNATURE" } } });
  }
});

// src/openapi/docs.routes.ts
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
var docsRouter, cached, document;
var init_docs_routes = __esm({
  "src/openapi/docs.routes.ts"() {
    "use strict";
    init_spec();
    docsRouter = Router();
    document = () => cached ??= buildOpenApiDocument();
    docsRouter.get("/openapi.json", (_req, res) => {
      res.json(document());
    });
    docsRouter.use((_req, res, next) => {
      res.removeHeader("Content-Security-Policy");
      next();
    });
    docsRouter.use(
      "/",
      swaggerUi.serve,
      (req, res, next) => swaggerUi.setup(document(), { customSiteTitle: "Atelier API docs" })(req, res, next)
    );
  }
});

// src/modules/auth/tokens.ts
import { jwtVerify, SignJWT } from "jose";
async function signAccessToken({ userId, role }) {
  return new SignJWT({ role }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuer(ISSUER).setIssuedAt().setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`).sign(secret);
}
async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] });
    const role = payload["role"];
    if (!payload.sub || typeof role !== "string" || !USER_ROLES.includes(role)) {
      throw AppError.unauthenticated("Malformed access token");
    }
    return { userId: payload.sub, role };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthenticated("Invalid or expired access token");
  }
}
var secret, ISSUER;
var init_tokens = __esm({
  "src/modules/auth/tokens.ts"() {
    "use strict";
    init_constants();
    init_env();
    init_errors();
    secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    ISSUER = "marketplace-api";
  }
});

// src/http/middleware/authenticate.ts
function bearerToken(header) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
function currentUserId(req) {
  if (!req.auth) throw AppError.unauthenticated();
  return req.auth.userId;
}
var authenticate, requireRole;
var init_authenticate = __esm({
  "src/http/middleware/authenticate.ts"() {
    "use strict";
    init_errors();
    init_tokens();
    authenticate = async (req, _res, next) => {
      const token = bearerToken(req.headers.authorization);
      if (!token) throw AppError.unauthenticated();
      req.auth = await verifyAccessToken(token);
      next();
    };
    requireRole = (...roles) => (req, _res, next) => {
      if (!req.auth) throw AppError.unauthenticated();
      if (!roles.includes(req.auth.role)) throw AppError.forbidden();
      next();
    };
  }
});

// src/http/validate.ts
function validate(schemas) {
  return (req, _res, next) => {
    req.validated = {
      body: schemas.body ? schemas.body.parse(req.body) : void 0,
      query: schemas.query ? schemas.query.parse(req.query) : void 0,
      params: schemas.params ? schemas.params.parse(req.params) : void 0
    };
    next();
  };
}
function validated(req) {
  if (!req.validated) throw new Error("validated() called on a route without validate() middleware");
  return req.validated;
}
var init_validate = __esm({
  "src/http/validate.ts"() {
    "use strict";
  }
});

// src/lib/text.ts
function normalizeText(input) {
  return input.normalize("NFKC").toLowerCase().replace(ARABIC_DIACRITICS, "").replace(TATWEEL, "").replace(/[أإآٱ]/g, "\u0627").replace(/ى/g, "\u064A").replace(/ة/g, "\u0647").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}
function tokenize(...inputs) {
  const tokens = /* @__PURE__ */ new Set();
  for (const input of inputs) {
    if (!input) continue;
    for (const token of normalizeText(input).split(/[\s-]+/)) {
      if (token.length >= 2) tokens.add(token);
    }
  }
  return [...tokens];
}
function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var ARABIC_DIACRITICS, TATWEEL;
var init_text = __esm({
  "src/lib/text.ts"() {
    "use strict";
    ARABIC_DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
    TATWEEL = /ـ/g;
  }
});

// src/lib/slug.ts
function slugify(input) {
  return input.normalize("NFKC").toLowerCase().trim().replace(/[ً-ٟـ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
var init_slug = __esm({
  "src/lib/slug.ts"() {
    "use strict";
  }
});

// src/lib/unique-slug.ts
async function uniqueSlug(base, exists) {
  const root = slugify(base) || "item";
  let candidate = root;
  for (let i = 2; await exists(candidate); i++) candidate = `${root}-${i}`;
  return candidate;
}
var init_unique_slug = __esm({
  "src/lib/unique-slug.ts"() {
    "use strict";
    init_slug();
  }
});

// src/lib/background.ts
import { waitUntil } from "@vercel/functions";
function runInBackground(task, label) {
  const promise = Promise.resolve().then(task).catch((error) => logger.error({ err: error, task: label }, "background task failed"));
  try {
    waitUntil(promise);
  } catch {
  }
}
var init_background = __esm({
  "src/lib/background.ts"() {
    "use strict";
    init_logger();
  }
});

// src/lib/revalidate.ts
function revalidateStorefront(tags) {
  const { REVALIDATE_URL, REVALIDATE_SECRET } = env;
  if (!REVALIDATE_URL || !REVALIDATE_SECRET) return;
  runInBackground(async () => {
    const response = await fetch(REVALIDATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": REVALIDATE_SECRET },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5e3)
    });
    if (!response.ok) logger.warn({ status: response.status, tags }, "storefront revalidation rejected");
  }, "revalidate-storefront");
}
var init_revalidate = __esm({
  "src/lib/revalidate.ts"() {
    "use strict";
    init_env();
    init_logger();
    init_background();
  }
});

// src/modules/admin/audit-log.model.ts
import { model, Schema } from "mongoose";
var auditLogSchema, AuditLogModel;
var init_audit_log_model = __esm({
  "src/modules/admin/audit-log.model.ts"() {
    "use strict";
    auditLogSchema = new Schema(
      {
        actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        action: { type: String, required: true },
        entity: { type: String, required: true },
        entityId: String,
        meta: Schema.Types.Mixed,
        ip: String
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    );
    auditLogSchema.index({ createdAt: -1 });
    auditLogSchema.index({ entity: 1, entityId: 1 });
    AuditLogModel = model("AuditLog", auditLogSchema, "audit_logs");
  }
});

// src/modules/admin/audit.service.ts
async function recordAudit(req, entry) {
  if (!req.auth) return;
  try {
    await AuditLogModel.create({
      actorId: toObjectId(req.auth.userId),
      ...entry,
      ...req.ip ? { ip: req.ip } : {}
    });
  } catch (error) {
    logger.error({ err: error, entry }, "failed to write audit log");
  }
}
var init_audit_service = __esm({
  "src/modules/admin/audit.service.ts"() {
    "use strict";
    init_object_id();
    init_logger();
    init_audit_log_model();
  }
});

// src/modules/products/product.model.ts
import { model as model2, Schema as Schema2 } from "mongoose";
var localized, variantSchema, productSchema, ProductModel;
var init_product_model = __esm({
  "src/modules/products/product.model.ts"() {
    "use strict";
    init_constants();
    localized = { ar: { type: String, default: "" }, en: { type: String, default: "" } };
    variantSchema = new Schema2({
      sku: { type: String, required: true, trim: true, uppercase: true },
      optionValues: { type: Schema2.Types.Mixed, default: {} },
      price: { type: Number, required: true, min: 0, validate: Number.isInteger },
      compareAtPrice: { type: Number, min: 0, validate: Number.isInteger },
      stock: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger }
    });
    productSchema = new Schema2(
      {
        title: { type: localized, required: true, _id: false },
        slug: { type: String, required: true, unique: true },
        description: { type: localized, _id: false, default: () => ({ ar: "", en: "" }) },
        categoryId: { type: Schema2.Types.ObjectId, ref: "Category", required: true },
        categoryPath: { type: [Schema2.Types.ObjectId], required: true },
        brandId: { type: Schema2.Types.ObjectId, ref: "Brand" },
        images: {
          type: [new Schema2({ url: { type: String, required: true }, publicId: String, alt: String }, { _id: false })],
          default: []
        },
        specs: { type: Schema2.Types.Mixed, default: {} },
        options: {
          type: [new Schema2({ key: { type: String, required: true }, values: [String] }, { _id: false })],
          default: []
        },
        variants: { type: [variantSchema], validate: (v) => v.length > 0 },
        filterAttrs: {
          type: [new Schema2({ k: String, v: String }, { _id: false })],
          default: []
        },
        minPrice: { type: Number, required: true },
        maxPrice: { type: Number, required: true },
        searchKeywords: { type: [String], default: [] },
        tags: { type: [String], default: [] },
        status: { type: String, enum: PRODUCT_STATUSES, default: "draft" },
        ratingAvg: { type: Number, default: 0 },
        ratingCount: { type: Number, default: 0 },
        soldCount: { type: Number, default: 0 }
      },
      { timestamps: true, minimize: false }
    );
    productSchema.index({ categoryPath: 1, status: 1, createdAt: -1 });
    productSchema.index({ categoryPath: 1, status: 1, minPrice: 1 });
    productSchema.index({ categoryPath: 1, status: 1, soldCount: -1 });
    productSchema.index({ brandId: 1, status: 1, createdAt: -1 });
    productSchema.index({ status: 1, soldCount: -1 });
    productSchema.index({ status: 1, createdAt: -1 });
    productSchema.index({ "filterAttrs.k": 1, "filterAttrs.v": 1 });
    productSchema.index({ searchKeywords: 1 });
    productSchema.index({ "variants.sku": 1 }, { unique: true });
    ProductModel = model2("Product", productSchema);
  }
});

// src/modules/brands/brand.model.ts
import { model as model3, Schema as Schema3 } from "mongoose";
var brandSchema, BrandModel;
var init_brand_model = __esm({
  "src/modules/brands/brand.model.ts"() {
    "use strict";
    brandSchema = new Schema3(
      {
        name: { type: String, required: true, trim: true, maxlength: 80 },
        slug: { type: String, required: true, unique: true },
        logo: String,
        description: {
          type: { ar: { type: String, default: "" }, en: { type: String, default: "" } },
          _id: false,
          default: () => ({ ar: "", en: "" })
        }
      },
      { timestamps: true }
    );
    BrandModel = model3("Brand", brandSchema);
  }
});

// src/modules/brands/brand.routes.ts
import { Router as Router2 } from "express";
import { z as z7 } from "zod";
var createSchemas, updateSchemas, idSchemas, slugSchemas, brandRouter, create, update, remove, brandAdminRouter;
var init_brand_routes = __esm({
  "src/modules/brands/brand.routes.ts"() {
    "use strict";
    init_validate();
    init_errors();
    init_schemas();
    init_unique_slug();
    init_revalidate();
    init_audit_service();
    init_product_model();
    init_brand_model();
    createSchemas = {
      body: z7.object({
        name: z7.string().trim().min(1).max(80),
        slug: slugSchema.optional(),
        logo: z7.url().optional(),
        description: localizedOptionalLongSchema.optional()
      })
    };
    updateSchemas = { params: idParams, body: createSchemas.body.partial() };
    idSchemas = { params: idParams };
    slugSchemas = { params: z7.object({ slug: slugSchema }) };
    brandRouter = Router2();
    brandRouter.get("/", async (_req, res) => {
      res.json({ items: await BrandModel.find().sort({ name: 1 }).lean() });
    });
    brandRouter.get("/:slug", validate(slugSchemas), async (req, res) => {
      const { params } = validated(req);
      const brand = await BrandModel.findOne({ slug: params.slug }).lean();
      if (!brand) throw AppError.notFound("Brand");
      res.json({ brand });
    });
    create = async (req, res) => {
      const { body: body2 } = validated(req);
      const slug = body2.slug ?? await uniqueSlug(body2.name, (s) => BrandModel.exists({ slug: s }).then(Boolean));
      const brand = await BrandModel.create({ ...body2, slug });
      await recordAudit(req, { action: "brand.create", entity: "brand", entityId: brand.id });
      revalidateStorefront(["brands", "products"]);
      res.status(201).json({ brand });
    };
    update = async (req, res) => {
      const { params, body: body2 } = validated(req);
      const brand = await BrandModel.findByIdAndUpdate(params.id, { $set: body2 }, { returnDocument: "after", runValidators: true });
      if (!brand) throw AppError.notFound("Brand");
      await recordAudit(req, { action: "brand.update", entity: "brand", entityId: params.id });
      revalidateStorefront(["brands", "products"]);
      res.json({ brand });
    };
    remove = async (req, res) => {
      const { params } = validated(req);
      if (await ProductModel.exists({ brandId: params.id })) throw AppError.conflict("This brand still has products");
      if (!await BrandModel.findByIdAndDelete(params.id)) throw AppError.notFound("Brand");
      await recordAudit(req, { action: "brand.delete", entity: "brand", entityId: params.id });
      revalidateStorefront(["brands", "products"]);
      res.status(204).end();
    };
    brandAdminRouter = Router2();
    brandAdminRouter.get("/", async (_req, res) => {
      res.json({ items: await BrandModel.find().sort({ name: 1 }).lean() });
    });
    brandAdminRouter.post("/", validate(createSchemas), create);
    brandAdminRouter.patch("/:id", validate(updateSchemas), update);
    brandAdminRouter.delete("/:id", validate(idSchemas), remove);
  }
});

// src/modules/categories/category.model.ts
import { model as model4, Schema as Schema4 } from "mongoose";
var ATTRIBUTE_TYPES, localized2, attributeSchema, categorySchema, CategoryModel;
var init_category_model = __esm({
  "src/modules/categories/category.model.ts"() {
    "use strict";
    ATTRIBUTE_TYPES = ["select", "color", "text", "number"];
    localized2 = { ar: { type: String, required: true }, en: { type: String, required: true } };
    attributeSchema = new Schema4(
      {
        key: { type: String, required: true, match: /^[a-z][a-z0-9_]{0,31}$/ },
        label: { type: localized2, required: true, _id: false },
        type: { type: String, enum: ATTRIBUTE_TYPES, default: "select" },
        values: {
          type: [
            new Schema4(
              {
                value: { type: String, required: true },
                label: { type: { ar: String, en: String }, _id: false },
                swatch: String
              },
              { _id: false }
            )
          ],
          default: []
        },
        filterable: { type: Boolean, default: false },
        variantOption: { type: Boolean, default: false }
      },
      { _id: false }
    );
    categorySchema = new Schema4(
      {
        name: { type: localized2, required: true, _id: false },
        slug: { type: String, required: true, unique: true },
        parentId: { type: Schema4.Types.ObjectId, ref: "Category", default: null, index: true },
        level: { type: Number, required: true, min: 1, max: 3 },
        path: { type: [Schema4.Types.ObjectId], default: [] },
        image: String,
        attributes: { type: [attributeSchema], default: [] },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      },
      { timestamps: true }
    );
    categorySchema.index({ path: 1 });
    CategoryModel = model4("Category", categorySchema);
  }
});

// src/modules/categories/category.schemas.ts
import { z as z8 } from "zod";
var attributeValueSchema, attributeDefSchema, attributesSchema, categoryFields, createCategorySchemas, updateCategorySchemas, categoryIdSchemas, categorySlugSchemas;
var init_category_schemas = __esm({
  "src/modules/categories/category.schemas.ts"() {
    "use strict";
    init_schemas();
    init_object_id();
    init_category_model();
    attributeValueSchema = z8.object({
      value: z8.string().trim().min(1).max(60),
      label: localizedSchema.optional(),
      swatch: z8.string().trim().max(32).optional()
    });
    attributeDefSchema = z8.object({
      key: attributeKeySchema,
      label: localizedSchema,
      type: z8.enum(ATTRIBUTE_TYPES).default("select"),
      values: z8.array(attributeValueSchema).max(100).default([]),
      filterable: z8.boolean().default(false),
      variantOption: z8.boolean().default(false)
    }).refine((a) => !a.variantOption || a.values.length > 0, {
      message: "A variant option needs at least one allowed value",
      path: ["values"]
    });
    attributesSchema = z8.array(attributeDefSchema).max(20).refine((attrs) => new Set(attrs.map((a) => a.key)).size === attrs.length, {
      message: "Attribute keys must be unique within a category"
    });
    categoryFields = z8.object({
      name: localizedSchema,
      slug: slugSchema,
      image: z8.url(),
      sortOrder: z8.number().int().min(0),
      isActive: z8.boolean(),
      attributes: attributesSchema
    });
    createCategorySchemas = {
      body: categoryFields.partial({ slug: true, image: true }).extend({
        sortOrder: categoryFields.shape.sortOrder.default(0),
        isActive: categoryFields.shape.isActive.default(true),
        attributes: categoryFields.shape.attributes.default([]),
        parentId: objectIdSchema.nullable().default(null)
      })
    };
    updateCategorySchemas = { params: idParams, body: categoryFields.partial() };
    categoryIdSchemas = { params: idParams };
    categorySlugSchemas = { params: z8.object({ slug: slugSchema }) };
  }
});

// src/modules/categories/category.service.ts
import { Types as Types2 } from "mongoose";
function mergeAttributes(chain) {
  const byKey = /* @__PURE__ */ new Map();
  for (const category of chain) for (const attribute of category.attributes) byKey.set(attribute.key, attribute);
  return [...byKey.values()];
}
var categoryService;
var init_category_service = __esm({
  "src/modules/categories/category.service.ts"() {
    "use strict";
    init_constants();
    init_errors();
    init_object_id();
    init_unique_slug();
    init_product_model();
    init_category_model();
    categoryService = {
      async create(input) {
        const _id = new Types2.ObjectId();
        let level = 1;
        let path = [_id];
        if (input.parentId) {
          const parent = await CategoryModel.findById(input.parentId);
          if (!parent) throw AppError.notFound("Parent category");
          if (parent.level >= MAX_CATEGORY_DEPTH) {
            throw AppError.unprocessable("VALIDATION_ERROR", `Categories can be nested at most ${MAX_CATEGORY_DEPTH} levels deep`);
          }
          level = parent.level + 1;
          path = [...parent.path, _id];
        }
        const slug = input.slug ?? await uniqueSlug(input.name.en, (s) => CategoryModel.exists({ slug: s }).then(Boolean));
        return CategoryModel.create({
          _id,
          name: input.name,
          slug,
          parentId: input.parentId ? toObjectId(input.parentId) : null,
          level,
          path,
          ...input.image ? { image: input.image } : {},
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          attributes: input.attributes
        });
      },
      async update(id, patch) {
        const category = await CategoryModel.findById(id);
        if (!category) throw AppError.notFound("Category");
        if (patch.name) category.name = patch.name;
        if (patch.slug) category.slug = patch.slug;
        if (patch.image !== void 0) category.image = patch.image;
        if (patch.sortOrder !== void 0) category.sortOrder = patch.sortOrder;
        if (patch.isActive !== void 0) category.isActive = patch.isActive;
        if (patch.attributes) category.set("attributes", patch.attributes);
        await category.save();
        return category;
      },
      async remove(id) {
        const [hasChildren, hasProducts] = await Promise.all([
          CategoryModel.exists({ parentId: id }),
          ProductModel.exists({ categoryPath: id })
        ]);
        if (hasChildren) throw AppError.conflict("Delete or move the sub-categories first");
        if (hasProducts) throw AppError.conflict("This category still has products");
        const deleted = await CategoryModel.findByIdAndDelete(id);
        if (!deleted) throw AppError.notFound("Category");
      },
      /** Nested tree (max 3 levels) of active categories, for the mega-menu and navigation. */
      async tree() {
        const all = await CategoryModel.find({ isActive: true }).sort({ level: 1, sortOrder: 1, "name.en": 1 }).lean();
        const nodes = /* @__PURE__ */ new Map();
        const roots = [];
        for (const c of all) {
          nodes.set(String(c._id), {
            id: String(c._id),
            name: c.name,
            slug: c.slug,
            ...c.image ? { image: c.image } : {},
            level: c.level,
            children: []
          });
        }
        for (const c of all) {
          const node = nodes.get(String(c._id));
          const parent = c.parentId ? nodes.get(String(c.parentId)) : void 0;
          (parent ? parent.children : roots).push(node);
        }
        return roots;
      },
      /** Admin view: every category (also inactive), flat, with raw attribute definitions. */
      listAll() {
        return CategoryModel.find().sort({ level: 1, sortOrder: 1 }).lean();
      },
      async effectiveAttributes(category) {
        const chain = await CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean();
        return mergeAttributes(chain);
      },
      /** Category + breadcrumb ancestors + inherited attribute definitions (drives the dynamic filters). */
      async getDetailsBySlug(slug) {
        const category = await CategoryModel.findOne({ slug, isActive: true }).lean();
        if (!category) throw AppError.notFound("Category");
        const [ancestors, children] = await Promise.all([
          CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean(),
          CategoryModel.find({ parentId: category._id, isActive: true }).sort({ sortOrder: 1 }).lean()
        ]);
        return {
          category,
          breadcrumbs: ancestors.map((a) => ({ id: String(a._id), name: a.name, slug: a.slug })),
          children: children.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug, image: c.image })),
          attributes: mergeAttributes(ancestors)
        };
      }
    };
  }
});

// src/modules/categories/category.routes.ts
import { Router as Router3 } from "express";
var tree, details, categoryRouter, list, create2, update2, remove2, categoryAdminRouter;
var init_category_routes = __esm({
  "src/modules/categories/category.routes.ts"() {
    "use strict";
    init_revalidate();
    init_audit_service();
    init_validate();
    init_category_schemas();
    init_category_service();
    tree = async (_req, res) => {
      res.json({ items: await categoryService.tree() });
    };
    details = async (req, res) => {
      const { params } = validated(req);
      res.json(await categoryService.getDetailsBySlug(params.slug));
    };
    categoryRouter = Router3();
    categoryRouter.get("/", tree);
    categoryRouter.get("/:slug", validate(categorySlugSchemas), details);
    list = async (_req, res) => {
      res.json({ items: await categoryService.listAll() });
    };
    create2 = async (req, res) => {
      const { body: body2 } = validated(req);
      const category = await categoryService.create(body2);
      await recordAudit(req, { action: "category.create", entity: "category", entityId: category.id });
      revalidateStorefront(["categories"]);
      res.status(201).json({ category });
    };
    update2 = async (req, res) => {
      const { params, body: body2 } = validated(req);
      const category = await categoryService.update(params.id, body2);
      await recordAudit(req, { action: "category.update", entity: "category", entityId: params.id });
      revalidateStorefront(["categories", "products"]);
      res.json({ category });
    };
    remove2 = async (req, res) => {
      const { params } = validated(req);
      await categoryService.remove(params.id);
      await recordAudit(req, { action: "category.delete", entity: "category", entityId: params.id });
      revalidateStorefront(["categories"]);
      res.status(204).end();
    };
    categoryAdminRouter = Router3();
    categoryAdminRouter.get("/", list);
    categoryAdminRouter.post("/", validate(createCategorySchemas), create2);
    categoryAdminRouter.patch("/:id", validate(updateCategorySchemas), update2);
    categoryAdminRouter.delete("/:id", validate(categoryIdSchemas), remove2);
  }
});

// src/modules/collections/collection.model.ts
import { model as model5, Schema as Schema5 } from "mongoose";
var localized3, collectionSchema, CollectionModel;
var init_collection_model = __esm({
  "src/modules/collections/collection.model.ts"() {
    "use strict";
    localized3 = { ar: { type: String, default: "" }, en: { type: String, default: "" } };
    collectionSchema = new Schema5(
      {
        title: { type: localized3, required: true, _id: false },
        slug: { type: String, required: true, unique: true },
        description: { type: localized3, _id: false, default: () => ({ ar: "", en: "" }) },
        image: String,
        productIds: { type: [Schema5.Types.ObjectId], ref: "Product", default: [] },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      },
      { timestamps: true }
    );
    CollectionModel = model5("Collection", collectionSchema);
  }
});

// src/modules/products/product.query.ts
function parseAttrFilters(attr) {
  const grouped = /* @__PURE__ */ new Map();
  for (const pair of attr ?? []) {
    const idx = pair.indexOf(":");
    const key = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    grouped.set(key, [...grouped.get(key) ?? [], value]);
  }
  return grouped;
}
async function listProducts(query) {
  const base = [{ status: "published" }];
  let attributeDefs = [];
  if (query.category) {
    const category = await CategoryModel.findOne({ slug: query.category, isActive: true }).lean();
    if (!category) throw AppError.notFound("Category");
    base.push({ categoryPath: category._id });
    const chain = await CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean();
    attributeDefs = mergeAttributes(chain).filter((a) => a.filterable);
  }
  if (query.collection) {
    const collection = await CollectionModel.findOne({ slug: query.collection, isActive: true }).lean();
    if (!collection) throw AppError.notFound("Collection");
    base.push({ _id: { $in: collection.productIds } });
  }
  base.push(...searchClauses(query.q));
  if (query.rating) base.push({ ratingAvg: { $gte: query.rating } });
  if (query.inStock) base.push({ variants: { $elemMatch: { stock: { $gt: 0 } } } });
  if (query.onSale) base.push({ $expr: { $anyElementTrue: [{ $map: { input: "$variants", as: "v", in: { $gt: ["$$v.compareAtPrice", "$$v.price"] } } }] } });
  const brandClause = [];
  if (query.brand?.length) {
    const brands = await BrandModel.find({ slug: { $in: query.brand } }).select("_id").lean();
    brandClause.push({ brandId: { $in: brands.map((b) => b._id) } });
  }
  const priceClauses = [];
  if (query.minPrice !== void 0) priceClauses.push({ maxPrice: { $gte: query.minPrice } });
  if (query.maxPrice !== void 0) priceClauses.push({ minPrice: { $lte: query.maxPrice } });
  const attrFilters = parseAttrFilters(query.attr);
  const attrClauses = [...attrFilters].map(([k, v]) => ({
    filterAttrs: { $elemMatch: { k, v: { $in: v } } }
  }));
  const everything = allOf([...brandClause, ...priceClauses, ...attrClauses]);
  const withoutBrand = allOf([...priceClauses, ...attrClauses]);
  const withoutAttrs = allOf([...brandClause, ...priceClauses]);
  const withoutPrice = allOf([...brandClause, ...attrClauses]);
  const pipeline = [
    { $match: allOf(base) },
    {
      $facet: {
        items: [
          { $match: everything },
          { $sort: { ...SORTS[query.sort], _id: -1 } },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          { $project: CARD_PROJECTION }
        ],
        total: [{ $match: everything }, { $count: "n" }],
        brands: [{ $match: withoutBrand }, { $group: { _id: "$brandId", count: { $sum: 1 } } }],
        attrs: [
          { $match: withoutAttrs },
          { $unwind: "$filterAttrs" },
          { $group: { _id: { k: "$filterAttrs.k", v: "$filterAttrs.v" }, count: { $sum: 1 } } }
        ],
        price: [
          { $match: withoutPrice },
          { $group: { _id: null, min: { $min: "$minPrice" }, max: { $max: "$maxPrice" } } }
        ]
      }
    }
  ];
  const [row] = await ProductModel.aggregate(pipeline);
  const facet = row ?? { items: [], total: [], brands: [], attrs: [], price: [] };
  const total = facet.total[0]?.n ?? 0;
  const brandDocs = await BrandModel.find({ _id: { $in: facet.brands.map((b) => b._id).filter(Boolean) } }).select("name slug").lean();
  const brandById = new Map(brandDocs.map((b) => [String(b._id), b]));
  const attrCounts = /* @__PURE__ */ new Map();
  for (const { _id, count } of facet.attrs) {
    const values = attrCounts.get(_id.k) ?? /* @__PURE__ */ new Map();
    values.set(_id.v, count);
    attrCounts.set(_id.k, values);
  }
  const facets = {
    brands: facet.brands.flatMap(({ _id, count }) => {
      const brand = _id ? brandById.get(String(_id)) : void 0;
      return brand ? [{ id: String(brand._id), slug: brand.slug, name: brand.name, count }] : [];
    }).sort((a, b) => b.count - a.count),
    attributes: attributeDefs.map((def) => {
      const counts = attrCounts.get(def.key) ?? /* @__PURE__ */ new Map();
      const ordered = def.values.length > 0 ? def.values : [...counts.keys()].map((value) => ({ value }));
      return {
        key: def.key,
        label: def.label,
        type: def.type,
        values: ordered.map((v) => ({
          value: v.value,
          label: v.label,
          swatch: v.swatch,
          count: counts.get(v.value) ?? 0
        })).filter((v) => v.count > 0 || attrFilters.get(def.key)?.includes(v.value))
      };
    }).filter((a) => a.values.length > 0),
    price: facet.price[0] ? { min: facet.price[0].min, max: facet.price[0].max } : null
  };
  return {
    items: facet.items.map(toCard),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    facets
  };
}
async function suggestProducts(q, limit) {
  const clauses = searchClauses(q);
  if (clauses.length === 0) return [];
  const rows = await ProductModel.aggregate([
    { $match: { status: "published", $and: clauses } },
    { $sort: { soldCount: -1, _id: -1 } },
    { $limit: limit },
    { $project: CARD_PROJECTION }
  ]);
  return rows.map(toCard);
}
async function relatedProducts(categoryId, excludeId, limit = 8) {
  const rows = await ProductModel.aggregate([
    { $match: { status: "published", categoryId, _id: { $ne: excludeId } } },
    { $sort: { soldCount: -1, _id: -1 } },
    { $limit: limit },
    { $project: CARD_PROJECTION }
  ]);
  return rows.map(toCard);
}
var CARD_PROJECTION, toCard, SORTS, allOf, searchClauses;
var init_product_query = __esm({
  "src/modules/products/product.query.ts"() {
    "use strict";
    init_errors();
    init_text();
    init_brand_model();
    init_category_model();
    init_category_service();
    init_collection_model();
    init_product_model();
    CARD_PROJECTION = {
      title: 1,
      slug: 1,
      images: { $slice: ["$images", 2] },
      brandId: 1,
      minPrice: 1,
      maxPrice: 1,
      ratingAvg: 1,
      ratingCount: 1,
      options: 1,
      inStock: { $anyElementTrue: [{ $map: { input: "$variants", as: "v", in: { $gt: ["$$v.stock", 0] } } }] },
      onSale: {
        $anyElementTrue: [{ $map: { input: "$variants", as: "v", in: { $gt: ["$$v.compareAtPrice", "$$v.price"] } } }]
      }
    };
    toCard = ({ _id, brandId, ...rest }) => ({
      id: String(_id),
      ...brandId ? { brandId: String(brandId) } : {},
      ...rest
    });
    SORTS = {
      newest: { createdAt: -1 },
      price_asc: { minPrice: 1 },
      price_desc: { maxPrice: -1 },
      bestselling: { soldCount: -1 },
      rating: { ratingAvg: -1, ratingCount: -1 }
    };
    allOf = (clauses) => clauses.length > 0 ? { $and: clauses } : {};
    searchClauses = (q) => tokenize(q ?? "").map((token) => ({ searchKeywords: { $regex: `^${escapeRegex(token)}` } }));
  }
});

// src/modules/collections/collection.routes.ts
import { Router as Router4 } from "express";
import { z as z9 } from "zod";
var fields, createSchemas2, updateSchemas2, idSchemas2, slugSchemas2, collectionRouter, create3, update3, remove3, collectionAdminRouter;
var init_collection_routes = __esm({
  "src/modules/collections/collection.routes.ts"() {
    "use strict";
    init_validate();
    init_errors();
    init_object_id();
    init_schemas();
    init_unique_slug();
    init_revalidate();
    init_audit_service();
    init_product_model();
    init_product_query();
    init_collection_model();
    fields = z9.object({
      title: localizedSchema,
      slug: slugSchema,
      description: localizedOptionalLongSchema,
      image: z9.url(),
      productIds: z9.array(objectIdSchema).max(200),
      sortOrder: z9.number().int().min(0),
      isActive: z9.boolean()
    });
    createSchemas2 = {
      body: fields.partial({ slug: true, description: true, image: true }).extend({
        productIds: fields.shape.productIds.default([]),
        sortOrder: fields.shape.sortOrder.default(0),
        isActive: fields.shape.isActive.default(true)
      })
    };
    updateSchemas2 = { params: idParams, body: fields.partial() };
    idSchemas2 = { params: idParams };
    slugSchemas2 = { params: z9.object({ slug: slugSchema }) };
    collectionRouter = Router4();
    collectionRouter.get("/", async (_req, res) => {
      const items = await CollectionModel.find({ isActive: true }).sort({ sortOrder: 1 }).select("-productIds").lean();
      res.json({ items });
    });
    collectionRouter.get("/:slug", validate(slugSchemas2), async (req, res) => {
      const { params } = validated(req);
      const collection = await CollectionModel.findOne({ slug: params.slug, isActive: true }).lean();
      if (!collection) throw AppError.notFound("Collection");
      const preview = await ProductModel.aggregate([
        { $match: { _id: { $in: collection.productIds.slice(0, 12) }, status: "published" } },
        { $project: CARD_PROJECTION }
      ]);
      const { productIds: _omit, ...meta2 } = collection;
      res.json({ collection: meta2, preview: preview.map(toCard) });
    });
    create3 = async (req, res) => {
      const { body: body2 } = validated(req);
      const slug = body2.slug ?? await uniqueSlug(body2.title.en, (s) => CollectionModel.exists({ slug: s }).then(Boolean));
      const collection = await CollectionModel.create({ ...body2, slug });
      await recordAudit(req, { action: "collection.create", entity: "collection", entityId: collection.id });
      revalidateStorefront(["collections"]);
      res.status(201).json({ collection });
    };
    update3 = async (req, res) => {
      const { params, body: body2 } = validated(req);
      const collection = await CollectionModel.findByIdAndUpdate(params.id, { $set: body2 }, { returnDocument: "after", runValidators: true });
      if (!collection) throw AppError.notFound("Collection");
      await recordAudit(req, { action: "collection.update", entity: "collection", entityId: params.id });
      revalidateStorefront(["collections"]);
      res.json({ collection });
    };
    remove3 = async (req, res) => {
      const { params } = validated(req);
      if (!await CollectionModel.findByIdAndDelete(params.id)) throw AppError.notFound("Collection");
      await recordAudit(req, { action: "collection.delete", entity: "collection", entityId: params.id });
      revalidateStorefront(["collections"]);
      res.status(204).end();
    };
    collectionAdminRouter = Router4();
    collectionAdminRouter.get("/", async (_req, res) => {
      res.json({ items: await CollectionModel.find().sort({ sortOrder: 1 }).lean() });
    });
    collectionAdminRouter.post("/", validate(createSchemas2), create3);
    collectionAdminRouter.patch("/:id", validate(updateSchemas2), update3);
    collectionAdminRouter.delete("/:id", validate(idSchemas2), remove3);
  }
});

// src/modules/coupons/coupon.model.ts
import { model as model6, Schema as Schema6 } from "mongoose";
var COUPON_TYPES, couponSchema, CouponModel;
var init_coupon_model = __esm({
  "src/modules/coupons/coupon.model.ts"() {
    "use strict";
    COUPON_TYPES = ["percent", "fixed"];
    couponSchema = new Schema6(
      {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        type: { type: String, enum: COUPON_TYPES, required: true },
        value: { type: Number, required: true, min: 1 },
        minOrder: { type: Number, default: 0, min: 0 },
        maxDiscount: { type: Number, min: 1 },
        startsAt: Date,
        expiresAt: Date,
        maxUses: { type: Number, min: 1 },
        usedCount: { type: Number, default: 0, min: 0 },
        isActive: { type: Boolean, default: true }
      },
      { timestamps: true }
    );
    CouponModel = model6("Coupon", couponSchema);
  }
});

// src/modules/coupons/coupon.routes.ts
import { Router as Router5 } from "express";
import { z as z10 } from "zod";
var baseBody, refineCoupon, body, createSchemas3, updateSchemas3, idSchemas3, listSchemas, couponAdminRouter;
var init_coupon_routes = __esm({
  "src/modules/coupons/coupon.routes.ts"() {
    "use strict";
    init_validate();
    init_errors();
    init_schemas();
    init_audit_service();
    init_coupon_model();
    baseBody = z10.object({
      code: z10.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Code: 3\u201330 letters, digits, "-" or "_"'),
      type: z10.enum(COUPON_TYPES),
      value: z10.number().int().min(1),
      minOrder: piastersSchema,
      maxDiscount: piastersSchema.min(1).optional(),
      startsAt: z10.coerce.date().optional(),
      expiresAt: z10.coerce.date().optional(),
      maxUses: z10.number().int().min(1).optional(),
      isActive: z10.boolean()
    });
    refineCoupon = (schema) => schema.refine((c) => c.type !== "percent" || c.value === void 0 || c.value <= 100, { message: "Percent coupons are capped at 100", path: ["value"] }).refine((c) => !c.startsAt || !c.expiresAt || c.startsAt < c.expiresAt, { message: "expiresAt must be after startsAt", path: ["expiresAt"] });
    body = refineCoupon(baseBody.extend({ minOrder: piastersSchema.default(0), isActive: z10.boolean().default(true) }));
    createSchemas3 = { body };
    updateSchemas3 = { params: idParams, body: refineCoupon(baseBody.partial()) };
    idSchemas3 = { params: idParams };
    listSchemas = { query: paginationQuery };
    couponAdminRouter = Router5();
    couponAdminRouter.get("/", validate(listSchemas), async (req, res) => {
      const { query } = validated(req);
      const [items, total] = await Promise.all([
        CouponModel.find().sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
        CouponModel.countDocuments()
      ]);
      res.json(toPage(items, total, query));
    });
    couponAdminRouter.post("/", validate(createSchemas3), async (req, res) => {
      const { body: data } = validated(req);
      const coupon = await CouponModel.create(data);
      await recordAudit(req, { action: "coupon.create", entity: "coupon", entityId: coupon.id });
      res.status(201).json({ coupon });
    });
    couponAdminRouter.patch("/:id", validate(updateSchemas3), async (req, res) => {
      const { params, body: patch } = validated(req);
      const coupon = await CouponModel.findByIdAndUpdate(params.id, { $set: patch }, { returnDocument: "after", runValidators: true });
      if (!coupon) throw AppError.notFound("Coupon");
      await recordAudit(req, { action: "coupon.update", entity: "coupon", entityId: params.id });
      res.json({ coupon });
    });
    couponAdminRouter.delete("/:id", validate(idSchemas3), async (req, res) => {
      const { params } = validated(req);
      if (!await CouponModel.findByIdAndDelete(params.id)) throw AppError.notFound("Coupon");
      await recordAudit(req, { action: "coupon.delete", entity: "coupon", entityId: params.id });
      res.status(204).end();
    });
  }
});

// src/modules/inventory/inventory.models.ts
import { model as model7, Schema as Schema7 } from "mongoose";
var INVENTORY_REASONS, inventoryLogSchema, InventoryLogModel;
var init_inventory_models = __esm({
  "src/modules/inventory/inventory.models.ts"() {
    "use strict";
    INVENTORY_REASONS = [
      "order_placed",
      "order_cancelled",
      "order_refunded",
      "manual_adjustment",
      "restock",
      "import"
    ];
    inventoryLogSchema = new Schema7(
      {
        sku: { type: String, required: true, index: true },
        productId: { type: Schema7.Types.ObjectId, ref: "Product", required: true },
        delta: { type: Number, required: true },
        reason: { type: String, enum: INVENTORY_REASONS, required: true },
        note: { type: String, maxlength: 500 },
        orderId: { type: Schema7.Types.ObjectId, ref: "Order" },
        byUserId: { type: Schema7.Types.ObjectId, ref: "User" }
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    );
    inventoryLogSchema.index({ createdAt: -1 });
    inventoryLogSchema.index({ orderId: 1 });
    InventoryLogModel = model7("InventoryLog", inventoryLogSchema, "inventory_logs");
  }
});

// src/modules/inventory/inventory.service.ts
var logEntry, inventoryService;
var init_inventory_service = __esm({
  "src/modules/inventory/inventory.service.ts"() {
    "use strict";
    init_errors();
    init_object_id();
    init_product_model();
    init_inventory_models();
    logEntry = (line, delta, ctx) => ({
      sku: line.sku,
      productId: line.productId,
      delta,
      reason: ctx.reason,
      ...ctx.orderId ? { orderId: ctx.orderId } : {},
      ...ctx.byUserId ? { byUserId: toObjectId(ctx.byUserId) } : {},
      ...ctx.note ? { note: ctx.note } : {}
    });
    inventoryService = {
      /**
       * Removes stock with ONE atomic conditional update — the stock check lives inside the write itself:
       *
       *   updateOne({ variants: { $elemMatch: { sku, stock: { $gte: qty } } } },
       *             { $inc: { 'variants.$.stock': -qty } })
       *
       * If two shoppers race for the last unit, MongoDB serialises the two updates; exactly one matches the
       * filter (modifiedCount 1), the other sees stock 0 and matches nothing. No read-then-write window exists.
       * Runs inside the caller's transaction so a multi-item order is all-or-nothing.
       */
      async reserve(lines, ctx) {
        const ordered = [...lines].sort((a, b) => a.sku.localeCompare(b.sku));
        for (const line of ordered) {
          const result = await ProductModel.updateOne(
            { status: "published", variants: { $elemMatch: { sku: line.sku, stock: { $gte: line.qty } } } },
            { $inc: { "variants.$.stock": -line.qty } },
            { session: ctx.session }
          );
          if (result.modifiedCount !== 1) {
            throw AppError.conflict(`Not enough stock for ${line.sku}`, "INSUFFICIENT_STOCK", { sku: line.sku });
          }
        }
        await InventoryLogModel.insertMany(
          ordered.map((line) => logEntry(line, -line.qty, ctx)),
          { session: ctx.session }
        );
      },
      /** Puts units back (cancellation / refund / manual restock). */
      async release(lines, ctx) {
        for (const line of lines) {
          await ProductModel.updateOne(
            { "variants.sku": line.sku },
            { $inc: { "variants.$.stock": line.qty } },
            { session: ctx.session }
          );
        }
        await InventoryLogModel.insertMany(
          lines.map((line) => logEntry(line, line.qty, ctx)),
          { session: ctx.session }
        );
      },
      /** Manual admin correction with a mandatory written reason; never lets stock go negative. */
      async adjust(input) {
        const product = await ProductModel.findOneAndUpdate(
          {
            "variants.sku": input.sku,
            ...input.delta < 0 ? { variants: { $elemMatch: { sku: input.sku, stock: { $gte: -input.delta } } } } : {}
          },
          { $inc: { "variants.$.stock": input.delta } },
          { returnDocument: "after" }
        );
        if (!product) {
          const exists = await ProductModel.exists({ "variants.sku": input.sku });
          throw exists ? AppError.conflict("Adjustment would make stock negative", "INSUFFICIENT_STOCK", { sku: input.sku }) : AppError.notFound("SKU");
        }
        await InventoryLogModel.create({
          sku: input.sku,
          productId: product._id,
          delta: input.delta,
          reason: input.delta > 0 ? "restock" : "manual_adjustment",
          note: input.note,
          byUserId: toObjectId(input.byUserId)
        });
        const variant = product.variants.find((v) => v.sku === input.sku);
        return { stock: variant?.stock ?? 0 };
      }
    };
  }
});

// src/modules/orders/order-state-machine.ts
function allowedTransitions(subject, actor) {
  return TRANSITIONS[subject.status].filter((t) => t.actors.includes(actor) && passesPaymentGuard(subject, t.to)).map((t) => t.to);
}
function passesPaymentGuard(subject, to) {
  if (to === "cancelled") return subject.paymentStatus !== "paid";
  if (to === "refunded") return subject.paymentStatus === "paid";
  return true;
}
function canTransition(subject, to, actor) {
  return allowedTransitions(subject, actor).includes(to);
}
function assertTransition(subject, to, actor) {
  if (!canTransition(subject, to, actor)) {
    throw AppError.unprocessable(
      "INVALID_TRANSITION",
      `Order cannot move from "${subject.status}" to "${to}" (actor: ${actor})`,
      { from: subject.status, to, actor, allowed: allowedTransitions(subject, actor) }
    );
  }
}
var ORDER_STATUSES, PAYMENT_STATUSES, TRANSITIONS, STOCK_RESTORING_STATUSES, restoresStock;
var init_order_state_machine = __esm({
  "src/modules/orders/order-state-machine.ts"() {
    "use strict";
    init_errors();
    ORDER_STATUSES = [
      "pending_payment",
      "paid",
      "pending_confirmation",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded"
    ];
    PAYMENT_STATUSES = ["unpaid", "paid", "refunded", "failed"];
    TRANSITIONS = {
      pending_confirmation: [
        { to: "confirmed", actors: ["admin"] },
        { to: "cancelled", actors: ["customer", "admin"] }
      ],
      confirmed: [
        { to: "processing", actors: ["admin"] },
        { to: "cancelled", actors: ["customer", "admin"] }
      ],
      pending_payment: [
        { to: "paid", actors: ["system"] },
        { to: "cancelled", actors: ["customer", "admin", "system"] }
      ],
      paid: [
        { to: "processing", actors: ["admin", "system"] },
        { to: "refunded", actors: ["admin"] }
      ],
      processing: [
        { to: "shipped", actors: ["admin"] },
        { to: "cancelled", actors: ["admin"] },
        { to: "refunded", actors: ["admin"] }
      ],
      shipped: [{ to: "delivered", actors: ["admin"] }],
      delivered: [{ to: "refunded", actors: ["admin"] }],
      cancelled: [],
      refunded: []
    };
    STOCK_RESTORING_STATUSES = ["cancelled", "refunded"];
    restoresStock = (to) => STOCK_RESTORING_STATUSES.includes(to);
  }
});

// src/modules/orders/order.dto.ts
function toOrderDto(order, actor, opts = {}) {
  const allowedActions = allowedTransitions(order, actor);
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    items: order.items.map((i) => ({
      productId: String(i.productId),
      sku: i.sku,
      title: i.title,
      image: i.image,
      optionValues: i.optionValues,
      options: i.options,
      unitPrice: i.unitPrice,
      qty: i.qty,
      lineTotal: i.lineTotal
    })),
    shippingAddress: order.shippingAddress,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    discount: order.discount,
    total: order.total,
    couponCode: order.couponCode,
    customerNote: order.customerNote,
    cancelReason: order.cancelReason,
    statusHistory: order.statusHistory.map((h) => ({
      status: h.status,
      at: h.at,
      actor: h.actor,
      ...h.note ? { note: h.note } : {}
    })),
    allowedActions,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    ...opts.includeCustomer ? { customer: { id: String(order.userId), name: order.customerName, email: order.customerEmail } } : {}
  };
}
var init_order_dto = __esm({
  "src/modules/orders/order.dto.ts"() {
    "use strict";
    init_order_state_machine();
  }
});

// src/modules/orders/order.model.ts
import { model as model8, Schema as Schema8 } from "mongoose";
var localized4, itemSchema, historySchema, orderSchema, OrderModel;
var init_order_model = __esm({
  "src/modules/orders/order.model.ts"() {
    "use strict";
    init_constants();
    init_order_state_machine();
    localized4 = { ar: { type: String, default: "" }, en: { type: String, default: "" } };
    itemSchema = new Schema8(
      {
        productId: { type: Schema8.Types.ObjectId, ref: "Product", required: true },
        sku: { type: String, required: true },
        title: { type: localized4, _id: false, required: true },
        image: String,
        optionValues: { type: Schema8.Types.Mixed, default: {} },
        options: { type: Schema8.Types.Mixed, default: () => [] },
        unitPrice: { type: Number, required: true, min: 0 },
        qty: { type: Number, required: true, min: 1 },
        lineTotal: { type: Number, required: true, min: 0 }
      },
      { _id: false, minimize: false }
    );
    historySchema = new Schema8(
      {
        status: { type: String, enum: ORDER_STATUSES, required: true },
        at: { type: Date, default: () => /* @__PURE__ */ new Date() },
        byUserId: { type: Schema8.Types.ObjectId, ref: "User" },
        actor: { type: String, enum: ["customer", "admin", "system"], required: true },
        note: { type: String, maxlength: 500 }
      },
      { _id: false }
    );
    orderSchema = new Schema8(
      {
        orderNumber: { type: String, required: true, unique: true },
        userId: { type: Schema8.Types.ObjectId, ref: "User", required: true },
        customerName: { type: String, required: true },
        customerEmail: { type: String, required: true, lowercase: true },
        items: { type: [itemSchema], validate: (v) => v.length > 0 },
        shippingAddress: {
          type: new Schema8(
            {
              fullName: { type: String, required: true },
              phone: { type: String, required: true },
              governorate: { type: String, required: true },
              city: { type: String, required: true },
              street: { type: String, required: true },
              notes: String
            },
            { _id: false }
          ),
          required: true
        },
        subtotal: { type: Number, required: true, min: 0 },
        shippingFee: { type: Number, required: true, min: 0 },
        discount: { type: Number, required: true, min: 0 },
        total: { type: Number, required: true, min: 0 },
        couponCode: String,
        paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
        paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "unpaid" },
        status: { type: String, enum: ORDER_STATUSES, required: true },
        statusHistory: { type: [historySchema], default: [] },
        customerNote: { type: String, maxlength: 500 },
        idempotencyKey: { type: String, required: true },
        cancelReason: { type: String, maxlength: 500 }
      },
      { timestamps: true, minimize: false }
    );
    orderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
    orderSchema.index({ userId: 1, createdAt: -1 });
    orderSchema.index({ status: 1, createdAt: -1 });
    orderSchema.index({ createdAt: -1 });
    orderSchema.index({ customerEmail: 1 });
    OrderModel = model8("Order", orderSchema);
  }
});

// src/modules/notifications/email-transport.ts
import nodemailer from "nodemailer";
import { Resend } from "resend";
function createTransport() {
  if (env.NODE_ENV === "test") return new MemoryTransport();
  if (env.RESEND_API_KEY) return new ResendTransport();
  if (env.SMTP_URL) return new SmtpTransport();
  logger.warn("No RESEND_API_KEY or SMTP_URL configured \u2014 e-mails are only logged");
  return {
    async send(email) {
      logger.info({ to: email.to, subject: email.subject, text: email.text }, "email (not sent: no transport)");
    }
  };
}
var ResendTransport, SmtpTransport, MemoryTransport, emailTransport;
var init_email_transport = __esm({
  "src/modules/notifications/email-transport.ts"() {
    "use strict";
    init_env();
    init_logger();
    ResendTransport = class {
      client = new Resend(env.RESEND_API_KEY);
      async send(email) {
        const { error } = await this.client.emails.send({ from: env.EMAIL_FROM, ...email });
        if (error) throw new Error(`Resend error: ${error.message}`);
      }
    };
    SmtpTransport = class {
      transporter = nodemailer.createTransport(env.SMTP_URL);
      async send(email) {
        await this.transporter.sendMail({ from: env.EMAIL_FROM, ...email });
      }
    };
    MemoryTransport = class {
      outbox = [];
      async send(email) {
        this.outbox.push(email);
        logger.debug({ to: email.to, subject: email.subject }, "email captured (memory transport)");
      }
    };
    emailTransport = createTransport();
  }
});

// src/modules/notifications/email-layout.ts
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderLayout(input) {
  const { locale, title, preheader, bodyHtml, cta, footer, brandName } = input;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const c = EMAIL_BRAND;
  const button = cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 8px"><tr><td style="background:${c.primary};border-radius:2px">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 32px;color:${c.primaryForeground};text-decoration:none;font-family:${c.sans};font-size:14px;letter-spacing:.04em">${escapeHtml(cta.label)}</a>
      </td></tr></table>` : "";
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${c.background};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.background};padding:40px 16px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
      <tr><td style="padding:0 0 24px;text-align:center;font-family:${c.serif};font-size:28px;font-weight:300;letter-spacing:.12em;color:${c.foreground}">${escapeHtml(brandName)}</td></tr>
      <tr><td style="background:${c.card};border:1px solid ${c.border};border-radius:2px;padding:40px 36px;text-align:${align};font-family:${c.sans};color:${c.foreground};font-size:15px;line-height:1.7">
        <h1 style="margin:0 0 20px;font-family:${c.serif};font-weight:400;font-size:28px;line-height:1.25;color:${c.foreground}">${escapeHtml(title)}</h1>
        ${bodyHtml}
        ${button}
      </td></tr>
      <tr><td style="padding:24px 8px 0;text-align:center;font-family:${c.sans};font-size:12px;color:${c.muted}">${escapeHtml(footer)}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
var EMAIL_BRAND;
var init_email_layout = __esm({
  "src/modules/notifications/email-layout.ts"() {
    "use strict";
    EMAIL_BRAND = {
      background: "#F4F1EB",
      card: "#FBFAF7",
      foreground: "#1F1A16",
      muted: "#6F675D",
      border: "#CFC6B8",
      primary: "#3E2F25",
      primaryForeground: "#FBFAF7",
      accent: "#9C5B3B",
      serif: "'Cormorant Garamond', Garamond, 'Times New Roman', serif",
      sans: "'IBM Plex Sans Arabic', Inter, 'Segoe UI', Tahoma, Arial, sans-serif"
    };
  }
});

// src/modules/notifications/email-templates.ts
function toText(parts) {
  return parts.filter(Boolean).join("\n\n");
}
function verificationEmail(args) {
  const t = copy[args.locale];
  const url = `${env.APP_URL}/${args.locale}/verify-email?token=${encodeURIComponent(args.token)}`;
  return {
    subject: t.verify.subject,
    html: renderLayout({
      locale: args.locale,
      title: t.verify.title,
      preheader: t.verify.body,
      bodyHtml: paragraph(t.hello(args.name)) + paragraph(t.verify.body),
      cta: { label: t.verify.cta, url },
      footer: t.footer,
      brandName: BRAND_NAME
    }),
    text: toText([t.hello(args.name), t.verify.body, url])
  };
}
function passwordResetEmail(args) {
  const t = copy[args.locale];
  const url = `${env.APP_URL}/${args.locale}/reset-password?token=${encodeURIComponent(args.token)}`;
  return {
    subject: t.reset.subject,
    html: renderLayout({
      locale: args.locale,
      title: t.reset.title,
      preheader: t.reset.body,
      bodyHtml: paragraph(t.hello(args.name)) + paragraph(t.reset.body),
      cta: { label: t.reset.cta, url },
      footer: t.footer,
      brandName: BRAND_NAME
    }),
    text: toText([t.hello(args.name), t.reset.body, url])
  };
}
function orderEmail(args) {
  const t = copy[args.locale];
  const o = t.order;
  const section = o[args.kind];
  const { order, locale } = args;
  const c = EMAIL_BRAND;
  const url = `${env.APP_URL}/${locale}/account/orders/${encodeURIComponent(order.orderNumber)}`;
  const cell = `padding:10px 0;border-bottom:1px solid ${c.border};font-size:14px`;
  const rows = order.items.map(
    (item) => `<tr>
        <td style="${cell}">${escapeHtml(item.title[locale])}<br><span style="color:${c.muted};font-size:12px">${escapeHtml(item.sku)} \xB7 ${o.qty} ${item.qty}</span></td>
        <td style="${cell};text-align:${locale === "ar" ? "left" : "right"};white-space:nowrap">${money(item.lineTotal, locale)}</td>
      </tr>`
  ).join("");
  const totalLine = (label, value, strong = false) => `<tr><td style="padding:4px 0;font-size:14px;${strong ? "font-weight:600" : `color:${c.muted}`}">${label}</td><td style="padding:4px 0;font-size:14px;text-align:${locale === "ar" ? "left" : "right"};${strong ? "font-weight:600" : ""}">${value}</td></tr>`;
  const a = order.shippingAddress;
  const body2 = `
    ${paragraph(t.hello(args.name))}
    ${paragraph(section.body)}
    <p style="margin:0 0 8px;color:${c.muted};font-size:13px">${o.number}</p>
    <p style="margin:0 0 20px;font-family:${c.serif};font-size:22px">${escapeHtml(order.orderNumber)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">
      ${totalLine(o.subtotal, money(order.subtotal, locale))}
      ${totalLine(o.shipping, money(order.shippingFee, locale))}
      ${order.discount > 0 ? totalLine(o.discount, `\u2212 ${money(order.discount, locale)}`) : ""}
      ${totalLine(o.total, money(order.total, locale), true)}
    </table>
    <p style="margin:24px 0 4px;color:${c.muted};font-size:13px">${o.address}</p>
    <p style="margin:0">${escapeHtml(a.fullName)}<br>${escapeHtml(a.street)}, ${escapeHtml(a.city)}<br>${escapeHtml(a.phone)}</p>`;
  return {
    subject: section.subject(order.orderNumber),
    html: renderLayout({
      locale,
      title: section.title,
      preheader: section.body,
      bodyHtml: body2,
      cta: { label: o.cta, url },
      footer: t.footer,
      brandName: BRAND_NAME
    }),
    text: toText([
      t.hello(args.name),
      section.body,
      `${o.number}: ${order.orderNumber}`,
      ...order.items.map((i) => `${i.title[locale]} \xD7 ${i.qty} \u2014 ${money(i.lineTotal, locale)}`),
      `${o.total}: ${money(order.total, locale)}`,
      url
    ])
  };
}
var BRAND_NAME, copy, money, paragraph;
var init_email_templates = __esm({
  "src/modules/notifications/email-templates.ts"() {
    "use strict";
    init_env();
    init_email_layout();
    BRAND_NAME = "ATELIER";
    copy = {
      ar: {
        footer: "\u0648\u0635\u0644\u062A\u0643 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0644\u0623\u0646\u0643 \u062A\u062A\u0639\u0627\u0645\u0644 \u0645\u0639 \u0645\u062A\u062C\u0631\u0646\u0627. \u0644\u0648 \u0644\u0645 \u062A\u0637\u0644\u0628 \u0630\u0644\u0643 \u064A\u0645\u0643\u0646\u0643 \u062A\u062C\u0627\u0647\u0644\u0647\u0627.",
        hello: (name) => `\u0623\u0647\u0644\u0627\u064B ${name}\u060C`,
        verify: {
          subject: "\u0641\u0639\u0651\u0644 \u062D\u0633\u0627\u0628\u0643",
          title: "\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0623\u062A\u064A\u0644\u064A\u0647",
          body: "\u0634\u0643\u0631\u0627\u064B \u0644\u0627\u0646\u0636\u0645\u0627\u0645\u0643. \u0627\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u0632\u0631 \u0623\u062F\u0646\u0627\u0647 \u0644\u062A\u0641\u0639\u064A\u0644 \u0628\u0631\u064A\u062F\u0643 \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A. \u0627\u0644\u0631\u0627\u0628\u0637 \u0635\u0627\u0644\u062D \u0644\u0645\u062F\u0629 24 \u0633\u0627\u0639\u0629.",
          cta: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062D\u0633\u0627\u0628"
        },
        reset: {
          subject: "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
          title: "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
          body: "\u062A\u0644\u0642\u064A\u0646\u0627 \u0637\u0644\u0628\u0627\u064B \u0644\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u062D\u0633\u0627\u0628\u0643. \u0627\u0644\u0631\u0627\u0628\u0637 \u0635\u0627\u0644\u062D \u0644\u0645\u062F\u0629 15 \u062F\u0642\u064A\u0642\u0629 \u0648\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u0641\u0642\u0637.",
          cta: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062C\u062F\u064A\u062F\u0629"
        },
        order: {
          placed: { subject: (n) => `\u062A\u0623\u0643\u064A\u062F \u0637\u0644\u0628\u0643 ${n}`, title: "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0637\u0644\u0628\u0643", body: "\u0633\u0646\u0631\u0627\u062C\u0639 \u0637\u0644\u0628\u0643 \u0648\u0646\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0643 \u0642\u0631\u064A\u0628\u0627\u064B \u0644\u062A\u0623\u0643\u064A\u062F\u0647." },
          shipped: { subject: (n) => `\u062A\u0645 \u0634\u062D\u0646 \u0637\u0644\u0628\u0643 ${n}`, title: "\u0637\u0644\u0628\u0643 \u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642 \u0625\u0644\u064A\u0643", body: "\u062A\u0645 \u062A\u0633\u0644\u064A\u0645 \u0637\u0644\u0628\u0643 \u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0634\u062D\u0646 \u0648\u0633\u064A\u0635\u0644\u0643 \u062E\u0644\u0627\u0644 \u0623\u064A\u0627\u0645 \u0642\u0644\u064A\u0644\u0629." },
          delivered: { subject: (n) => `\u062A\u0645 \u062A\u0633\u0644\u064A\u0645 \u0637\u0644\u0628\u0643 ${n}`, title: "\u062A\u0645 \u062A\u0633\u0644\u064A\u0645 \u0637\u0644\u0628\u0643", body: "\u0646\u062A\u0645\u0646\u0649 \u0623\u0646 \u064A\u0646\u0627\u0644 \u0625\u0639\u062C\u0627\u0628\u0643. \u064A\u0633\u0639\u062F\u0646\u0627 \u0623\u0646 \u062A\u0634\u0627\u0631\u0643\u0646\u0627 \u062A\u0642\u064A\u064A\u0645\u0643 \u0644\u0644\u0645\u0646\u062A\u062C\u0627\u062A." },
          cancelled: { subject: (n) => `\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0637\u0644\u0628\u0643 ${n}`, title: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0637\u0644\u0628", body: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628 \u0648\u0625\u0631\u062C\u0627\u0639 \u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A \u0625\u0644\u0649 \u0627\u0644\u0645\u062E\u0632\u0648\u0646." },
          cta: "\u0639\u0631\u0636 \u0627\u0644\u0637\u0644\u0628",
          number: "\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628",
          subtotal: "\u0627\u0644\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064A",
          shipping: "\u0627\u0644\u0634\u062D\u0646",
          discount: "\u0627\u0644\u062E\u0635\u0645",
          total: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A",
          address: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u062A\u0648\u0635\u064A\u0644",
          qty: "\u0627\u0644\u0643\u0645\u064A\u0629"
        }
      },
      en: {
        footer: "You are receiving this e-mail because you shop with us. If this was not you, you can ignore it.",
        hello: (name) => `Hello ${name},`,
        verify: {
          subject: "Verify your account",
          title: "Welcome to Atelier",
          body: "Thank you for joining. Press the button below to verify your e-mail address. The link is valid for 24 hours.",
          cta: "Verify e-mail"
        },
        reset: {
          subject: "Reset your password",
          title: "Reset your password",
          body: "We received a request to reset your password. The link is valid for 15 minutes and can be used once.",
          cta: "Choose a new password"
        },
        order: {
          placed: { subject: (n) => `Order confirmation ${n}`, title: "We received your order", body: "We will review your order and get in touch shortly to confirm it." },
          shipped: { subject: (n) => `Your order ${n} has shipped`, title: "Your order is on its way", body: "Your order was handed to the courier and should arrive within a few days." },
          delivered: { subject: (n) => `Your order ${n} was delivered`, title: "Your order was delivered", body: "We hope you love it. We would be glad to hear your review." },
          cancelled: { subject: (n) => `Your order ${n} was cancelled`, title: "Order cancelled", body: "This order was cancelled and the items were returned to stock." },
          cta: "View order",
          number: "Order number",
          subtotal: "Subtotal",
          shipping: "Shipping",
          discount: "Discount",
          total: "Total",
          address: "Delivery address",
          qty: "Qty"
        }
      }
    };
    money = (piasters, locale) => new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", { style: "currency", currency: "EGP" }).format(piasters / 100);
    paragraph = (text) => `<p style="margin:0 0 16px">${escapeHtml(text)}</p>`;
  }
});

// src/modules/notifications/notification.service.ts
var notifications;
var init_notification_service = __esm({
  "src/modules/notifications/notification.service.ts"() {
    "use strict";
    init_background();
    init_email_transport();
    init_email_templates();
    notifications = {
      verifyEmail(to, token) {
        runInBackground(
          () => emailTransport.send({ to: to.email, ...verificationEmail({ name: to.name, token, locale: to.locale }) }),
          "email:verify"
        );
      },
      passwordReset(to, token) {
        runInBackground(
          () => emailTransport.send({ to: to.email, ...passwordResetEmail({ name: to.name, token, locale: to.locale }) }),
          "email:password-reset"
        );
      },
      order(kind, to, order) {
        runInBackground(
          () => emailTransport.send({ to: to.email, ...orderEmail({ kind, name: to.name, locale: to.locale, order }) }),
          `email:order-${kind}`
        );
      },
      /** Sends the e-mail (if any) that corresponds to an order status change. */
      orderStatusChanged(status, to, order) {
        const kind = status === "paid" ? "placed" : status === "shipped" ? "shipped" : status === "delivered" ? "delivered" : status === "cancelled" ? "cancelled" : null;
        if (kind) this.order(kind, to, order);
      }
    };
  }
});

// src/modules/payments/payment.models.ts
import { model as model9, Schema as Schema9 } from "mongoose";
var PAYMENT_RECORD_STATUSES, paymentSchema, PaymentModel, WEBHOOK_OUTCOMES, paymentEventSchema, PaymentEventModel;
var init_payment_models = __esm({
  "src/modules/payments/payment.models.ts"() {
    "use strict";
    PAYMENT_RECORD_STATUSES = ["pending", "paid", "failed", "refunded"];
    paymentSchema = new Schema9(
      {
        orderId: { type: Schema9.Types.ObjectId, ref: "Order", required: true, index: true },
        provider: { type: String, required: true },
        providerTxnId: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, required: true, default: "EGP" },
        status: { type: String, enum: PAYMENT_RECORD_STATUSES, default: "pending" }
      },
      { timestamps: { createdAt: true, updatedAt: true } }
    );
    paymentSchema.index({ provider: 1, providerTxnId: 1 }, { unique: true });
    PaymentModel = model9("Payment", paymentSchema);
    WEBHOOK_OUTCOMES = [
      "processed",
      "duplicate",
      "invalid_signature",
      "amount_mismatch",
      "unknown_payment",
      "order_not_payable",
      "ignored"
    ];
    paymentEventSchema = new Schema9({
      provider: { type: String, required: true },
      type: String,
      providerTxnId: String,
      rawPayload: { type: String, required: true },
      signatureValid: { type: Boolean, required: true },
      outcome: { type: String, enum: WEBHOOK_OUTCOMES, required: true },
      receivedAt: { type: Date, default: () => /* @__PURE__ */ new Date() }
    });
    paymentEventSchema.index({ receivedAt: -1 });
    paymentEventSchema.index({ provider: 1, providerTxnId: 1 });
    PaymentEventModel = model9("PaymentEvent", paymentEventSchema, "payment_events");
  }
});

// src/modules/users/user.model.ts
import { model as model10, Schema as Schema10 } from "mongoose";
var addressSchema, userSchema, UserModel;
var init_user_model = __esm({
  "src/modules/users/user.model.ts"() {
    "use strict";
    init_constants();
    addressSchema = new Schema10({
      label: { type: String, trim: true, maxlength: 40 },
      fullName: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true },
      governorate: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true, maxlength: 80 },
      street: { type: String, required: true, trim: true, maxlength: 240 },
      notes: { type: String, trim: true, maxlength: 300 },
      isDefault: { type: Boolean, default: false }
    });
    userSchema = new Schema10(
      {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        email: { type: String, required: true, lowercase: true, trim: true, unique: true },
        // Never selected by default — must be requested explicitly with `.select('+passwordHash')`.
        passwordHash: { type: String, select: false },
        role: { type: String, enum: USER_ROLES, default: "customer", index: true },
        status: { type: String, enum: USER_STATUSES, default: "active" },
        googleId: { type: String, unique: true, sparse: true },
        emailVerified: { type: Boolean, default: false },
        locale: { type: String, enum: ["ar", "en"], default: "ar" },
        addresses: { type: [addressSchema], default: [] },
        wishlist: { type: [Schema10.Types.ObjectId], ref: "Product", default: [] },
        lastLoginAt: Date
      },
      { timestamps: true }
    );
    userSchema.index({ createdAt: -1 });
    UserModel = model10("User", userSchema);
  }
});

// src/modules/orders/order.transitions.ts
import mongoose3 from "mongoose";
async function transitionOrder(request) {
  const order = await OrderModel.findById(request.orderId);
  if (!order || request.ownerId && String(order.userId) !== request.ownerId) throw AppError.notFound("Order");
  assertTransition(order, request.to, request.actor);
  const { to } = request;
  const from = order.status;
  const set = { status: to };
  const paymentStatus = to === "paid" || to === "delivered" && order.paymentMethod === "cod" ? "paid" : to === "refunded" ? "refunded" : void 0;
  if (paymentStatus) set.paymentStatus = paymentStatus;
  if (to === "cancelled" && request.note) set.cancelReason = request.note;
  const updated = await mongoose3.connection.transaction(async (session) => {
    const doc = await OrderModel.findOneAndUpdate(
      { _id: order._id, status: from },
      {
        $set: set,
        $push: {
          statusHistory: {
            status: to,
            at: /* @__PURE__ */ new Date(),
            actor: request.actor,
            ...request.byUserId ? { byUserId: toObjectId(request.byUserId) } : {},
            ...request.note ? { note: request.note } : {}
          }
        }
      },
      { returnDocument: "after", session }
    );
    if (!doc) throw AppError.conflict("The order was changed by someone else \u2014 reload and retry");
    const stockLines = doc.items.map((i) => ({ sku: i.sku, qty: i.qty, productId: i.productId }));
    if (restoresStock(to)) {
      await inventoryService.release(stockLines, {
        session,
        reason: to === "refunded" ? "order_refunded" : "order_cancelled",
        orderId: doc._id,
        ...request.byUserId ? { byUserId: request.byUserId } : {}
      });
    }
    if (to === "cancelled" && doc.couponCode) {
      await CouponModel.updateOne({ code: doc.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
    }
    const soldDelta = to === "delivered" ? 1 : from === "delivered" && to === "refunded" ? -1 : 0;
    if (soldDelta !== 0) {
      for (const item of doc.items) {
        await ProductModel.updateOne({ _id: item.productId }, { $inc: { soldCount: soldDelta * item.qty } }, { session });
      }
    }
    if (to === "refunded") {
      await PaymentModel.updateMany({ orderId: doc._id, status: "paid" }, { $set: { status: "refunded" } }, { session });
    }
    return doc;
  });
  await notifyStatusChange(updated);
  return updated;
}
async function notifyStatusChange(order) {
  const user = await UserModel.findById(order.userId).select("locale").lean();
  notifications.orderStatusChanged(
    order.status,
    { name: order.customerName, email: order.customerEmail, locale: user?.locale ?? "ar" },
    order
  );
}
var init_order_transitions = __esm({
  "src/modules/orders/order.transitions.ts"() {
    "use strict";
    init_errors();
    init_object_id();
    init_coupon_model();
    init_inventory_service();
    init_notification_service();
    init_payment_models();
    init_product_model();
    init_user_model();
    init_order_model();
    init_order_state_machine();
  }
});

// src/modules/reviews/review.model.ts
import { model as model11, Schema as Schema11 } from "mongoose";
var reviewSchema, ReviewModel;
var init_review_model = __esm({
  "src/modules/reviews/review.model.ts"() {
    "use strict";
    reviewSchema = new Schema11(
      {
        productId: { type: Schema11.Types.ObjectId, ref: "Product", required: true },
        userId: { type: Schema11.Types.ObjectId, ref: "User", required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        title: { type: String, maxlength: 120 },
        comment: { type: String, required: true, maxlength: 2e3 },
        verifiedPurchase: { type: Boolean, default: true }
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    );
    reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
    reviewSchema.index({ productId: 1, createdAt: -1 });
    ReviewModel = model11("Review", reviewSchema);
  }
});

// src/modules/products/product.builder.ts
function validateAndDerive(input, attributes, searchTerms = []) {
  const issues = [];
  const attrByKey = new Map(attributes.map((a) => [a.key, a]));
  const optionKeys = /* @__PURE__ */ new Set();
  input.options.forEach((option, i) => {
    const at = `options.${i}`;
    const attribute = attrByKey.get(option.key);
    if (optionKeys.has(option.key)) issues.push({ path: at, message: `Duplicate option "${option.key}"` });
    optionKeys.add(option.key);
    if (!attribute?.variantOption) {
      issues.push({ path: `${at}.key`, message: `"${option.key}" is not a variant option of this category` });
      return;
    }
    const allowed = new Set(attribute.values.map((v) => v.value));
    if (new Set(option.values).size !== option.values.length) {
      issues.push({ path: `${at}.values`, message: "Option values must be unique" });
    }
    for (const value of option.values) {
      if (allowed.size > 0 && !allowed.has(value)) {
        issues.push({ path: `${at}.values`, message: `"${value}" is not an allowed ${option.key}` });
      }
    }
  });
  const skus = /* @__PURE__ */ new Set();
  const combos = /* @__PURE__ */ new Set();
  const optionByKey = new Map(input.options.map((o) => [o.key, new Set(o.values)]));
  input.variants.forEach((variant, i) => {
    const at = `variants.${i}`;
    if (skus.has(variant.sku)) issues.push({ path: `${at}.sku`, message: `Duplicate SKU "${variant.sku}"` });
    skus.add(variant.sku);
    if (variant.compareAtPrice !== void 0 && variant.compareAtPrice <= variant.price) {
      issues.push({ path: `${at}.compareAtPrice`, message: "compareAtPrice must be greater than price" });
    }
    const keys = Object.keys(variant.optionValues);
    if (keys.length !== optionKeys.size || keys.some((k) => !optionKeys.has(k))) {
      issues.push({
        path: `${at}.optionValues`,
        message: `Variant must define exactly these options: ${[...optionKeys].join(", ") || "(none)"}`
      });
      return;
    }
    for (const [key, value] of Object.entries(variant.optionValues)) {
      if (!optionByKey.get(key)?.has(value)) {
        issues.push({ path: `${at}.optionValues.${key}`, message: `"${value}" is not listed in option "${key}"` });
      }
    }
    const combo = keys.sort().map((k) => `${k}=${variant.optionValues[k]}`).join("|");
    if (combos.has(combo)) issues.push({ path: at, message: "Two variants share the same option combination" });
    combos.add(combo);
  });
  if (issues.length > 0) fail(issues);
  const filterAttrs = [];
  const seen = /* @__PURE__ */ new Set();
  const addFacet = (k, v) => {
    const id = `${k}\0${v}`;
    if (!seen.has(id)) {
      seen.add(id);
      filterAttrs.push({ k, v });
    }
  };
  for (const option of input.options) {
    if (attrByKey.get(option.key)?.filterable) {
      for (const value of option.values) {
        if (input.variants.some((v) => v.optionValues[option.key] === value)) addFacet(option.key, value);
      }
    }
  }
  for (const attribute of attributes) {
    if (attribute.filterable && !attribute.variantOption) {
      const value = input.specs[attribute.key];
      if (value) addFacet(attribute.key, value);
    }
  }
  const prices = input.variants.map((v) => v.price);
  return {
    filterAttrs,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    searchKeywords: tokenize(
      input.title.ar,
      input.title.en,
      ...input.tags,
      ...searchTerms,
      ...input.variants.map((v) => v.sku)
    )
  };
}
var fail;
var init_product_builder = __esm({
  "src/modules/products/product.builder.ts"() {
    "use strict";
    init_errors();
    init_text();
    fail = (issues) => {
      throw AppError.validation(issues, "Product does not match its category definition");
    };
  }
});

// src/modules/products/product.service.ts
import { Types as Types3 } from "mongoose";
async function resolveContext(input) {
  const category = await CategoryModel.findById(input.categoryId).lean();
  if (!category) throw AppError.notFound("Category");
  const [attributes, brand, ancestors] = await Promise.all([
    categoryService.effectiveAttributes(category),
    input.brandId ? BrandModel.findById(input.brandId).lean() : Promise.resolve(null),
    CategoryModel.find({ _id: { $in: category.path } }).lean()
  ]);
  if (input.brandId && !brand) throw AppError.notFound("Brand");
  const searchTerms = [brand?.name ?? "", ...ancestors.flatMap((c) => [c.name.ar, c.name.en])];
  const derived = validateAndDerive(input, attributes, searchTerms);
  return { category, derived };
}
function variantsPipelineExpression(variants) {
  const incoming = variants.map(({ sku, optionValues, price, compareAtPrice, stock }) => ({
    _id: new Types3.ObjectId(),
    sku,
    optionValues,
    price,
    ...compareAtPrice !== void 0 ? { compareAtPrice } : {},
    stock
  }));
  return {
    $map: {
      input: { $literal: incoming },
      as: "n",
      in: {
        $let: {
          vars: {
            old: { $first: { $filter: { input: "$variants", as: "o", cond: { $eq: ["$$o.sku", "$$n.sku"] } } } }
          },
          in: {
            $cond: [
              { $ifNull: ["$$old", false] },
              { $mergeObjects: ["$$n", { _id: "$$old._id", stock: "$$old.stock" }] },
              "$$n"
            ]
          }
        }
      }
    }
  };
}
var revalidate, productService;
var init_product_service = __esm({
  "src/modules/products/product.service.ts"() {
    "use strict";
    init_errors();
    init_revalidate();
    init_text();
    init_unique_slug();
    init_brand_model();
    init_category_model();
    init_category_service();
    init_inventory_models();
    init_order_model();
    init_review_model();
    init_product_builder();
    init_product_model();
    init_product_query();
    revalidate = (slug) => revalidateStorefront(["products", `product:${slug}`]);
    productService = {
      async create(input) {
        const { category, derived } = await resolveContext(input);
        const slug = input.slug ?? await uniqueSlug(input.title.en, (s) => ProductModel.exists({ slug: s }).then(Boolean));
        const product = await ProductModel.create({
          title: input.title,
          slug,
          description: input.description,
          categoryId: category._id,
          categoryPath: category.path,
          ...input.brandId ? { brandId: new Types3.ObjectId(input.brandId) } : {},
          images: input.images,
          specs: input.specs,
          options: input.options,
          variants: input.variants,
          tags: input.tags,
          status: input.status,
          ...derived
        });
        revalidate(product.slug);
        return product;
      },
      async update(id, input) {
        const existing = await ProductModel.findById(id).select("slug").lean();
        if (!existing) throw AppError.notFound("Product");
        const { category, derived } = await resolveContext(input);
        const slug = input.slug ?? existing.slug;
        const lit = (value) => ({ $literal: value });
        const result = await ProductModel.updateOne({ _id: id }, [
          {
            $set: {
              title: lit(input.title),
              slug: lit(slug),
              description: lit(input.description),
              categoryId: category._id,
              categoryPath: category.path,
              brandId: input.brandId ? new Types3.ObjectId(input.brandId) : "$$REMOVE",
              images: lit(input.images),
              specs: lit(input.specs),
              options: lit(input.options),
              variants: variantsPipelineExpression(input.variants),
              tags: lit(input.tags),
              status: lit(input.status),
              filterAttrs: lit(derived.filterAttrs),
              minPrice: derived.minPrice,
              maxPrice: derived.maxPrice,
              searchKeywords: lit(derived.searchKeywords),
              updatedAt: "$$NOW"
            }
          }
        ], { updatePipeline: true });
        if (result.matchedCount === 0) throw AppError.notFound("Product");
        revalidate(existing.slug);
        if (slug !== existing.slug) revalidate(slug);
        return ProductModel.findById(id).lean();
      },
      /** Products that were ever ordered are archived (back to draft) instead of deleted, preserving history. */
      async remove(id) {
        const product = await ProductModel.findById(id);
        if (!product) throw AppError.notFound("Product");
        const ordered = await OrderModel.exists({ "items.productId": product._id });
        if (ordered) {
          product.status = "draft";
          await product.save();
          revalidate(product.slug);
          return "archived";
        }
        await Promise.all([product.deleteOne(), ReviewModel.deleteMany({ productId: product._id })]);
        revalidate(product.slug);
        return "deleted";
      },
      async getBySlug(slug) {
        const product = await ProductModel.findOne({ slug, status: "published" }).select("-searchKeywords -filterAttrs").lean();
        if (!product) throw AppError.notFound("Product");
        const [brand, category, related] = await Promise.all([
          product.brandId ? BrandModel.findById(product.brandId).lean() : Promise.resolve(null),
          CategoryModel.findById(product.categoryId).lean(),
          relatedProducts(product.categoryId, product._id)
        ]);
        const chain = category ? await CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean() : [];
        return {
          product,
          brand,
          breadcrumbs: chain.map((c) => ({ id: String(c._id), name: c.name, slug: c.slug })),
          /** Attribute definitions (labels, swatches) so the UI can render option pickers nicely. */
          attributes: chain.length > 0 ? (await categoryService.effectiveAttributes(category)).filter((a) => a.variantOption) : [],
          related
        };
      },
      async getAdmin(id) {
        const product = await ProductModel.findById(id).lean();
        if (!product) throw AppError.notFound("Product");
        return product;
      },
      async listAdmin(query) {
        const filter = {};
        if (query.status) filter.status = query.status;
        if (query.category) filter.categoryPath = new Types3.ObjectId(query.category);
        if (query.lowStock !== void 0) filter.variants = { $elemMatch: { stock: { $lte: query.lowStock } } };
        const tokens = tokenize(query.q ?? "");
        if (tokens.length > 0) filter.$and = tokens.map((t) => ({ searchKeywords: { $regex: `^${escapeRegex(t)}` } }));
        const [items, total] = await Promise.all([
          ProductModel.find(filter).select("title slug images status minPrice maxPrice variants.sku variants.stock categoryId updatedAt soldCount").sort({ updatedAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
          ProductModel.countDocuments(filter)
        ]);
        return {
          items,
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit))
        };
      },
      async inventoryHistory(sku, limit = 50) {
        return InventoryLogModel.find({ sku }).sort({ createdAt: -1 }).limit(limit).lean();
      }
    };
  }
});

// src/modules/products/product.routes.ts
import { Router as Router6 } from "express";
var list2, suggest, detail, productRouter, adminList, adminGet, create4, update4, remove4, productAdminRouter;
var init_product_routes = __esm({
  "src/modules/products/product.routes.ts"() {
    "use strict";
    init_validate();
    init_audit_service();
    init_product_query();
    init_product_schemas();
    init_product_service();
    list2 = async (req, res) => {
      const { query } = validated(req);
      res.json(await listProducts(query));
    };
    suggest = async (req, res) => {
      const { query } = validated(req);
      res.json({ items: await suggestProducts(query.q, query.limit) });
    };
    detail = async (req, res) => {
      const { params } = validated(req);
      res.json(await productService.getBySlug(params.slug));
    };
    productRouter = Router6();
    productRouter.get("/", validate(listProductsSchemas), list2);
    productRouter.get("/suggest", validate(suggestSchemas), suggest);
    productRouter.get("/:slug", validate(productSlugSchemas), detail);
    adminList = async (req, res) => {
      const { query } = validated(req);
      res.json(await productService.listAdmin(query));
    };
    adminGet = async (req, res) => {
      const { params } = validated(req);
      res.json({ product: await productService.getAdmin(params.id) });
    };
    create4 = async (req, res) => {
      const { body: body2 } = validated(req);
      const product = await productService.create(body2);
      await recordAudit(req, { action: "product.create", entity: "product", entityId: product.id });
      res.status(201).json({ product });
    };
    update4 = async (req, res) => {
      const { params, body: body2 } = validated(req);
      const product = await productService.update(params.id, body2);
      await recordAudit(req, { action: "product.update", entity: "product", entityId: params.id });
      res.json({ product });
    };
    remove4 = async (req, res) => {
      const { params } = validated(req);
      const outcome = await productService.remove(params.id);
      await recordAudit(req, { action: `product.${outcome}`, entity: "product", entityId: params.id });
      res.json({ outcome });
    };
    productAdminRouter = Router6();
    productAdminRouter.get("/", validate(adminListProductsSchemas), adminList);
    productAdminRouter.post("/", validate(createProductSchemas), create4);
    productAdminRouter.get("/:id", validate(productIdSchemas), adminGet);
    productAdminRouter.put("/:id", validate(updateProductSchemas), update4);
    productAdminRouter.delete("/:id", validate(productIdSchemas), remove4);
  }
});

// src/modules/products/product.import.ts
import { z as z11 } from "zod";
async function importProducts(rows) {
  const results = [];
  for (const [index, raw] of rows.entries()) {
    const row = index + 1;
    try {
      const data = rowSchema.parse(raw);
      const [category, brand] = await Promise.all([
        CategoryModel.findOne({ slug: data.category_slug }).select("_id").lean(),
        data.brand_slug ? BrandModel.findOne({ slug: data.brand_slug }).select("_id").lean() : null
      ]);
      if (!category) throw new Error(`Unknown category "${data.category_slug}"`);
      if (data.brand_slug && !brand) throw new Error(`Unknown brand "${data.brand_slug}"`);
      await productService.create({
        title: { en: data.title_en, ar: data.title_ar },
        description: { en: data.description_en ?? "", ar: data.description_ar ?? "" },
        categoryId: String(category._id),
        ...brand ? { brandId: String(brand._id) } : {},
        images: data.image_url ? [{ url: data.image_url }] : [],
        specs: {},
        options: [],
        variants: [
          { sku: data.sku, optionValues: {}, price: piastersSchema.parse(Math.round(Number(data.price_egp) * 100)), stock: Number(data.stock) }
        ],
        tags: [],
        status: data.status ?? "draft"
      });
      results.push({ row, ok: true, sku: data.sku });
    } catch (error) {
      const message = error instanceof z11.ZodError ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : error.message;
      results.push({ row, ok: false, error: message });
    }
  }
  return results;
}
var rowSchema;
var init_product_import = __esm({
  "src/modules/products/product.import.ts"() {
    "use strict";
    init_schemas();
    init_brand_model();
    init_category_model();
    init_product_service();
    init_product_schemas();
    rowSchema = z11.object({
      title_en: z11.string().trim().min(1).max(200),
      title_ar: z11.string().trim().min(1).max(200),
      category_slug: z11.string().trim().min(1),
      brand_slug: z11.string().trim().optional(),
      sku: skuSchema,
      price_egp: z11.string().trim().regex(/^\d+(\.\d{1,2})?$/, "price_egp must be like 149.99"),
      stock: z11.string().trim().regex(/^\d+$/),
      image_url: z11.url().optional().or(z11.literal("")),
      description_en: z11.string().optional(),
      description_ar: z11.string().optional(),
      status: z11.enum(["draft", "published"]).optional()
    });
  }
});

// src/modules/auth/auth.models.ts
import { model as model12, Schema as Schema12 } from "mongoose";
var sessionSchema, SessionModel, AUTH_TOKEN_TYPES, authTokenSchema, AuthTokenModel;
var init_auth_models = __esm({
  "src/modules/auth/auth.models.ts"() {
    "use strict";
    sessionSchema = new Schema12(
      {
        userId: { type: Schema12.Types.ObjectId, ref: "User", required: true, index: true },
        refreshTokenHash: { type: String, required: true, unique: true },
        family: { type: String, required: true, index: true },
        expiresAt: { type: Date, required: true },
        revokedAt: Date,
        rotatedAt: Date,
        userAgent: { type: String, maxlength: 300 },
        ip: String
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    );
    sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    SessionModel = model12("Session", sessionSchema);
    AUTH_TOKEN_TYPES = ["email_verification", "password_reset"];
    authTokenSchema = new Schema12(
      {
        userId: { type: Schema12.Types.ObjectId, ref: "User", required: true, index: true },
        type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
        usedAt: Date
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    );
    authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    AuthTokenModel = model12("AuthToken", authTokenSchema);
  }
});

// src/modules/shipping/shipping-zone.model.ts
import { model as model13, Schema as Schema13 } from "mongoose";
var shippingZoneSchema, ShippingZoneModel;
var init_shipping_zone_model = __esm({
  "src/modules/shipping/shipping-zone.model.ts"() {
    "use strict";
    shippingZoneSchema = new Schema13(
      {
        governorate: { type: String, required: true, unique: true },
        fee: { type: Number, required: true, min: 0, validate: Number.isInteger },
        estimatedDays: {
          type: { min: { type: Number, required: true }, max: { type: Number, required: true } },
          _id: false,
          required: true
        },
        isActive: { type: Boolean, default: true }
      },
      { timestamps: true }
    );
    ShippingZoneModel = model13("ShippingZone", shippingZoneSchema);
  }
});

// src/modules/shipping/shipping.routes.ts
import { Router as Router7 } from "express";
import { z as z12 } from "zod";
var labelFor, shippingRouter, upsertSchemas, shippingAdminRouter;
var init_shipping_routes = __esm({
  "src/modules/shipping/shipping.routes.ts"() {
    "use strict";
    init_constants();
    init_validate();
    init_errors();
    init_schemas();
    init_audit_service();
    init_shipping_zone_model();
    labelFor = (key) => GOVERNORATES.find((g) => g.key === key);
    shippingRouter = Router7();
    shippingRouter.get("/zones", async (_req, res) => {
      const zones = await ShippingZoneModel.find({ isActive: true }).lean();
      res.json({
        items: zones.map((z18) => ({
          governorate: z18.governorate,
          name: labelFor(z18.governorate) ?? { ar: z18.governorate, en: z18.governorate },
          fee: z18.fee,
          estimatedDays: z18.estimatedDays
        })).sort((a, b) => a.name.en.localeCompare(b.name.en))
      });
    });
    upsertSchemas = {
      params: z12.object({ governorate: z12.enum(GOVERNORATE_KEYS) }),
      body: z12.object({
        fee: piastersSchema,
        estimatedDays: z12.object({ min: z12.number().int().min(0).max(30), max: z12.number().int().min(0).max(30) }),
        isActive: z12.boolean().default(true)
      }).refine((b) => b.estimatedDays.min <= b.estimatedDays.max, { message: "min must be \u2264 max" })
    };
    shippingAdminRouter = Router7();
    shippingAdminRouter.get("/", async (_req, res) => {
      res.json({ items: await ShippingZoneModel.find().sort({ governorate: 1 }).lean() });
    });
    shippingAdminRouter.put("/:governorate", validate(upsertSchemas), async (req, res) => {
      const { params, body: body2 } = validated(req);
      const zone = await ShippingZoneModel.findOneAndUpdate(
        { governorate: params.governorate },
        { $set: body2 },
        { upsert: true, returnDocument: "after", runValidators: true }
      );
      await recordAudit(req, { action: "shipping.upsert", entity: "shipping_zone", entityId: params.governorate, meta: body2 });
      res.json({ zone });
    });
    shippingAdminRouter.delete("/:governorate", validate({ params: upsertSchemas.params }), async (req, res) => {
      const { params } = validated(req);
      if (!await ShippingZoneModel.findOneAndDelete({ governorate: params.governorate })) throw AppError.notFound("Shipping zone");
      await recordAudit(req, { action: "shipping.delete", entity: "shipping_zone", entityId: params.governorate });
      res.status(204).end();
    });
  }
});

// src/modules/admin/dashboard.service.ts
import mongoose4 from "mongoose";
async function periodStarts() {
  const db = mongoose4.connection.db;
  const [row] = await db.aggregate([
    { $documents: [{}] },
    {
      $project: {
        _id: 0,
        today: { $dateTrunc: { date: "$$NOW", unit: "day", timezone: TZ } },
        month: { $dateTrunc: { date: "$$NOW", unit: "month", timezone: TZ } },
        since30: { $dateSubtract: { startDate: { $dateTrunc: { date: "$$NOW", unit: "day", timezone: TZ } }, unit: "day", amount: 29, timezone: TZ } }
      }
    }
  ]).toArray();
  return row;
}
var TZ, REVENUE_STATUSES, LOW_STOCK_THRESHOLD, dashboardService;
var init_dashboard_service = __esm({
  "src/modules/admin/dashboard.service.ts"() {
    "use strict";
    init_order_model();
    init_product_model();
    TZ = "Africa/Cairo";
    REVENUE_STATUSES = ["paid", "pending_confirmation", "confirmed", "processing", "shipped", "delivered"];
    LOW_STOCK_THRESHOLD = 5;
    dashboardService = {
      async overview() {
        const { today, month, since30 } = await periodStarts();
        const earliest = month < since30 ? month : since30;
        const sales = { status: { $in: REVENUE_STATUSES } };
        const [orders, statusCounts, lowStock] = await Promise.all([
          OrderModel.aggregate([
            { $match: { createdAt: { $gte: earliest }, ...sales } },
            {
              $facet: {
                periods: [
                  {
                    $group: {
                      _id: null,
                      monthRevenue: { $sum: { $cond: [{ $gte: ["$createdAt", month] }, "$total", 0] } },
                      monthOrders: { $sum: { $cond: [{ $gte: ["$createdAt", month] }, 1, 0] } },
                      todayRevenue: { $sum: { $cond: [{ $gte: ["$createdAt", today] }, "$total", 0] } },
                      todayOrders: { $sum: { $cond: [{ $gte: ["$createdAt", today] }, 1, 0] } }
                    }
                  }
                ],
                daily: [
                  { $match: { createdAt: { $gte: since30 } } },
                  {
                    $group: {
                      _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: TZ } },
                      revenue: { $sum: "$total" },
                      orders: { $sum: 1 }
                    }
                  },
                  { $sort: { _id: 1 } }
                ],
                products: [
                  { $match: { createdAt: { $gte: since30 } } },
                  { $unwind: "$items" },
                  {
                    $group: {
                      _id: "$items.productId",
                      title: { $first: "$items.title" },
                      image: { $first: "$items.image" },
                      qty: { $sum: "$items.qty" },
                      revenue: { $sum: "$items.lineTotal" }
                    }
                  },
                  { $sort: { revenue: -1 } },
                  { $limit: 5 }
                ],
                categories: [
                  { $match: { createdAt: { $gte: since30 } } },
                  { $unwind: "$items" },
                  { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "p", pipeline: [{ $project: { categoryPath: 1 } }] } },
                  { $unwind: "$p" },
                  // Credit the sale to the top-level (root) category of the product.
                  { $group: { _id: { $arrayElemAt: ["$p.categoryPath", 0] }, qty: { $sum: "$items.qty" }, revenue: { $sum: "$items.lineTotal" } } },
                  { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "c", pipeline: [{ $project: { name: 1 } }] } },
                  { $unwind: "$c" },
                  { $project: { name: "$c.name", qty: 1, revenue: 1 } },
                  { $sort: { revenue: -1 } },
                  { $limit: 5 }
                ]
              }
            }
          ]),
          OrderModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
          ProductModel.aggregate([
            { $match: { status: "published", variants: { $elemMatch: { stock: { $lte: LOW_STOCK_THRESHOLD } } } } },
            { $unwind: "$variants" },
            { $match: { "variants.stock": { $lte: LOW_STOCK_THRESHOLD } } },
            { $sort: { "variants.stock": 1 } },
            { $limit: 10 },
            { $project: { _id: 0, sku: "$variants.sku", stock: "$variants.stock", productId: "$_id", title: 1 } }
          ])
        ]);
        const facet = orders[0];
        const p = facet?.periods[0] ?? {};
        const monthOrders = p["monthOrders"] ?? 0;
        const monthRevenue = p["monthRevenue"] ?? 0;
        return {
          today: { revenue: p["todayRevenue"] ?? 0, orders: p["todayOrders"] ?? 0 },
          month: {
            revenue: monthRevenue,
            orders: monthOrders,
            averageOrderValue: monthOrders > 0 ? Math.round(monthRevenue / monthOrders) : 0
          },
          salesByDay: facet?.daily.map((d) => ({ date: d._id, revenue: d.revenue, orders: d.orders })) ?? [],
          topProducts: facet?.products.map((x) => ({ productId: String(x._id), title: x.title, image: x.image, qty: x.qty, revenue: x.revenue })) ?? [],
          topCategories: facet?.categories.map((x) => ({ categoryId: String(x._id), name: x.name, qty: x.qty, revenue: x.revenue })) ?? [],
          orderStatusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
          lowStock: lowStock.map((s) => ({ ...s, productId: String(s.productId) })),
          lowStockThreshold: LOW_STOCK_THRESHOLD
        };
      }
    };
  }
});

// src/modules/admin/admin.routes.ts
import { Router as Router8 } from "express";
import { v2 as cloudinary } from "cloudinary";
import { z as z13 } from "zod";
var adminRouter, orderListSchemas, orderIdSchemas, transitionSchemas, newOrdersSchemas, adjustSchemas, logsSchemas, customerListSchemas, banSchemas, importSchemas;
var init_admin_routes = __esm({
  "src/modules/admin/admin.routes.ts"() {
    "use strict";
    init_env();
    init_authenticate();
    init_validate();
    init_errors();
    init_text();
    init_schemas();
    init_brand_routes();
    init_category_routes();
    init_collection_routes();
    init_coupon_routes();
    init_inventory_service();
    init_inventory_models();
    init_order_dto();
    init_order_model();
    init_order_state_machine();
    init_order_transitions();
    init_product_routes();
    init_product_schemas();
    init_product_import();
    init_auth_models();
    init_shipping_routes();
    init_user_model();
    init_audit_log_model();
    init_audit_service();
    init_dashboard_service();
    adminRouter = Router8();
    adminRouter.use(authenticate, requireRole("admin", "demo_admin"));
    adminRouter.use((req, _res, next) => {
      if (req.auth?.role === "demo_admin" && !["GET", "HEAD"].includes(req.method)) {
        throw AppError.forbidden("This is a read-only demo account");
      }
      next();
    });
    adminRouter.get("/dashboard", async (_req, res) => {
      res.json(await dashboardService.overview());
    });
    adminRouter.use("/products", productAdminRouter);
    adminRouter.use("/categories", categoryAdminRouter);
    adminRouter.use("/brands", brandAdminRouter);
    adminRouter.use("/collections", collectionAdminRouter);
    adminRouter.use("/coupons", couponAdminRouter);
    adminRouter.use("/shipping-zones", shippingAdminRouter);
    orderListSchemas = {
      query: paginationQuery.extend({
        status: z13.enum(ORDER_STATUSES).optional(),
        q: z13.string().trim().max(80).optional(),
        paymentMethod: z13.enum(["cod", "card", "wallet", "fawry"]).optional(),
        from: z13.coerce.date().optional(),
        to: z13.coerce.date().optional()
      })
    };
    orderIdSchemas = { params: idParams };
    transitionSchemas = {
      params: idParams,
      body: z13.object({ to: z13.enum(ORDER_STATUSES), note: z13.string().trim().max(500).optional() })
    };
    newOrdersSchemas = { query: z13.object({ since: z13.coerce.date().optional() }) };
    adminRouter.get("/orders", validate(orderListSchemas), async (req, res) => {
      const { query } = validated(req);
      const filter = {};
      if (query.status) filter["status"] = query.status;
      if (query.paymentMethod) filter["paymentMethod"] = query.paymentMethod;
      if (query.from || query.to) filter["createdAt"] = { ...query.from && { $gte: query.from }, ...query.to && { $lte: query.to } };
      if (query.q) {
        const prefix = new RegExp(`^${escapeRegex(query.q)}`, "i");
        filter["$or"] = [{ orderNumber: prefix }, { customerEmail: prefix }, { "shippingAddress.phone": prefix }];
      }
      const [items, total] = await Promise.all([
        OrderModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
        OrderModel.countDocuments(filter)
      ]);
      res.json(toPage(items.map((o) => toOrderDto(o, "admin", { includeCustomer: true })), total, query));
    });
    adminRouter.get("/orders/new-count", validate(newOrdersSchemas), async (req, res) => {
      const { query } = validated(req);
      const [pending, since] = await Promise.all([
        OrderModel.countDocuments({ status: { $in: ["pending_confirmation", "paid"] } }),
        query.since ? OrderModel.countDocuments({ createdAt: { $gt: query.since } }) : Promise.resolve(0)
      ]);
      res.json({ pending, newSince: since, serverTime: /* @__PURE__ */ new Date() });
    });
    adminRouter.get("/orders/:id", validate(orderIdSchemas), async (req, res) => {
      const { params } = validated(req);
      const order = await OrderModel.findById(params.id).lean();
      if (!order) throw AppError.notFound("Order");
      res.json({ order: toOrderDto(order, "admin", { includeCustomer: true }) });
    });
    adminRouter.post("/orders/:id/transition", validate(transitionSchemas), async (req, res) => {
      const { params, body: body2 } = validated(req);
      const order = await transitionOrder({
        orderId: params.id,
        to: body2.to,
        actor: "admin",
        byUserId: currentUserId(req),
        ...body2.note ? { note: body2.note } : {}
      });
      await recordAudit(req, { action: "order.transition", entity: "order", entityId: params.id, meta: { to: body2.to, note: body2.note } });
      res.json({ order: toOrderDto(order, "admin", { includeCustomer: true }) });
    });
    adjustSchemas = {
      body: z13.object({
        sku: skuSchema,
        delta: z13.number().int().refine((n) => n !== 0, "delta cannot be 0").refine((n) => Math.abs(n) <= 1e5),
        note: z13.string().trim().min(3, "A written reason is required").max(500)
      })
    };
    logsSchemas = { query: paginationQuery.extend({ sku: skuSchema.optional() }) };
    adminRouter.post("/inventory/adjust", validate(adjustSchemas), async (req, res) => {
      const { body: body2 } = validated(req);
      const result = await inventoryService.adjust({ ...body2, byUserId: currentUserId(req) });
      await recordAudit(req, { action: "inventory.adjust", entity: "sku", entityId: body2.sku, meta: { delta: body2.delta, note: body2.note } });
      res.json(result);
    });
    adminRouter.get("/inventory/logs", validate(logsSchemas), async (req, res) => {
      const { query } = validated(req);
      const filter = query.sku ? { sku: query.sku } : {};
      const [items, total] = await Promise.all([
        InventoryLogModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
        InventoryLogModel.countDocuments(filter)
      ]);
      res.json(toPage(items, total, query));
    });
    customerListSchemas = { query: paginationQuery.extend({ q: z13.string().trim().max(80).optional() }) };
    banSchemas = { params: idParams, body: z13.object({ status: z13.enum(["active", "banned"]) }) };
    adminRouter.get("/customers", validate(customerListSchemas), async (req, res) => {
      const { query } = validated(req);
      const filter = { role: "customer" };
      if (query.q) {
        const prefix = new RegExp(`^${escapeRegex(query.q)}`, "i");
        filter["$or"] = [{ email: prefix }, { name: prefix }];
      }
      const [users, total] = await Promise.all([
        UserModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
        UserModel.countDocuments(filter)
      ]);
      const stats = await OrderModel.aggregate([
        { $match: { userId: { $in: users.map((u) => u._id) }, status: { $nin: ["cancelled", "refunded", "pending_payment"] } } },
        { $group: { _id: "$userId", orders: { $sum: 1 }, spent: { $sum: "$total" } } }
      ]);
      const byUser = new Map(stats.map((s) => [String(s._id), s]));
      res.json(
        toPage(
          users.map((u) => ({
            id: String(u._id),
            name: u.name,
            email: u.email,
            status: u.status,
            emailVerified: u.emailVerified,
            createdAt: u.createdAt,
            orders: byUser.get(String(u._id))?.orders ?? 0,
            totalSpent: byUser.get(String(u._id))?.spent ?? 0
          })),
          total,
          query
        )
      );
    });
    adminRouter.get("/customers/:id", validate({ params: idParams }), async (req, res) => {
      const { params } = validated(req);
      const user = await UserModel.findOne({ _id: params.id, role: "customer" }).lean();
      if (!user) throw AppError.notFound("Customer");
      const orders = await OrderModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean();
      res.json({
        customer: { id: String(user._id), name: user.name, email: user.email, status: user.status, emailVerified: user.emailVerified, addresses: user.addresses, createdAt: user.createdAt },
        orders: orders.map((o) => toOrderDto(o, "admin"))
      });
    });
    adminRouter.patch("/customers/:id/status", validate(banSchemas), async (req, res) => {
      const { params, body: body2 } = validated(req);
      const user = await UserModel.findOneAndUpdate({ _id: params.id, role: "customer" }, { $set: { status: body2.status } }, { returnDocument: "after" });
      if (!user) throw AppError.notFound("Customer");
      if (body2.status === "banned") await SessionModel.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: /* @__PURE__ */ new Date() } });
      await recordAudit(req, { action: `customer.${body2.status === "banned" ? "ban" : "unban"}`, entity: "user", entityId: params.id });
      res.json({ id: params.id, status: user.status });
    });
    adminRouter.get("/audit-logs", validate({ query: paginationQuery }), async (req, res) => {
      const { query } = validated(req);
      const [items, total] = await Promise.all([
        AuditLogModel.find().sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).populate("actorId", "name email").lean(),
        AuditLogModel.countDocuments()
      ]);
      res.json(toPage(items, total, query));
    });
    importSchemas = { body: z13.object({ rows: z13.array(z13.record(z13.string(), z13.string())).min(1).max(500) }) };
    adminRouter.post("/products/import", validate(importSchemas), async (req, res) => {
      const { body: body2 } = validated(req);
      const results = await importProducts(body2.rows);
      await recordAudit(req, { action: "product.import", entity: "product", meta: { rows: body2.rows.length, created: results.filter((r) => r.ok).length } });
      res.json({ results });
    });
    adminRouter.post("/uploads/sign", (_req, res) => {
      const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
      if (!cloudName || !apiKey || !apiSecret) throw AppError.badRequest("Cloudinary is not configured");
      const timestamp = Math.round(Date.now() / 1e3);
      const folder = "products";
      const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, apiSecret);
      res.json({ cloudName, apiKey, timestamp, folder, signature });
    });
  }
});

// src/http/middleware/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
function rateLimit(rawOptions) {
  const options = { ...rawOptions, requests: rawOptions.requests * env.RATE_LIMIT_SCALE };
  const limiter = hasUpstash ? new UpstashRateLimiter(
    new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(options.requests, `${options.windowSeconds} s`),
      prefix: `rl:${options.name}`
    })
  ) : (() => {
    const memory = new MemoryRateLimiter(options.requests, options.windowSeconds * 1e3);
    memoryLimiters.push(memory);
    return memory;
  })();
  return async (req, res, next) => {
    const extra = options.keyBy?.(req);
    const key = `${options.name}:${req.ip ?? "unknown"}${extra ? `:${extra}` : ""}`;
    let result;
    try {
      result = await limiter.consume(key);
    } catch (error) {
      logger.error({ err: error, bucket: options.name }, "rate limiter unavailable \u2014 failing open");
      return next();
    }
    if (!result.success) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      throw AppError.tooManyRequests(result.retryAfterSeconds);
    }
    next();
  };
}
var MemoryRateLimiter, UpstashRateLimiter, redis, getRedis, hasUpstash, memoryLimiters;
var init_rate_limit = __esm({
  "src/http/middleware/rate-limit.ts"() {
    "use strict";
    init_env();
    init_errors();
    init_logger();
    MemoryRateLimiter = class {
      constructor(requests, windowMs) {
        this.requests = requests;
        this.windowMs = windowMs;
      }
      requests;
      windowMs;
      hits = /* @__PURE__ */ new Map();
      async consume(key) {
        const now = Date.now();
        const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
        if (recent.length >= this.requests) {
          this.hits.set(key, recent);
          const oldest = recent[0] ?? now;
          return { success: false, retryAfterSeconds: Math.ceil((oldest + this.windowMs - now) / 1e3) };
        }
        recent.push(now);
        this.hits.set(key, recent);
        return { success: true, retryAfterSeconds: 0 };
      }
      reset() {
        this.hits.clear();
      }
    };
    UpstashRateLimiter = class {
      constructor(limiter) {
        this.limiter = limiter;
      }
      limiter;
      async consume(key) {
        const { success, reset } = await this.limiter.limit(key);
        return { success, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1e3)) };
      }
    };
    redis = null;
    getRedis = () => redis ??= new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN
    });
    hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
    memoryLimiters = [];
  }
});

// src/modules/users/user.dto.ts
function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    locale: user.locale,
    createdAt: user.createdAt
  };
}
var init_user_dto = __esm({
  "src/modules/users/user.dto.ts"() {
    "use strict";
  }
});

// src/lib/crypto.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function hmacSha256(secret2, payload) {
  return createHmac("sha256", secret2).update(payload).digest("hex");
}
function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
var init_crypto = __esm({
  "src/lib/crypto.ts"() {
    "use strict";
  }
});

// src/modules/auth/auth.service.ts
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
async function issueSession(user, meta2, family = randomUUID()) {
  const refreshToken = randomToken(48);
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
  await SessionModel.create({
    userId: user._id,
    refreshTokenHash: sha256(refreshToken),
    family,
    expiresAt: refreshExpiresAt,
    ...meta2.userAgent ? { userAgent: meta2.userAgent.slice(0, 300) } : {},
    ...meta2.ip ? { ip: meta2.ip } : {}
  });
  const accessToken = await signAccessToken({ userId: user.id, role: user.role });
  return { accessToken, refreshToken, refreshExpiresAt, user: toPublicUser(user) };
}
async function issueAuthToken(userId, type, ttlMs) {
  const token = randomToken(32);
  await AuthTokenModel.create({ userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}
async function consumeAuthToken(token, type) {
  const consumed = await AuthTokenModel.findOneAndUpdate(
    { tokenHash: sha256(token), type, usedAt: { $exists: false }, expiresAt: { $gt: /* @__PURE__ */ new Date() } },
    { $set: { usedAt: /* @__PURE__ */ new Date() } }
  );
  if (!consumed) throw AppError.badRequest("This link is invalid or has expired");
  return consumed.userId;
}
function assertCanSignIn(user) {
  if (user.status === "banned") throw new AppError(403, "ACCOUNT_BANNED", "This account has been suspended");
}
var EMAIL_VERIFICATION_TTL_MS, PASSWORD_RESET_TTL_MS, DAY_MS, DUMMY_HASH, hashPassword, authService;
var init_auth_service = __esm({
  "src/modules/auth/auth.service.ts"() {
    "use strict";
    init_env();
    init_crypto();
    init_errors();
    init_logger();
    init_notification_service();
    init_user_dto();
    init_user_model();
    init_auth_models();
    init_tokens();
    EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1e3;
    PASSWORD_RESET_TTL_MS = 15 * 60 * 1e3;
    DAY_MS = 24 * 60 * 60 * 1e3;
    DUMMY_HASH = bcrypt.hashSync("not-a-real-password", env.BCRYPT_COST);
    hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_COST);
    authService = {
      async register(input, meta2) {
        if (await UserModel.exists({ email: input.email })) {
          throw AppError.conflict("An account with this e-mail already exists", "EMAIL_TAKEN");
        }
        let user;
        try {
          user = await UserModel.create({
            name: input.name,
            email: input.email,
            passwordHash: await hashPassword(input.password),
            locale: input.locale
          });
        } catch (error) {
          if (error.code === 11e3) {
            throw AppError.conflict("An account with this e-mail already exists", "EMAIL_TAKEN");
          }
          throw error;
        }
        const token = await issueAuthToken(user._id, "email_verification", EMAIL_VERIFICATION_TTL_MS);
        notifications.verifyEmail({ name: user.name, email: user.email, locale: user.locale }, token);
        return issueSession(user, meta2);
      },
      async login(input, meta2) {
        const user = await UserModel.findOne({ email: input.email }).select("+passwordHash");
        const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !user.passwordHash || !valid) throw AppError.invalidCredentials();
        assertCanSignIn(user);
        user.lastLoginAt = /* @__PURE__ */ new Date();
        await user.save();
        return issueSession(user, meta2);
      },
      async loginWithGoogle(input, meta2) {
        if (!env.GOOGLE_CLIENT_ID) throw AppError.badRequest("Google sign-in is not configured");
        const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
        let payload;
        try {
          const ticket = await client.verifyIdToken({ idToken: input.credential, audience: env.GOOGLE_CLIENT_ID });
          payload = ticket.getPayload();
        } catch {
          throw AppError.unauthenticated("Invalid Google credential");
        }
        if (!payload?.sub || !payload.email || !payload.email_verified) {
          throw AppError.unauthenticated("Google account e-mail is not verified");
        }
        const email = payload.email.toLowerCase();
        let user = await UserModel.findOne({ $or: [{ googleId: payload.sub }, { email }] });
        if (!user) {
          user = await UserModel.create({
            name: payload.name ?? email.split("@")[0] ?? "Customer",
            email,
            googleId: payload.sub,
            emailVerified: true,
            locale: input.locale
          });
        } else {
          user.googleId ??= payload.sub;
          user.emailVerified = true;
        }
        assertCanSignIn(user);
        user.lastLoginAt = /* @__PURE__ */ new Date();
        await user.save();
        return issueSession(user, meta2);
      },
      /**
       * Refresh-token ROTATION with REUSE DETECTION.
       *
       * Every refresh exchanges the presented token for a brand-new one (same `family`) and marks the old
       * one as rotated. If a rotated token is ever presented again, either the legitimate client or an
       * attacker holds a stale copy — we cannot tell which, so we revoke the whole family and force a
       * fresh login. The atomic "claim" below also turns concurrent double-refreshes into reuse events.
       */
      async refresh(rawToken, meta2) {
        if (!rawToken) throw AppError.unauthenticated("Missing refresh token");
        const session = await SessionModel.findOne({ refreshTokenHash: sha256(rawToken) });
        if (!session) throw AppError.unauthenticated("Invalid refresh token");
        const reuse = () => this.handleReuse(session.family, session.userId);
        if (session.rotatedAt) return reuse();
        if (session.revokedAt || session.expiresAt <= /* @__PURE__ */ new Date()) throw AppError.unauthenticated("Session expired");
        const claimed = await SessionModel.findOneAndUpdate(
          { _id: session._id, rotatedAt: { $exists: false }, revokedAt: { $exists: false } },
          { $set: { rotatedAt: /* @__PURE__ */ new Date() } }
        );
        if (!claimed) return reuse();
        const user = await UserModel.findById(session.userId);
        if (!user || user.status === "banned") {
          await SessionModel.updateMany({ family: session.family }, { $set: { revokedAt: /* @__PURE__ */ new Date() } });
          throw AppError.unauthenticated("Session no longer valid");
        }
        return issueSession(user, meta2, session.family);
      },
      async handleReuse(family, userId) {
        await SessionModel.updateMany({ family, revokedAt: { $exists: false } }, { $set: { revokedAt: /* @__PURE__ */ new Date() } });
        logger.warn({ family, userId: String(userId) }, "refresh token reuse detected \u2014 session family revoked");
        throw new AppError(401, "TOKEN_REUSE_DETECTED", "Refresh token reuse detected. Please sign in again.");
      },
      async logout(rawToken) {
        if (!rawToken) return;
        await SessionModel.updateOne(
          { refreshTokenHash: sha256(rawToken), revokedAt: { $exists: false } },
          { $set: { revokedAt: /* @__PURE__ */ new Date() } }
        );
      },
      async logoutAll(userId) {
        await SessionModel.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: /* @__PURE__ */ new Date() } });
      },
      async verifyEmail(token) {
        const userId = await consumeAuthToken(token, "email_verification");
        await UserModel.updateOne({ _id: userId }, { $set: { emailVerified: true } });
      },
      async resendVerification(userId) {
        const user = await UserModel.findById(userId);
        if (!user || user.emailVerified) return;
        const token = await issueAuthToken(user._id, "email_verification", EMAIL_VERIFICATION_TTL_MS);
        notifications.verifyEmail({ name: user.name, email: user.email, locale: user.locale }, token);
      },
      /** Always resolves silently so the endpoint can't be used to discover which e-mails are registered. */
      async forgotPassword(email) {
        const user = await UserModel.findOne({ email });
        if (!user || user.status === "banned") return;
        const token = await issueAuthToken(user._id, "password_reset", PASSWORD_RESET_TTL_MS);
        notifications.passwordReset({ name: user.name, email: user.email, locale: user.locale }, token);
      },
      async resetPassword(token, password) {
        const userId = await consumeAuthToken(token, "password_reset");
        await UserModel.updateOne({ _id: userId }, { $set: { passwordHash: await hashPassword(password) } });
        await SessionModel.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: /* @__PURE__ */ new Date() } });
      }
    };
  }
});

// src/modules/auth/auth.controller.ts
function setRefreshCookie(res, token, expires) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    expires
  });
}
function respondWithSession(res, result, status = 200) {
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.status(status).json({ accessToken: result.accessToken, user: result.user });
}
var REFRESH_COOKIE, REFRESH_COOKIE_PATH, meta, clearRefreshCookie, register, login, google, refresh, logout, logoutAll, verifyEmail, resendVerification, forgotPassword, resetPassword, me;
var init_auth_controller = __esm({
  "src/modules/auth/auth.controller.ts"() {
    "use strict";
    init_env();
    init_authenticate();
    init_validate();
    init_user_model();
    init_user_dto();
    init_errors();
    init_auth_service();
    REFRESH_COOKIE = "rt";
    REFRESH_COOKIE_PATH = "/api/auth";
    meta = (req) => ({
      ...req.get("user-agent") ? { userAgent: req.get("user-agent") } : {},
      ...req.ip ? { ip: req.ip } : {}
    });
    clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: isProduction, sameSite: "lax", path: REFRESH_COOKIE_PATH });
    register = async (req, res) => {
      const { body: body2 } = validated(req);
      respondWithSession(res, await authService.register(body2, meta(req)), 201);
    };
    login = async (req, res) => {
      const { body: body2 } = validated(req);
      respondWithSession(res, await authService.login(body2, meta(req)));
    };
    google = async (req, res) => {
      const { body: body2 } = validated(req);
      respondWithSession(res, await authService.loginWithGoogle(body2, meta(req)));
    };
    refresh = async (req, res) => {
      try {
        respondWithSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE], meta(req)));
      } catch (error) {
        if (error instanceof AppError && error.status === 401) clearRefreshCookie(res);
        throw error;
      }
    };
    logout = async (req, res) => {
      await authService.logout(req.cookies?.[REFRESH_COOKIE]);
      clearRefreshCookie(res);
      res.status(204).end();
    };
    logoutAll = async (req, res) => {
      await authService.logoutAll(currentUserId(req));
      clearRefreshCookie(res);
      res.status(204).end();
    };
    verifyEmail = async (req, res) => {
      const { body: body2 } = validated(req);
      await authService.verifyEmail(body2.token);
      res.status(204).end();
    };
    resendVerification = async (req, res) => {
      await authService.resendVerification(currentUserId(req));
      res.status(204).end();
    };
    forgotPassword = async (req, res) => {
      const { body: body2 } = validated(req);
      await authService.forgotPassword(body2.email);
      res.status(202).json({ message: "If an account exists for this e-mail, a reset link was sent." });
    };
    resetPassword = async (req, res) => {
      const { body: body2 } = validated(req);
      await authService.resetPassword(body2.token, body2.password);
      clearRefreshCookie(res);
      res.status(204).end();
    };
    me = async (req, res) => {
      const user = await UserModel.findById(currentUserId(req));
      if (!user) throw AppError.unauthenticated();
      res.json({ user: toPublicUser(user) });
    };
  }
});

// src/modules/auth/auth.routes.ts
import { Router as Router9 } from "express";
var authRouter, byEmail;
var init_auth_routes = __esm({
  "src/modules/auth/auth.routes.ts"() {
    "use strict";
    init_authenticate();
    init_rate_limit();
    init_validate();
    init_auth_controller();
    init_auth_schemas();
    authRouter = Router9();
    byEmail = (req) => typeof req.body?.email === "string" ? req.body.email.toLowerCase() : void 0;
    authRouter.post(
      "/register",
      rateLimit({ name: "auth:register", requests: 10, windowSeconds: 3600 }),
      validate(registerSchemas),
      register
    );
    authRouter.post(
      "/login",
      rateLimit({ name: "auth:login", requests: 10, windowSeconds: 15 * 60, keyBy: byEmail }),
      validate(loginSchemas),
      login
    );
    authRouter.post(
      "/google",
      rateLimit({ name: "auth:google", requests: 20, windowSeconds: 15 * 60 }),
      validate(googleSchemas),
      google
    );
    authRouter.post("/refresh", rateLimit({ name: "auth:refresh", requests: 60, windowSeconds: 60 }), refresh);
    authRouter.post("/logout", logout);
    authRouter.post("/logout-all", authenticate, logoutAll);
    authRouter.post("/verify-email", validate(verifyEmailSchemas), verifyEmail);
    authRouter.post(
      "/resend-verification",
      authenticate,
      rateLimit({ name: "auth:resend", requests: 5, windowSeconds: 3600 }),
      resendVerification
    );
    authRouter.post(
      "/forgot-password",
      rateLimit({ name: "auth:forgot", requests: 5, windowSeconds: 3600, keyBy: byEmail }),
      validate(forgotPasswordSchemas),
      forgotPassword
    );
    authRouter.post(
      "/reset-password",
      rateLimit({ name: "auth:reset", requests: 10, windowSeconds: 3600 }),
      validate(resetPasswordSchemas),
      resetPassword
    );
    authRouter.get("/me", authenticate, me);
  }
});

// src/modules/categories/option-labels.ts
function describeOptions(attributes, optionValues) {
  return Object.entries(optionValues).map(([key, value]) => {
    const definition = attributes.find((a) => a.key === key);
    const known = definition?.values.find((v) => v.value === value);
    return {
      key,
      label: definition?.label ?? { ar: key, en: key },
      value: known?.label ?? { ar: value, en: value }
    };
  });
}
async function loadAttributesByProduct(products) {
  const ids = [...new Set(products.flatMap((p) => p.categoryPath.map(String)))];
  const categories = await CategoryModel.find({ _id: { $in: ids } }).select("attributes level").lean();
  const byId = new Map(categories.map((c) => [String(c._id), c]));
  return new Map(
    products.map((product) => {
      const chain = product.categoryPath.flatMap((id) => {
        const category = byId.get(String(id));
        return category ? [category] : [];
      });
      return [String(product._id), mergeAttributes(chain)];
    })
  );
}
var init_option_labels = __esm({
  "src/modules/categories/option-labels.ts"() {
    "use strict";
    init_category_model();
    init_category_service();
  }
});

// src/modules/cart/cart.model.ts
import { model as model14, Schema as Schema14 } from "mongoose";
var cartSchema, CartModel;
var init_cart_model = __esm({
  "src/modules/cart/cart.model.ts"() {
    "use strict";
    cartSchema = new Schema14(
      {
        userId: { type: Schema14.Types.ObjectId, ref: "User", required: true, unique: true },
        items: {
          type: [
            new Schema14(
              {
                sku: { type: String, required: true },
                qty: { type: Number, required: true, min: 1, max: 99 },
                priceAtAdd: { type: Number, required: true, min: 0 }
              },
              { _id: false }
            )
          ],
          default: []
        }
      },
      { timestamps: { createdAt: false, updatedAt: true } }
    );
    CartModel = model14("Cart", cartSchema);
  }
});

// src/modules/cart/cart.service.ts
async function buildCartView(inputs) {
  const skus = inputs.map((i) => i.sku);
  const products = await ProductModel.find({ "variants.sku": { $in: skus }, status: "published" }).select("title slug images variants categoryPath").lean();
  const attributesByProduct = await loadAttributesByProduct(products);
  const bySku = /* @__PURE__ */ new Map();
  for (const product of products) for (const variant of product.variants) bySku.set(variant.sku, { product, variant });
  const items = inputs.map((input) => {
    const found = bySku.get(input.sku);
    if (!found) {
      return { sku: input.sku, qty: input.qty, available: false, unitPrice: 0, stock: 0, lineTotal: 0, warnings: ["UNAVAILABLE"] };
    }
    const { product, variant } = found;
    const warnings = [];
    if (variant.stock === 0) warnings.push("OUT_OF_STOCK");
    else if (input.qty > variant.stock) warnings.push("INSUFFICIENT_STOCK");
    const priceChanged = input.priceAtAdd !== void 0 && input.priceAtAdd !== variant.price;
    if (priceChanged) warnings.push("PRICE_CHANGED");
    return {
      sku: variant.sku,
      qty: input.qty,
      available: true,
      productId: String(product._id),
      slug: product.slug,
      title: product.title,
      ...product.images[0] ? { image: product.images[0].url } : {},
      optionValues: variant.optionValues,
      options: describeOptions(attributesByProduct.get(String(product._id)) ?? [], variant.optionValues),
      unitPrice: variant.price,
      ...variant.compareAtPrice ? { compareAtPrice: variant.compareAtPrice } : {},
      stock: variant.stock,
      ...priceChanged ? { previousPrice: input.priceAtAdd } : {},
      lineTotal: variant.price * input.qty,
      warnings
    };
  });
  const purchasable = items.filter((i) => i.available);
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    subtotal: purchasable.reduce((sum, i) => sum + i.lineTotal, 0),
    hasBlockingIssues: items.some((i) => i.warnings.some((w) => w !== "PRICE_CHANGED"))
  };
}
async function variantInfo(sku) {
  const product = await ProductModel.findOne({ "variants.sku": sku, status: "published" }).select("variants").lean();
  const variant = product?.variants.find((v) => v.sku === sku);
  if (!variant) throw AppError.unprocessable("PRODUCT_UNAVAILABLE", "This product is no longer available", { sku });
  return { price: variant.price, stock: variant.stock };
}
async function getOrCreateCart(userId) {
  return CartModel.findOneAndUpdate(
    { userId: toObjectId(userId) },
    { $setOnInsert: { userId: toObjectId(userId), items: [] } },
    { upsert: true, returnDocument: "after" }
  );
}
var MAX_QTY_PER_LINE, cartService;
var init_cart_service = __esm({
  "src/modules/cart/cart.service.ts"() {
    "use strict";
    init_errors();
    init_object_id();
    init_option_labels();
    init_product_model();
    init_cart_model();
    MAX_QTY_PER_LINE = 99;
    cartService = {
      async get(userId) {
        const cart = await CartModel.findOne({ userId }).lean();
        return buildCartView(cart?.items ?? []);
      },
      preview: (items) => buildCartView(items),
      /** Adds `qty` units (or sets the exact quantity when `mode` is "set"). Never exceeds live stock. */
      async setItem(userId, sku, qty, mode) {
        const { price, stock } = await variantInfo(sku);
        const cart = await getOrCreateCart(userId);
        const existing = cart.items.find((i) => i.sku === sku);
        const target = mode === "add" ? (existing?.qty ?? 0) + qty : qty;
        if (target > MAX_QTY_PER_LINE) throw AppError.badRequest(`Maximum ${MAX_QTY_PER_LINE} units per item`);
        if (target > stock) {
          throw AppError.conflict(`Only ${stock} unit(s) available`, "INSUFFICIENT_STOCK", { sku, available: stock });
        }
        if (target <= 0) {
          cart.set("items", cart.items.filter((i) => i.sku !== sku));
        } else if (existing) {
          existing.qty = target;
          existing.priceAtAdd = price;
        } else {
          cart.items.push({ sku, qty: target, priceAtAdd: price });
        }
        await cart.save();
        return buildCartView(cart.items);
      },
      async removeItem(userId, sku) {
        const cart = await CartModel.findOneAndUpdate({ userId }, { $pull: { items: { sku } } }, { returnDocument: "after" });
        return buildCartView(cart?.items ?? []);
      },
      async clear(userId, session) {
        await CartModel.updateOne({ userId }, { $set: { items: [] } }, session ? { session } : {});
      },
      /** Marks current prices as accepted so the "price changed" notice disappears. */
      async acknowledgePrices(userId) {
        const cart = await CartModel.findOne({ userId });
        if (!cart) return buildCartView([]);
        const view = await buildCartView(cart.items);
        for (const line of view.items) {
          const item = cart.items.find((i) => i.sku === line.sku);
          if (item && line.available) item.priceAtAdd = line.unitPrice;
        }
        await cart.save();
        return buildCartView(cart.items);
      },
      /**
       * Merges a guest cart (kept in the browser) into the account cart right after sign-in.
       * Quantities add up and are silently clamped to available stock — the returned view carries warnings.
       */
      async merge(userId, guestItems) {
        const cart = await getOrCreateCart(userId);
        const info = /* @__PURE__ */ new Map();
        for (const guest of guestItems) {
          if (!info.has(guest.sku)) info.set(guest.sku, await variantInfo(guest.sku).catch(() => null));
          const variant = info.get(guest.sku);
          if (!variant) continue;
          const existing = cart.items.find((i) => i.sku === guest.sku);
          const wanted = Math.min((existing?.qty ?? 0) + guest.qty, MAX_QTY_PER_LINE);
          const qty = Math.min(wanted, variant.stock);
          if (qty <= 0) continue;
          if (existing) existing.qty = qty;
          else cart.items.push({ sku: guest.sku, qty, priceAtAdd: variant.price });
        }
        await cart.save();
        return buildCartView(cart.items);
      }
    };
  }
});

// src/modules/cart/cart.routes.ts
import { Router as Router10 } from "express";
import { z as z14 } from "zod";
var guestItem, addSchemas, setSchemas, skuParams, listSchemas2, cartRouter;
var init_cart_routes = __esm({
  "src/modules/cart/cart.routes.ts"() {
    "use strict";
    init_authenticate();
    init_validate();
    init_product_schemas();
    init_cart_service();
    guestItem = z14.object({ sku: skuSchema, qty: z14.number().int().min(1).max(99) });
    addSchemas = { body: guestItem };
    setSchemas = { params: z14.object({ sku: skuSchema }), body: z14.object({ qty: z14.number().int().min(0).max(99) }) };
    skuParams = { params: z14.object({ sku: skuSchema }) };
    listSchemas2 = { body: z14.object({ items: z14.array(guestItem).max(50) }) };
    cartRouter = Router10();
    cartRouter.post("/preview", validate(listSchemas2), async (req, res) => {
      const { body: body2 } = validated(req);
      res.json({ cart: await cartService.preview(body2.items) });
    });
    cartRouter.use(authenticate);
    cartRouter.get("/", async (req, res) => {
      res.json({ cart: await cartService.get(currentUserId(req)) });
    });
    cartRouter.post("/items", validate(addSchemas), async (req, res) => {
      const { body: body2 } = validated(req);
      res.status(201).json({ cart: await cartService.setItem(currentUserId(req), body2.sku, body2.qty, "add") });
    });
    cartRouter.patch("/items/:sku", validate(setSchemas), async (req, res) => {
      const { params, body: body2 } = validated(req);
      res.json({ cart: await cartService.setItem(currentUserId(req), params.sku, body2.qty, "set") });
    });
    cartRouter.delete("/items/:sku", validate(skuParams), async (req, res) => {
      const { params } = validated(req);
      res.json({ cart: await cartService.removeItem(currentUserId(req), params.sku) });
    });
    cartRouter.delete("/", async (req, res) => {
      await cartService.clear(currentUserId(req));
      res.status(204).end();
    });
    cartRouter.post("/merge", validate(listSchemas2), async (req, res) => {
      const { body: body2 } = validated(req);
      res.json({ cart: await cartService.merge(currentUserId(req), body2.items) });
    });
    cartRouter.post("/acknowledge-prices", async (req, res) => {
      res.json({ cart: await cartService.acknowledgePrices(currentUserId(req)) });
    });
  }
});

// src/modules/payments/providers/cod.provider.ts
var CodProvider;
var init_cod_provider = __esm({
  "src/modules/payments/providers/cod.provider.ts"() {
    "use strict";
    init_errors();
    CodProvider = class {
      name = "cod";
      method = "cod";
      enabled = true;
      initialOrderStatus = "pending_confirmation";
      async createPayment() {
        return null;
      }
      verifyWebhook() {
        throw new AppError(400, "BAD_REQUEST", "Cash on delivery has no webhooks");
      }
      async getStatus() {
        return "pending";
      }
      async refund() {
        return { refundId: "manual" };
      }
    };
  }
});

// src/modules/payments/providers/coming-soon.provider.ts
var ComingSoonProvider;
var init_coming_soon_provider = __esm({
  "src/modules/payments/providers/coming-soon.provider.ts"() {
    "use strict";
    init_errors();
    ComingSoonProvider = class {
      constructor(name, method) {
        this.name = name;
        this.method = method;
      }
      name;
      method;
      enabled = false;
      initialOrderStatus = "pending_payment";
      unavailable() {
        throw AppError.unprocessable("PAYMENT_METHOD_UNAVAILABLE", `${this.name} payments are coming soon`);
      }
      createPayment() {
        return this.unavailable();
      }
      verifyWebhook() {
        return this.unavailable();
      }
      getStatus() {
        return this.unavailable();
      }
      refund() {
        return this.unavailable();
      }
    };
  }
});

// src/modules/payments/providers/mock.provider.ts
var MOCK_SIGNATURE_HEADER, MockProvider;
var init_mock_provider = __esm({
  "src/modules/payments/providers/mock.provider.ts"() {
    "use strict";
    init_env();
    init_crypto();
    init_errors();
    MOCK_SIGNATURE_HEADER = "x-mock-signature";
    MockProvider = class {
      constructor(method, secret2 = env.PAYMENTS_MOCK_SECRET ?? "mock-webhook-secret") {
        this.method = method;
        this.secret = secret2;
      }
      method;
      secret;
      name = "mock";
      enabled = true;
      initialOrderStatus = "pending_payment";
      async createPayment(order) {
        return {
          providerTxnId: `mock_${order.orderNumber}`,
          clientSecret: `mock_secret_${order.id}`,
          expiresAt: new Date(Date.now() + 30 * 60 * 1e3)
        };
      }
      verifyWebhook(headers, rawBody) {
        const received = headers[MOCK_SIGNATURE_HEADER];
        const signature = Array.isArray(received) ? received[0] : received;
        if (!signature || !safeEqual(signature, hmacSha256(this.secret, rawBody.toString("utf8")))) {
          throw new AppError(401, "INVALID_SIGNATURE", "Invalid webhook signature");
        }
        const payload = JSON.parse(rawBody.toString("utf8"));
        if (!payload.type || !payload.id || !payload.orderNumber || typeof payload.amount !== "number") {
          throw AppError.badRequest("Malformed webhook payload");
        }
        return {
          type: payload.type,
          providerTxnId: payload.id,
          orderNumber: payload.orderNumber,
          amount: payload.amount,
          currency: payload.currency ?? "EGP",
          raw: payload
        };
      }
      async getStatus() {
        return "pending";
      }
      async refund(providerTxnId) {
        return { refundId: `mock_refund_${providerTxnId}` };
      }
      /** Test helper: sign a payload exactly like the "gateway" would. */
      sign(rawBody) {
        return hmacSha256(this.secret, rawBody);
      }
    };
  }
});

// src/modules/payments/payment.registry.ts
function buildProviders() {
  const cod = new CodProvider();
  if (env.PAYMENTS_MOCK_ENABLED) {
    return [cod, new MockProvider("card"), new MockProvider("wallet"), new MockProvider("fawry")];
  }
  return [
    cod,
    new ComingSoonProvider("paymob", "card"),
    new ComingSoonProvider("paymob", "wallet"),
    new ComingSoonProvider("fawry", "fawry")
  ];
}
var providers, byMethod, paymentRegistry;
var init_payment_registry = __esm({
  "src/modules/payments/payment.registry.ts"() {
    "use strict";
    init_constants();
    init_env();
    init_errors();
    init_cod_provider();
    init_coming_soon_provider();
    init_mock_provider();
    providers = buildProviders();
    byMethod = new Map(providers.map((p) => [p.method, p]));
    paymentRegistry = {
      /** Provider for a checkout method; rejects methods that are not live yet ("coming soon"). */
      forMethod(method) {
        const provider = byMethod.get(method);
        if (!provider?.enabled) {
          throw AppError.unprocessable("PAYMENT_METHOD_UNAVAILABLE", `Payment method "${method}" is not available yet`);
        }
        return provider;
      },
      /** Provider that owns a webhook URL segment, e.g. `/payments/webhooks/mock`. */
      forWebhook(name) {
        const provider = providers.find((p) => p.name === name && p.enabled && p.name !== "cod");
        if (!provider) throw AppError.notFound("Payment provider");
        return provider;
      },
      /** What the checkout UI lists: live methods plus disabled "coming soon" ones. */
      describe() {
        return PAYMENT_METHODS.map((method) => {
          const provider = byMethod.get(method);
          return { method, provider: provider.name, enabled: provider.enabled, comingSoon: !provider.enabled };
        });
      }
    };
  }
});

// src/lib/money.ts
function assertPiasters(value, label = "amount") {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of piasters, got ${value}`);
  }
  return value;
}
function percentOf(amount, percent) {
  return Math.round(amount * percent / 100);
}
var init_money = __esm({
  "src/lib/money.ts"() {
    "use strict";
  }
});

// src/modules/coupons/coupon-rules.ts
function reject(reason, extra) {
  throw AppError.unprocessable("COUPON_INVALID", `Coupon rejected: ${reason}`, { reason, ...extra });
}
function evaluateCoupon(coupon, subtotal, now = /* @__PURE__ */ new Date()) {
  if (!coupon.isActive) reject("inactive");
  if (coupon.startsAt && coupon.startsAt > now) reject("not_started");
  if (coupon.expiresAt && coupon.expiresAt <= now) reject("expired");
  if (coupon.maxUses !== void 0 && coupon.usedCount >= coupon.maxUses) reject("exhausted");
  if (subtotal < coupon.minOrder) reject("min_order", { minOrder: coupon.minOrder });
  const raw = coupon.type === "percent" ? percentOf(subtotal, coupon.value) : coupon.value;
  const capped = coupon.maxDiscount !== void 0 ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.min(capped, subtotal);
}
var init_coupon_rules = __esm({
  "src/modules/coupons/coupon-rules.ts"() {
    "use strict";
    init_errors();
    init_money();
  }
});

// src/modules/orders/pricing.ts
function calculateTotals(input) {
  const subtotal = input.lines.reduce((sum, line) => {
    assertPiasters(line.unitPrice, "unitPrice");
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new RangeError(`Invalid quantity ${line.qty}`);
    return sum + line.unitPrice * line.qty;
  }, 0);
  const shippingFee = assertPiasters(input.shippingFee, "shippingFee");
  const discount = Math.min(assertPiasters(input.discount ?? 0, "discount"), subtotal);
  return { subtotal, shippingFee, discount, total: subtotal - discount + shippingFee };
}
var init_pricing = __esm({
  "src/modules/orders/pricing.ts"() {
    "use strict";
    init_money();
  }
});

// src/modules/orders/checkout.service.ts
async function requireShippingZone(governorate) {
  const zone = await ShippingZoneModel.findOne({ governorate, isActive: true }).lean();
  if (!zone) {
    throw AppError.unprocessable("SHIPPING_UNAVAILABLE", "We do not deliver to this governorate yet", { governorate });
  }
  return zone;
}
function formatOrderNumber(sequence) {
  return `ORD-${String(1e5 + sequence)}`;
}
async function quoteCheckout(userId, input) {
  const cart = await CartModel.findOne({ userId }).lean();
  const view = await buildCartView(cart?.items ?? []);
  let governorate = input.governorate;
  if (input.addressId) {
    const user = await UserModel.findById(userId).select("addresses").lean();
    const address = user?.addresses.find((a) => String(a._id) === input.addressId);
    if (!address) throw AppError.notFound("Address");
    governorate = address.governorate;
  }
  const zone = governorate ? await requireShippingZone(governorate) : null;
  let discount = 0;
  let coupon = null;
  if (input.couponCode) {
    const doc = await CouponModel.findOne({ code: input.couponCode.toUpperCase() }).lean();
    try {
      if (!doc) throw AppError.unprocessable("COUPON_INVALID", "Coupon not found", { reason: "not_found" });
      discount = evaluateCoupon(doc, view.subtotal);
      coupon = { code: doc.code };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      coupon = { code: input.couponCode.toUpperCase(), error: error.details };
    }
  }
  const totals = calculateTotals({
    lines: view.items.filter((i) => i.available).map((i) => ({ unitPrice: i.unitPrice, qty: i.qty })),
    shippingFee: zone?.fee ?? 0,
    discount
  });
  return {
    cart: view,
    ...totals,
    shippingEstimate: zone?.estimatedDays ?? null,
    shippingKnown: Boolean(zone),
    coupon,
    codMaxAmount: env.COD_MAX_AMOUNT,
    codAvailable: totals.total <= env.COD_MAX_AMOUNT
  };
}
var init_checkout_service = __esm({
  "src/modules/orders/checkout.service.ts"() {
    "use strict";
    init_env();
    init_errors();
    init_cart_service();
    init_cart_model();
    init_coupon_model();
    init_coupon_rules();
    init_shipping_zone_model();
    init_user_model();
    init_pricing();
  }
});

// src/modules/payments/payment.initiate.ts
async function initiatePayment(order, provider) {
  try {
    const result = await provider.createPayment({
      id: order.id,
      orderNumber: order.orderNumber,
      amount: order.total,
      currency: "EGP",
      customer: { name: order.customerName, email: order.customerEmail }
    });
    if (!result) return null;
    await PaymentModel.create({
      orderId: order.id,
      provider: provider.name,
      providerTxnId: result.providerTxnId,
      amount: order.total,
      currency: "EGP"
    });
    return result;
  } catch (error) {
    logger.error({ err: error, orderNumber: order.orderNumber, provider: provider.name }, "payment initiation failed");
    return null;
  }
}
var init_payment_initiate = __esm({
  "src/modules/payments/payment.initiate.ts"() {
    "use strict";
    init_logger();
    init_payment_models();
  }
});

// src/modules/orders/counter.model.ts
import { model as model15, Schema as Schema15 } from "mongoose";
async function nextSequence(name) {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  return doc.seq;
}
var counterSchema, CounterModel;
var init_counter_model = __esm({
  "src/modules/orders/counter.model.ts"() {
    "use strict";
    counterSchema = new Schema15({ _id: String, seq: { type: Number, default: 0 } });
    CounterModel = model15("Counter", counterSchema);
  }
});

// src/modules/orders/order.service.ts
import mongoose5, { Types as Types4 } from "mongoose";
async function createOrder(userId, input) {
  const replay = async () => {
    const existing = await OrderModel.findOne({ userId, idempotencyKey: input.idempotencyKey });
    return existing ? { order: existing, created: false, payment: null } : null;
  };
  const previous = await replay();
  if (previous) return previous;
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.unauthenticated();
  if (user.status === "banned") throw new AppError(403, "ACCOUNT_BANNED", "This account has been suspended");
  if (env.REQUIRE_VERIFIED_EMAIL_FOR_ORDERS && !user.emailVerified) {
    throw new AppError(403, "EMAIL_UNVERIFIED_FOR_ORDER", "Please verify your e-mail before placing an order");
  }
  const address = user.addresses.find((a) => String(a._id) === input.addressId);
  if (!address) throw AppError.notFound("Address");
  const provider = paymentRegistry.forMethod(input.paymentMethod);
  const cart = await CartModel.findOne({ userId }).lean();
  if (!cart || cart.items.length === 0) throw AppError.unprocessable("EMPTY_CART", "Your cart is empty");
  const zone = await requireShippingZone(address.governorate);
  const orderNumber = formatOrderNumber(await nextSequence("order"));
  const orderId = new Types4.ObjectId();
  let order;
  try {
    order = await mongoose5.connection.transaction(async (session) => {
      const skus = cart.items.map((i) => i.sku);
      const products = await ProductModel.find({ "variants.sku": { $in: skus }, status: "published" }).session(session);
      const variantBySku = new Map(
        products.flatMap((p) => p.variants.map((v) => [v.sku, { product: p, variant: v }]))
      );
      const attributesByProduct = await loadAttributesByProduct(products);
      const items = cart.items.map((cartItem) => {
        const found = variantBySku.get(cartItem.sku);
        if (!found) {
          throw AppError.unprocessable("PRODUCT_UNAVAILABLE", "A product in your cart is no longer available", { sku: cartItem.sku });
        }
        const { product, variant } = found;
        return {
          productId: product._id,
          sku: variant.sku,
          title: product.title,
          ...product.images[0] ? { image: product.images[0].url } : {},
          optionValues: variant.optionValues,
          options: describeOptions(attributesByProduct.get(String(product._id)) ?? [], variant.optionValues),
          unitPrice: variant.price,
          qty: cartItem.qty,
          lineTotal: variant.price * cartItem.qty
        };
      });
      await inventoryService.reserve(
        items.map((i) => ({ sku: i.sku, qty: i.qty, productId: i.productId })),
        { session, reason: "order_placed", orderId, byUserId: userId }
      );
      const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
      let discount = 0;
      let couponCode;
      if (input.couponCode) {
        const coupon = await CouponModel.findOne({ code: input.couponCode.toUpperCase() }).session(session);
        if (!coupon) throw AppError.unprocessable("COUPON_INVALID", "Coupon not found", { reason: "not_found" });
        discount = evaluateCoupon(coupon, subtotal);
        const claimed = await CouponModel.updateOne(
          { _id: coupon._id, $or: [{ maxUses: { $exists: false } }, { $expr: { $lt: ["$usedCount", "$maxUses"] } }] },
          { $inc: { usedCount: 1 } },
          { session }
        );
        if (claimed.modifiedCount !== 1) throw AppError.unprocessable("COUPON_INVALID", "Coupon exhausted", { reason: "exhausted" });
        couponCode = coupon.code;
      }
      const totals = calculateTotals({
        lines: items.map((i) => ({ unitPrice: i.unitPrice, qty: i.qty })),
        shippingFee: zone.fee,
        discount
      });
      if (input.expectedTotal !== void 0 && input.expectedTotal !== totals.total) {
        throw AppError.conflict("Prices changed since you last viewed your cart", "PRICE_CHANGED", {
          expected: input.expectedTotal,
          actual: totals.total
        });
      }
      if (provider.method === "cod" && totals.total > env.COD_MAX_AMOUNT) {
        throw AppError.unprocessable("COD_LIMIT_EXCEEDED", "Order value exceeds the cash-on-delivery limit", {
          max: env.COD_MAX_AMOUNT
        });
      }
      const [created] = await OrderModel.create(
        [
          {
            _id: orderId,
            orderNumber,
            userId: user._id,
            customerName: user.name,
            customerEmail: user.email,
            items,
            shippingAddress: {
              fullName: address.fullName,
              phone: address.phone,
              governorate: address.governorate,
              city: address.city,
              street: address.street,
              ...address.notes ? { notes: address.notes } : {}
            },
            ...totals,
            ...couponCode ? { couponCode } : {},
            paymentMethod: provider.method,
            paymentStatus: "unpaid",
            status: provider.initialOrderStatus,
            statusHistory: [{ status: provider.initialOrderStatus, at: /* @__PURE__ */ new Date(), actor: "customer", byUserId: user._id }],
            ...input.note ? { customerNote: input.note } : {},
            idempotencyKey: input.idempotencyKey
          }
        ],
        { session }
      );
      await CartModel.updateOne({ userId: user._id }, { $set: { items: [] } }, { session });
      return created;
    });
  } catch (error) {
    if (isIdempotencyConflict(error)) {
      const winner = await replay();
      if (winner) return winner;
    }
    throw error;
  }
  if (provider.initialOrderStatus === "pending_confirmation") {
    notifications.order("placed", { name: user.name, email: user.email, locale: user.locale }, order);
  }
  const payment = provider.initialOrderStatus === "pending_payment" ? await initiatePayment(
    { id: order.id, orderNumber: order.orderNumber, total: order.total, customerName: order.customerName, customerEmail: order.customerEmail },
    provider
  ) : null;
  return { order, created: true, payment };
}
var isIdempotencyConflict;
var init_order_service = __esm({
  "src/modules/orders/order.service.ts"() {
    "use strict";
    init_env();
    init_errors();
    init_cart_model();
    init_option_labels();
    init_coupon_model();
    init_coupon_rules();
    init_inventory_service();
    init_notification_service();
    init_payment_initiate();
    init_payment_registry();
    init_product_model();
    init_user_model();
    init_checkout_service();
    init_counter_model();
    init_order_model();
    init_pricing();
    isIdempotencyConflict = (error) => error?.code === 11e3 && JSON.stringify(error.keyPattern ?? {}).includes("idempotencyKey");
  }
});

// src/modules/orders/order.routes.ts
import { Router as Router11 } from "express";
import { z as z15 } from "zod";
var createSchemas4, idempotencyKeySchema, quoteSchemas, listSchemas3, numberParams, cancelSchemas, checkoutRouter, orderRouter;
var init_order_routes = __esm({
  "src/modules/orders/order.routes.ts"() {
    "use strict";
    init_constants();
    init_authenticate();
    init_rate_limit();
    init_validate();
    init_errors();
    init_object_id();
    init_schemas();
    init_payment_registry();
    init_checkout_service();
    init_order_dto();
    init_order_model();
    init_order_service();
    init_order_transitions();
    createSchemas4 = {
      body: z15.object({
        addressId: objectIdSchema,
        paymentMethod: z15.enum(PAYMENT_METHODS),
        couponCode: z15.string().trim().toUpperCase().max(30).optional(),
        note: z15.string().trim().max(500).optional(),
        expectedTotal: z15.number().int().nonnegative().optional()
      })
    };
    idempotencyKeySchema = z15.string().trim().min(8).max(100);
    quoteSchemas = {
      body: z15.object({
        addressId: objectIdSchema.optional(),
        governorate: z15.string().max(40).optional(),
        couponCode: z15.string().trim().toUpperCase().max(30).optional()
      })
    };
    listSchemas3 = { query: paginationQuery };
    numberParams = { params: z15.object({ orderNumber: z15.string().regex(/^ORD-\d{6,}$/) }) };
    cancelSchemas = { ...numberParams, body: z15.object({ reason: z15.string().trim().max(500).optional() }) };
    checkoutRouter = Router11();
    checkoutRouter.get("/payment-methods", (_req, res) => {
      res.json({ items: paymentRegistry.describe() });
    });
    checkoutRouter.post("/quote", authenticate, validate(quoteSchemas), async (req, res) => {
      const { body: body2 } = validated(req);
      res.json(await quoteCheckout(currentUserId(req), body2));
    });
    orderRouter = Router11();
    orderRouter.use(authenticate);
    orderRouter.post(
      "/",
      rateLimit({ name: "orders:create", requests: 20, windowSeconds: 600 }),
      validate(createSchemas4),
      async (req, res) => {
        const { body: body2 } = validated(req);
        const key = idempotencyKeySchema.safeParse(req.get("idempotency-key"));
        if (!key.success) throw AppError.badRequest('An "Idempotency-Key" header (8\u2013100 chars) is required');
        const result = await createOrder(currentUserId(req), { ...body2, idempotencyKey: key.data });
        res.status(result.created ? 201 : 200).json({
          order: toOrderDto(result.order, "customer"),
          payment: result.payment,
          replayed: !result.created
        });
      }
    );
    orderRouter.get("/", validate(listSchemas3), async (req, res) => {
      const { query } = validated(req);
      const filter = { userId: currentUserId(req) };
      const [items, total] = await Promise.all([
        OrderModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
        OrderModel.countDocuments(filter)
      ]);
      res.json(toPage(items.map((o) => toOrderDto(o, "customer")), total, query));
    });
    orderRouter.get("/:orderNumber", validate(numberParams), async (req, res) => {
      const { params } = validated(req);
      const order = await OrderModel.findOne({ orderNumber: params.orderNumber, userId: currentUserId(req) }).lean();
      if (!order) throw AppError.notFound("Order");
      res.json({ order: toOrderDto(order, "customer") });
    });
    orderRouter.post("/:orderNumber/cancel", validate(cancelSchemas), async (req, res) => {
      const { params, body: body2 } = validated(req);
      const userId = currentUserId(req);
      const order = await OrderModel.findOne({ orderNumber: params.orderNumber, userId }).select("_id");
      if (!order) throw AppError.notFound("Order");
      const updated = await transitionOrder({
        orderId: order.id,
        to: "cancelled",
        actor: "customer",
        byUserId: userId,
        ownerId: userId,
        ...body2.reason ? { note: body2.reason } : {}
      });
      res.json({ order: toOrderDto(updated, "customer") });
    });
  }
});

// src/modules/payments/payment.webhook.ts
async function handleWebhook(provider, headers, rawBody) {
  const rawPayload = rawBody.toString("utf8");
  let event;
  try {
    event = provider.verifyWebhook(headers, rawBody);
  } catch (error) {
    await PaymentEventModel.create({ provider: provider.name, rawPayload, signatureValid: false, outcome: "invalid_signature" });
    throw error;
  }
  const record = (outcome) => PaymentEventModel.create({
    provider: provider.name,
    type: event.type,
    providerTxnId: event.providerTxnId,
    rawPayload,
    signatureValid: true,
    outcome
  });
  const payment = await PaymentModel.findOne({ provider: provider.name, providerTxnId: event.providerTxnId });
  if (!payment) {
    await record("unknown_payment");
    return { outcome: "unknown_payment" };
  }
  if (event.type !== "payment.succeeded") {
    if (event.type === "payment.failed") await PaymentModel.updateOne({ _id: payment._id, status: "pending" }, { $set: { status: "failed" } });
    await record("ignored");
    return { outcome: "ignored" };
  }
  const order = await OrderModel.findById(payment.orderId);
  if (!order || order.orderNumber !== event.orderNumber || order.total !== event.amount || event.currency !== payment.currency) {
    logger.warn({ txn: event.providerTxnId, event }, "webhook amount/currency/order mismatch \u2014 not marking paid");
    await record("amount_mismatch");
    return { outcome: "amount_mismatch" };
  }
  const claimed = await PaymentModel.findOneAndUpdate({ _id: payment._id, status: "pending" }, { $set: { status: "paid" } });
  if (!claimed) {
    await record("duplicate");
    return { outcome: "duplicate" };
  }
  try {
    await transitionOrder({ orderId: order.id, to: "paid", actor: "system", note: `Paid via ${provider.name}` });
  } catch (error) {
    if (error instanceof AppError && error.code === "INVALID_TRANSITION") {
      logger.error({ orderNumber: order.orderNumber, status: order.status }, "payment received for an order that is not payable");
      await record("order_not_payable");
      return { outcome: "order_not_payable" };
    }
    throw error;
  }
  await record("processed");
  return { outcome: "processed" };
}
var init_payment_webhook = __esm({
  "src/modules/payments/payment.webhook.ts"() {
    "use strict";
    init_logger();
    init_errors();
    init_order_model();
    init_order_transitions();
    init_payment_models();
  }
});

// src/modules/payments/payment.routes.ts
import { Router as Router12 } from "express";
var paymentRouter;
var init_payment_routes = __esm({
  "src/modules/payments/payment.routes.ts"() {
    "use strict";
    init_errors();
    init_payment_webhook();
    init_payment_registry();
    paymentRouter = Router12();
    paymentRouter.post("/webhooks/:provider", async (req, res) => {
      const provider = paymentRegistry.forWebhook(String(req.params["provider"]));
      if (!req.rawBody) throw AppError.badRequest("Missing request body");
      const result = await handleWebhook(provider, req.headers, req.rawBody);
      res.status(200).json({ received: true, outcome: result.outcome });
    });
  }
});

// src/modules/reviews/review.routes.ts
import { Router as Router13 } from "express";
import { z as z16 } from "zod";
async function recomputeRating(productId) {
  const [stats] = await ReviewModel.aggregate([
    { $match: { productId: toObjectId(productId) } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } }
  ]);
  await ProductModel.updateOne(
    { _id: productId },
    { $set: { ratingAvg: stats ? Math.round(stats.avg * 10) / 10 : 0, ratingCount: stats?.count ?? 0 } }
  );
}
var listSchemas4, createSchemas5, eligibilitySchemas, hasDeliveredPurchase, publicName, reviewRouter;
var init_review_routes = __esm({
  "src/modules/reviews/review.routes.ts"() {
    "use strict";
    init_authenticate();
    init_validate();
    init_errors();
    init_object_id();
    init_schemas();
    init_order_model();
    init_product_model();
    init_user_model();
    init_review_model();
    listSchemas4 = { query: paginationQuery.extend({ productId: objectIdSchema }) };
    createSchemas5 = {
      body: z16.object({
        productId: objectIdSchema,
        rating: z16.number().int().min(1).max(5),
        title: z16.string().trim().max(120).optional(),
        comment: z16.string().trim().min(3).max(2e3)
      })
    };
    eligibilitySchemas = { params: z16.object({ productId: objectIdSchema }) };
    hasDeliveredPurchase = (userId, productId) => OrderModel.exists({ userId, status: "delivered", "items.productId": toObjectId(productId) });
    publicName = (name) => {
      const [first = "", last] = name.trim().split(/\s+/);
      return last ? `${first} ${last[0]}.` : first;
    };
    reviewRouter = Router13();
    reviewRouter.get("/", validate(listSchemas4), async (req, res) => {
      const { query } = validated(req);
      const filter = { productId: toObjectId(query.productId) };
      const [reviews, total] = await Promise.all([
        ReviewModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
        ReviewModel.countDocuments(filter)
      ]);
      const users = await UserModel.find({ _id: { $in: reviews.map((r) => r.userId) } }).select("name").lean();
      const names = new Map(users.map((u) => [String(u._id), u.name]));
      res.json(
        toPage(
          reviews.map((r) => ({
            id: String(r._id),
            rating: r.rating,
            title: r.title,
            comment: r.comment,
            verifiedPurchase: r.verifiedPurchase,
            author: publicName(names.get(String(r.userId)) ?? ""),
            createdAt: r.createdAt
          })),
          total,
          query
        )
      );
    });
    reviewRouter.get("/eligibility/:productId", authenticate, validate(eligibilitySchemas), async (req, res) => {
      const { params } = validated(req);
      const userId = currentUserId(req);
      const [purchased, existing] = await Promise.all([
        hasDeliveredPurchase(userId, params.productId),
        ReviewModel.exists({ productId: params.productId, userId })
      ]);
      res.json({ canReview: Boolean(purchased) && !existing, alreadyReviewed: Boolean(existing) });
    });
    reviewRouter.post("/", authenticate, validate(createSchemas5), async (req, res) => {
      const { body: body2 } = validated(req);
      const userId = currentUserId(req);
      if (!await hasDeliveredPurchase(userId, body2.productId)) {
        throw AppError.forbidden("Only customers who received this product can review it");
      }
      const review = await ReviewModel.create({ ...body2, userId: toObjectId(userId), verifiedPurchase: true });
      await recomputeRating(body2.productId);
      res.status(201).json({ id: review.id });
    });
  }
});

// src/modules/users/user.routes.ts
import { Router as Router14 } from "express";
import { z as z17 } from "zod";
async function loadUser(req) {
  const user = await UserModel.findById(currentUserId(req));
  if (!user) throw AppError.unauthenticated();
  return user;
}
var addressBody, profileSchemas, addAddressSchemas, updateAddressSchemas, addressIdSchemas, wishlistSchemas, userRouter, profileDto;
var init_user_routes = __esm({
  "src/modules/users/user.routes.ts"() {
    "use strict";
    init_constants();
    init_authenticate();
    init_validate();
    init_errors();
    init_object_id();
    init_schemas();
    init_product_model();
    init_product_query();
    init_user_dto();
    init_user_model();
    addressBody = z17.object({
      label: z17.string().trim().max(40).optional(),
      fullName: z17.string().trim().min(2).max(120),
      phone: phoneSchema,
      governorate: z17.enum(GOVERNORATE_KEYS),
      city: z17.string().trim().min(2).max(80),
      street: z17.string().trim().min(3).max(240),
      notes: z17.string().trim().max(300).optional(),
      isDefault: z17.boolean().default(false)
    });
    profileSchemas = {
      body: z17.object({ name: z17.string().trim().min(2).max(120).optional(), locale: z17.enum(["ar", "en"]).optional() })
    };
    addAddressSchemas = { body: addressBody };
    updateAddressSchemas = { params: z17.object({ addressId: objectIdSchema }), body: addressBody };
    addressIdSchemas = { params: z17.object({ addressId: objectIdSchema }) };
    wishlistSchemas = { params: z17.object({ productId: objectIdSchema }) };
    userRouter = Router14();
    userRouter.use(authenticate);
    profileDto = (user) => ({
      user: toPublicUser(user),
      addresses: user.addresses,
      wishlist: user.wishlist.map(String)
    });
    userRouter.get("/me", async (req, res) => {
      res.json(profileDto(await loadUser(req)));
    });
    userRouter.patch("/me", validate(profileSchemas), async (req, res) => {
      const { body: body2 } = validated(req);
      const user = await loadUser(req);
      if (body2.name) user.name = body2.name;
      if (body2.locale) user.locale = body2.locale;
      await user.save();
      res.json(profileDto(user));
    });
    userRouter.post("/me/addresses", validate(addAddressSchemas), async (req, res) => {
      const { body: body2 } = validated(req);
      const user = await loadUser(req);
      const makeDefault = body2.isDefault || user.addresses.length === 0;
      if (makeDefault) user.addresses.forEach((a) => a.isDefault = false);
      user.addresses.push({ ...body2, isDefault: makeDefault });
      await user.save();
      res.status(201).json(profileDto(user));
    });
    userRouter.put("/me/addresses/:addressId", validate(updateAddressSchemas), async (req, res) => {
      const { params, body: body2 } = validated(req);
      const user = await loadUser(req);
      const address = user.addresses.find((a) => String(a._id) === params.addressId);
      if (!address) throw AppError.notFound("Address");
      if (body2.isDefault) user.addresses.forEach((a) => a.isDefault = false);
      Object.assign(address, body2);
      await user.save();
      res.json(profileDto(user));
    });
    userRouter.delete("/me/addresses/:addressId", validate(addressIdSchemas), async (req, res) => {
      const { params } = validated(req);
      const user = await loadUser(req);
      const remaining = user.addresses.filter((a) => String(a._id) !== params.addressId);
      if (remaining.length === user.addresses.length) throw AppError.notFound("Address");
      if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) remaining[0].isDefault = true;
      user.set("addresses", remaining);
      await user.save();
      res.json(profileDto(user));
    });
    userRouter.get("/me/wishlist", async (req, res) => {
      const user = await loadUser(req);
      const rows = await ProductModel.aggregate([
        { $match: { _id: { $in: user.wishlist }, status: "published" } },
        { $project: CARD_PROJECTION }
      ]);
      const order = new Map(user.wishlist.map((id, index) => [String(id), index]));
      res.json({ items: rows.map(toCard).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) });
    });
    userRouter.put("/me/wishlist/:productId", validate(wishlistSchemas), async (req, res) => {
      const { params } = validated(req);
      if (!await ProductModel.exists({ _id: params.productId })) throw AppError.notFound("Product");
      await UserModel.updateOne({ _id: currentUserId(req) }, { $addToSet: { wishlist: params.productId } });
      res.status(204).end();
    });
    userRouter.delete("/me/wishlist/:productId", validate(wishlistSchemas), async (req, res) => {
      const { params } = validated(req);
      await UserModel.updateOne({ _id: currentUserId(req) }, { $pull: { wishlist: params.productId } });
      res.status(204).end();
    });
  }
});

// src/routes.ts
import { Router as Router15 } from "express";
var apiRouter;
var init_routes = __esm({
  "src/routes.ts"() {
    "use strict";
    init_health();
    init_admin_routes();
    init_auth_routes();
    init_brand_routes();
    init_cart_routes();
    init_category_routes();
    init_collection_routes();
    init_order_routes();
    init_payment_routes();
    init_product_routes();
    init_review_routes();
    init_shipping_routes();
    init_user_routes();
    apiRouter = Router15();
    apiRouter.get("/health", health);
    apiRouter.use("/auth", authRouter);
    apiRouter.use("/users", userRouter);
    apiRouter.use("/categories", categoryRouter);
    apiRouter.use("/brands", brandRouter);
    apiRouter.use("/collections", collectionRouter);
    apiRouter.use("/products", productRouter);
    apiRouter.use("/reviews", reviewRouter);
    apiRouter.use("/cart", cartRouter);
    apiRouter.use("/checkout", checkoutRouter);
    apiRouter.use("/orders", orderRouter);
    apiRouter.use("/shipping", shippingRouter);
    apiRouter.use("/payments", paymentRouter);
    apiRouter.use("/admin", adminRouter);
  }
});

// src/app.ts
var app_exports = {};
__export(app_exports, {
  createApp: () => createApp
});
import { randomUUID as randomUUID2 } from "node:crypto";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
function createApp() {
  initSentry();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(
    pinoHttp({
      logger,
      // Every log line of a request carries the same id; it is also returned to the client.
      genReqId: (req, res) => {
        const id = req.headers["x-request-id"] ?? randomUUID2();
        res.setHeader("x-request-id", id);
        return id;
      },
      customLogLevel: (_req, res, error) => error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/api/health" }
    })
  );
  app.use(helmet());
  app.use(cookieParser());
  app.use(
    express.json({
      limit: "1mb",
      // Webhook signatures are computed over the exact bytes the gateway sent.
      verify: (req, _res, buf) => {
        if (req.url?.startsWith(WEBHOOK_PREFIX)) req.rawBody = buf;
      }
    })
  );
  app.use(sanitizeInput);
  app.get("/health", health);
  app.use("/api/docs", docsRouter);
  app.use("/api", ensureDb, apiRouter);
  app.use(notFoundHandler);
  attachSentryErrorHandler(app);
  app.use(errorHandler);
  if (env.NODE_ENV !== "test") logger.info({ env: env.NODE_ENV }, "app created");
  return app;
}
var WEBHOOK_PREFIX, ensureDb;
var init_app = __esm({
  "src/app.ts"() {
    "use strict";
    init_env();
    init_health();
    init_error_handler();
    init_sanitize();
    init_db();
    init_logger();
    init_sentry();
    init_docs_routes();
    init_routes();
    WEBHOOK_PREFIX = "/api/payments/webhooks";
    ensureDb = async (_req, _res, next) => {
      await connectDb();
      next();
    };
  }
});

// src/index.ts
var handler;
try {
  const { createApp: createApp2 } = await Promise.resolve().then(() => (init_app(), app_exports));
  handler = createApp2();
} catch (error) {
  console.error("API failed to start:", error);
  const isConfigError = error instanceof Error && error.message.startsWith("Invalid environment configuration");
  const body2 = JSON.stringify({
    error: {
      code: "STARTUP_FAILED",
      message: isConfigError ? error.message : "The API failed to start. Check the function logs."
    }
  });
  handler = (_req, res) => {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(body2);
  };
}
var index_default = handler;
export {
  index_default as default
};
