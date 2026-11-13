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

// config/env.ts
import { z } from "zod";
function normalise(source) {
  const clean = {};
  for (const [key, raw] of Object.entries(source)) {
    if (raw === void 0) continue;
    const value = raw.trim();
    clean[key] = /^(["']).*\1$/s.test(value) ? value.slice(1, -1).trim() : value;
  }
  return clean;
}
function loadEnv(source = process.env) {
  const parsed = envSchema.safeParse(normalise(source));
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => {
      const hint = i.message === "Invalid URL" ? " (must be a full https:// URL \u2014 leave it empty or delete the variable if unused)" : "";
      return `  - ${i.path.join(".")}: ${i.message}${hint}`;
    }).join("\n");
    throw new Error(`Invalid environment configuration:
${details}`);
  }
  return parsed.data;
}
var optional, bool, envSchema, env, isProduction, isTest;
var init_env = __esm({
  "config/env.ts"() {
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

// config/logger.ts
import { pino } from "pino";
var prettyLogs, logger;
var init_logger = __esm({
  "config/logger.ts"() {
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

// config/db.ts
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
  "config/db.ts"() {
    "use strict";
    init_env();
    init_logger();
    globalForMongoose = globalThis;
    cache = globalForMongoose.__mongooseCache ??= { conn: null, promise: null };
  }
});

// controllers/health.controller.ts
import mongoose2 from "mongoose";
var health;
var init_health_controller = __esm({
  "controllers/health.controller.ts"() {
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

// utils/ApiError.ts
var ApiError;
var init_ApiError = __esm({
  "utils/ApiError.ts"() {
    "use strict";
    ApiError = class _ApiError extends Error {
      constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.name = "ApiError";
      }
      status;
      code;
      details;
      static badRequest(message = "Bad request", details) {
        return new _ApiError(400, "BAD_REQUEST", message, details);
      }
      static validation(details, message = "Validation failed") {
        return new _ApiError(422, "VALIDATION_ERROR", message, details);
      }
      static unauthenticated(message = "Authentication required") {
        return new _ApiError(401, "UNAUTHENTICATED", message);
      }
      static invalidCredentials() {
        return new _ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
      }
      static forbidden(message = "You do not have permission to perform this action") {
        return new _ApiError(403, "FORBIDDEN", message);
      }
      static notFound(what = "Resource") {
        return new _ApiError(404, "NOT_FOUND", `${what} not found`);
      }
      static conflict(message, code = "CONFLICT", details) {
        return new _ApiError(409, code, message, details);
      }
      static unprocessable(code, message, details) {
        return new _ApiError(422, code, message, details);
      }
      static tooManyRequests(retryAfterSeconds) {
        return new _ApiError(429, "RATE_LIMITED", "Too many requests, please try again later", {
          retryAfterSeconds
        });
      }
    };
  }
});

// middleware/error.middleware.ts
import { ZodError } from "zod";
function toAppError(error) {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return ApiError.validation(
      error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message, code: issue.code }))
    );
  }
  if (isDuplicateKey(error)) {
    return ApiError.conflict("Duplicate value", "CONFLICT", { fields: Object.keys(error.keyPattern ?? {}) });
  }
  const named = error;
  if (named?.type === "entity.parse.failed") return ApiError.badRequest("Malformed JSON body");
  if (named?.type === "entity.too.large") return new ApiError(413, "BAD_REQUEST", "Request body too large");
  if (named?.name === "CastError") return ApiError.badRequest("Invalid identifier");
  return new ApiError(500, "INTERNAL", "Internal server error");
}
var notFoundHandler, isDuplicateKey, errorHandler;
var init_error_middleware = __esm({
  "middleware/error.middleware.ts"() {
    "use strict";
    init_ApiError();
    init_logger();
    notFoundHandler = (req, _res, next) => {
      next(ApiError.notFound(`Route ${req.method} ${req.path}`));
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

// middleware/sanitize.middleware.ts
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
var init_sanitize_middleware = __esm({
  "middleware/sanitize.middleware.ts"() {
    "use strict";
    init_ApiError();
    sanitizeInput = (req, _res, next) => {
      const offending = findForbiddenKey(req.body, false) ?? findForbiddenKey(req.query, true) ?? findForbiddenKey(req.params, true);
      if (offending) throw ApiError.badRequest("Request contains forbidden keys", { key: offending });
      next();
    };
  }
});

// config/sentry.ts
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
  "config/sentry.ts"() {
    "use strict";
    init_env();
    initialised = false;
  }
});

// config/constants.ts
var USER_ROLES, USER_STATUSES, PRODUCT_STATUSES, MAX_CATEGORY_DEPTH, PAYMENT_METHODS, GOVERNORATES, GOVERNORATE_KEYS;
var init_constants = __esm({
  "config/constants.ts"() {
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

// utils/objectId.ts
import { Types } from "mongoose";
import { z as z2 } from "zod";
var objectIdSchema, toObjectId;
var init_objectId = __esm({
  "utils/objectId.ts"() {
    "use strict";
    objectIdSchema = z2.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
    toObjectId = (id) => typeof id === "string" ? new Types.ObjectId(id) : id;
  }
});

// validators/common.validators.ts
import { z as z3 } from "zod";
function toPage(items, total, { page: page2, limit }) {
  return { items, page: page2, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
var localizedSchema, localizedOptionalLongSchema, piastersSchema, slugSchema, attributeKeySchema, idParams, paginationQuery, phoneSchema, passwordSchema, emailSchema;
var init_common_validators = __esm({
  "validators/common.validators.ts"() {
    "use strict";
    init_objectId();
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

// validators/auth.validators.ts
import { z as z4 } from "zod";
var registerSchemas, loginSchemas, googleSchemas, verifyEmailSchemas, forgotPasswordSchemas, resetPasswordSchemas;
var init_auth_validators = __esm({
  "validators/auth.validators.ts"() {
    "use strict";
    init_common_validators();
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

// validators/product.validators.ts
import { z as z5 } from "zod";
var skuSchema, variantInputSchema, imageSchema, productBodySchema, createProductSchemas, updateProductSchemas, productIdSchemas, productSlugSchemas, csvList, oneOrMany, PRODUCT_SORTS, listProductsSchemas, suggestSchemas, adminListProductsSchemas, importProductsSchemas;
var init_product_validators = __esm({
  "validators/product.validators.ts"() {
    "use strict";
    init_constants();
    init_objectId();
    init_common_validators();
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
    importProductsSchemas = { body: z5.object({ rows: z5.array(z5.record(z5.string(), z5.string())).min(1).max(500) }) };
  }
});

// config/openapi.ts
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
var init_openapi = __esm({
  "config/openapi.ts"() {
    "use strict";
    init_constants();
    init_auth_validators();
    init_product_validators();
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

// routes/docs.routes.ts
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
var docsRouter, cached, document;
var init_docs_routes = __esm({
  "routes/docs.routes.ts"() {
    "use strict";
    init_openapi();
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

// services/token.service.ts
import { jwtVerify, SignJWT } from "jose";
async function signAccessToken({ userId, role }) {
  return new SignJWT({ role }).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuer(ISSUER).setIssuedAt().setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`).sign(secret);
}
async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ["HS256"] });
    const role = payload["role"];
    if (!payload.sub || typeof role !== "string" || !USER_ROLES.includes(role)) {
      throw ApiError.unauthenticated("Malformed access token");
    }
    return { userId: payload.sub, role };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthenticated("Invalid or expired access token");
  }
}
var secret, ISSUER;
var init_token_service = __esm({
  "services/token.service.ts"() {
    "use strict";
    init_constants();
    init_env();
    init_ApiError();
    secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    ISSUER = "marketplace-api";
  }
});

// middleware/auth.middleware.ts
function bearerToken(header) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}
function currentUserId(req) {
  if (!req.auth) throw ApiError.unauthenticated();
  return req.auth.userId;
}
var authenticate, requireRole, denyDemoWrites;
var init_auth_middleware = __esm({
  "middleware/auth.middleware.ts"() {
    "use strict";
    init_ApiError();
    init_token_service();
    authenticate = async (req, _res, next) => {
      const token = bearerToken(req.headers.authorization);
      if (!token) throw ApiError.unauthenticated();
      req.auth = await verifyAccessToken(token);
      next();
    };
    requireRole = (...roles) => (req, _res, next) => {
      if (!req.auth) throw ApiError.unauthenticated();
      if (!roles.includes(req.auth.role)) throw ApiError.forbidden();
      next();
    };
    denyDemoWrites = (req, _res, next) => {
      if (req.auth?.role === "demo_admin" && !["GET", "HEAD"].includes(req.method)) {
        throw ApiError.forbidden("This is a read-only demo account");
      }
      next();
    };
  }
});

// middleware/validate.middleware.ts
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
var init_validate_middleware = __esm({
  "middleware/validate.middleware.ts"() {
    "use strict";
  }
});

// models/AuditLog.ts
import { model, Schema } from "mongoose";
var auditLogSchema, AuditLogModel;
var init_AuditLog = __esm({
  "models/AuditLog.ts"() {
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

// models/InventoryLog.ts
import { model as model2, Schema as Schema2 } from "mongoose";
var INVENTORY_REASONS, inventoryLogSchema, InventoryLogModel;
var init_InventoryLog = __esm({
  "models/InventoryLog.ts"() {
    "use strict";
    INVENTORY_REASONS = [
      "order_placed",
      "order_cancelled",
      "order_refunded",
      "manual_adjustment",
      "restock",
      "import"
    ];
    inventoryLogSchema = new Schema2(
      {
        sku: { type: String, required: true, index: true },
        productId: { type: Schema2.Types.ObjectId, ref: "Product", required: true },
        delta: { type: Number, required: true },
        reason: { type: String, enum: INVENTORY_REASONS, required: true },
        note: { type: String, maxlength: 500 },
        orderId: { type: Schema2.Types.ObjectId, ref: "Order" },
        byUserId: { type: Schema2.Types.ObjectId, ref: "User" }
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    );
    inventoryLogSchema.index({ createdAt: -1 });
    inventoryLogSchema.index({ orderId: 1 });
    InventoryLogModel = model2("InventoryLog", inventoryLogSchema, "inventory_logs");
  }
});

// services/orderStateMachine.ts
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
    throw ApiError.unprocessable(
      "INVALID_TRANSITION",
      `Order cannot move from "${subject.status}" to "${to}" (actor: ${actor})`,
      { from: subject.status, to, actor, allowed: allowedTransitions(subject, actor) }
    );
  }
}
var ORDER_STATUSES, PAYMENT_STATUSES, TRANSITIONS, STOCK_RESTORING_STATUSES, restoresStock;
var init_orderStateMachine = __esm({
  "services/orderStateMachine.ts"() {
    "use strict";
    init_ApiError();
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

// models/Order.ts
import { model as model3, Schema as Schema3 } from "mongoose";
var localized, itemSchema, historySchema, orderSchema, OrderModel;
var init_Order = __esm({
  "models/Order.ts"() {
    "use strict";
    init_constants();
    init_orderStateMachine();
    localized = { ar: { type: String, default: "" }, en: { type: String, default: "" } };
    itemSchema = new Schema3(
      {
        productId: { type: Schema3.Types.ObjectId, ref: "Product", required: true },
        sku: { type: String, required: true },
        title: { type: localized, _id: false, required: true },
        image: String,
        optionValues: { type: Schema3.Types.Mixed, default: {} },
        options: { type: Schema3.Types.Mixed, default: () => [] },
        unitPrice: { type: Number, required: true, min: 0 },
        qty: { type: Number, required: true, min: 1 },
        lineTotal: { type: Number, required: true, min: 0 }
      },
      { _id: false, minimize: false }
    );
    historySchema = new Schema3(
      {
        status: { type: String, enum: ORDER_STATUSES, required: true },
        at: { type: Date, default: () => /* @__PURE__ */ new Date() },
        byUserId: { type: Schema3.Types.ObjectId, ref: "User" },
        actor: { type: String, enum: ["customer", "admin", "system"], required: true },
        note: { type: String, maxlength: 500 }
      },
      { _id: false }
    );
    orderSchema = new Schema3(
      {
        orderNumber: { type: String, required: true, unique: true },
        userId: { type: Schema3.Types.ObjectId, ref: "User", required: true },
        customerName: { type: String, required: true },
        customerEmail: { type: String, required: true, lowercase: true },
        items: { type: [itemSchema], validate: (v) => v.length > 0 },
        shippingAddress: {
          type: new Schema3(
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
    OrderModel = model3("Order", orderSchema);
  }
});

// models/Session.ts
import { model as model4, Schema as Schema4 } from "mongoose";
var sessionSchema, SessionModel;
var init_Session = __esm({
  "models/Session.ts"() {
    "use strict";
    sessionSchema = new Schema4(
      {
        userId: { type: Schema4.Types.ObjectId, ref: "User", required: true, index: true },
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
    SessionModel = model4("Session", sessionSchema);
  }
});

// models/User.ts
import { model as model5, Schema as Schema5 } from "mongoose";
var addressSchema, userSchema, UserModel;
var init_User = __esm({
  "models/User.ts"() {
    "use strict";
    init_constants();
    addressSchema = new Schema5({
      label: { type: String, trim: true, maxlength: 40 },
      fullName: { type: String, required: true, trim: true, maxlength: 120 },
      phone: { type: String, required: true, trim: true },
      governorate: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true, maxlength: 80 },
      street: { type: String, required: true, trim: true, maxlength: 240 },
      notes: { type: String, trim: true, maxlength: 300 },
      isDefault: { type: Boolean, default: false }
    });
    userSchema = new Schema5(
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
        wishlist: { type: [Schema5.Types.ObjectId], ref: "Product", default: [] },
        lastLoginAt: Date
      },
      { timestamps: true }
    );
    userSchema.index({ createdAt: -1 });
    UserModel = model5("User", userSchema);
  }
});

// utils/orderDto.ts
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
var init_orderDto = __esm({
  "utils/orderDto.ts"() {
    "use strict";
    init_orderStateMachine();
  }
});

// utils/text.ts
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
  "utils/text.ts"() {
    "use strict";
    ARABIC_DIACRITICS = /[ً-ٰٟۖ-ۭ]/g;
    TATWEEL = /ـ/g;
  }
});

// services/admin.service.ts
var page, adminService;
var init_admin_service = __esm({
  "services/admin.service.ts"() {
    "use strict";
    init_AuditLog();
    init_InventoryLog();
    init_Order();
    init_Session();
    init_User();
    init_ApiError();
    init_orderDto();
    init_text();
    init_common_validators();
    page = (p) => ({ skip: (p.page - 1) * p.limit, limit: p.limit });
    adminService = {
      // ── orders ─────────────────────────────────────────────────────────────────
      async listOrders(query) {
        const filter = {};
        if (query.status) filter["status"] = query.status;
        if (query.paymentMethod) filter["paymentMethod"] = query.paymentMethod;
        if (query.from || query.to) {
          filter["createdAt"] = { ...query.from && { $gte: query.from }, ...query.to && { $lte: query.to } };
        }
        if (query.q) {
          const prefix = new RegExp(`^${escapeRegex(query.q)}`, "i");
          filter["$or"] = [{ orderNumber: prefix }, { customerEmail: prefix }, { "shippingAddress.phone": prefix }];
        }
        const { skip, limit } = page(query);
        const [items, total] = await Promise.all([
          OrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
          OrderModel.countDocuments(filter)
        ]);
        return toPage(items.map((o) => toOrderDto(o, "admin", { includeCustomer: true })), total, query);
      },
      /** Cheap counter the dashboard polls every 30 s (Vercel Functions have no WebSockets). */
      async newOrdersCount(since) {
        const [pending, newSince] = await Promise.all([
          OrderModel.countDocuments({ status: { $in: ["pending_confirmation", "paid"] } }),
          since ? OrderModel.countDocuments({ createdAt: { $gt: since } }) : Promise.resolve(0)
        ]);
        return { pending, newSince, serverTime: /* @__PURE__ */ new Date() };
      },
      async getOrder(id) {
        const order = await OrderModel.findById(id).lean();
        if (!order) throw ApiError.notFound("Order");
        return toOrderDto(order, "admin", { includeCustomer: true });
      },
      // ── inventory ──────────────────────────────────────────────────────────────
      async inventoryLogs(query) {
        const filter = query.sku ? { sku: query.sku } : {};
        const { skip, limit } = page(query);
        const [items, total] = await Promise.all([
          InventoryLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
          InventoryLogModel.countDocuments(filter)
        ]);
        return toPage(items, total, query);
      },
      // ── customers ──────────────────────────────────────────────────────────────
      async listCustomers(query) {
        const filter = { role: "customer" };
        if (query.q) {
          const prefix = new RegExp(`^${escapeRegex(query.q)}`, "i");
          filter["$or"] = [{ email: prefix }, { name: prefix }];
        }
        const { skip, limit } = page(query);
        const [users, total] = await Promise.all([
          UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
          UserModel.countDocuments(filter)
        ]);
        const stats = await OrderModel.aggregate([
          {
            $match: {
              userId: { $in: users.map((u) => u._id) },
              status: { $nin: ["cancelled", "refunded", "pending_payment"] }
            }
          },
          { $group: { _id: "$userId", orders: { $sum: 1 }, spent: { $sum: "$total" } } }
        ]);
        const byUser = new Map(stats.map((s) => [String(s._id), s]));
        return toPage(
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
        );
      },
      async getCustomer(id) {
        const user = await UserModel.findOne({ _id: id, role: "customer" }).lean();
        if (!user) throw ApiError.notFound("Customer");
        const orders = await OrderModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean();
        return {
          customer: {
            id: String(user._id),
            name: user.name,
            email: user.email,
            status: user.status,
            emailVerified: user.emailVerified,
            addresses: user.addresses,
            createdAt: user.createdAt
          },
          orders: orders.map((o) => toOrderDto(o, "admin"))
        };
      },
      /** Banning also revokes every refresh token, so the customer is signed out of all devices immediately. */
      async setCustomerStatus(id, status) {
        const user = await UserModel.findOneAndUpdate({ _id: id, role: "customer" }, { $set: { status } }, { returnDocument: "after" });
        if (!user) throw ApiError.notFound("Customer");
        if (status === "banned") {
          await SessionModel.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: /* @__PURE__ */ new Date() } });
        }
        return { id, status: user.status };
      },
      // ── audit log ──────────────────────────────────────────────────────────────
      async auditLogs(query) {
        const { skip, limit } = page(query);
        const [items, total] = await Promise.all([
          AuditLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate("actorId", "name email").lean(),
          AuditLogModel.countDocuments()
        ]);
        return toPage(items, total, query);
      }
    };
  }
});

// services/audit.service.ts
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
  "services/audit.service.ts"() {
    "use strict";
    init_objectId();
    init_logger();
    init_AuditLog();
  }
});

// models/Product.ts
import { model as model6, Schema as Schema6 } from "mongoose";
var localized2, variantSchema, productSchema, ProductModel;
var init_Product = __esm({
  "models/Product.ts"() {
    "use strict";
    init_constants();
    localized2 = { ar: { type: String, default: "" }, en: { type: String, default: "" } };
    variantSchema = new Schema6(
      {
        sku: { type: String, required: true, trim: true, uppercase: true },
        optionValues: { type: Schema6.Types.Mixed, default: {} },
        price: { type: Number, required: true, min: 0, validate: Number.isInteger },
        compareAtPrice: { type: Number, min: 0, validate: Number.isInteger },
        stock: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger }
      },
      // `minimize` is a per-schema option: the parent's `minimize: false` does not reach sub-schemas, so without
      // this a single-variant product (no options) is stored WITHOUT `optionValues` and clients receive undefined.
      { minimize: false }
    );
    productSchema = new Schema6(
      {
        title: { type: localized2, required: true, _id: false },
        slug: { type: String, required: true, unique: true },
        description: { type: localized2, _id: false, default: () => ({ ar: "", en: "" }) },
        categoryId: { type: Schema6.Types.ObjectId, ref: "Category", required: true },
        categoryPath: { type: [Schema6.Types.ObjectId], required: true },
        brandId: { type: Schema6.Types.ObjectId, ref: "Brand" },
        images: {
          type: [new Schema6({ url: { type: String, required: true }, publicId: String, alt: String }, { _id: false })],
          default: []
        },
        specs: { type: Schema6.Types.Mixed, default: {} },
        options: {
          type: [new Schema6({ key: { type: String, required: true }, values: [String] }, { _id: false })],
          default: []
        },
        variants: { type: [variantSchema], validate: (v) => v.length > 0 },
        filterAttrs: {
          type: [new Schema6({ k: String, v: String }, { _id: false })],
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
    ProductModel = model6("Product", productSchema);
  }
});

// services/dashboard.service.ts
import mongoose3 from "mongoose";
async function periodStarts() {
  const db = mongoose3.connection.db;
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
  "services/dashboard.service.ts"() {
    "use strict";
    init_Order();
    init_Product();
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

// services/inventory.service.ts
var logEntry, inventoryService;
var init_inventory_service = __esm({
  "services/inventory.service.ts"() {
    "use strict";
    init_ApiError();
    init_objectId();
    init_Product();
    init_InventoryLog();
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
            throw ApiError.conflict(`Not enough stock for ${line.sku}`, "INSUFFICIENT_STOCK", { sku: line.sku });
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
          throw exists ? ApiError.conflict("Adjustment would make stock negative", "INSUFFICIENT_STOCK", { sku: input.sku }) : ApiError.notFound("SKU");
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

// models/Coupon.ts
import { model as model7, Schema as Schema7 } from "mongoose";
var COUPON_TYPES, couponSchema, CouponModel;
var init_Coupon = __esm({
  "models/Coupon.ts"() {
    "use strict";
    COUPON_TYPES = ["percent", "fixed"];
    couponSchema = new Schema7(
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
    CouponModel = model7("Coupon", couponSchema);
  }
});

// utils/background.ts
import { waitUntil } from "@vercel/functions";
function runInBackground(task, label) {
  const promise = Promise.resolve().then(task).catch((error) => logger.error({ err: error, task: label }, "background task failed"));
  try {
    waitUntil(promise);
  } catch {
  }
}
var init_background = __esm({
  "utils/background.ts"() {
    "use strict";
    init_logger();
  }
});

// services/email/emailTransport.ts
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
var init_emailTransport = __esm({
  "services/email/emailTransport.ts"() {
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

// services/email/emailLayout.ts
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
var init_emailLayout = __esm({
  "services/email/emailLayout.ts"() {
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

// services/email/emailTemplates.ts
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
  const body = `
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
      bodyHtml: body,
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
var init_emailTemplates = __esm({
  "services/email/emailTemplates.ts"() {
    "use strict";
    init_env();
    init_emailLayout();
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

// services/notification.service.ts
var notifications;
var init_notification_service = __esm({
  "services/notification.service.ts"() {
    "use strict";
    init_background();
    init_emailTransport();
    init_emailTemplates();
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

// models/Payment.ts
import { model as model8, Schema as Schema8 } from "mongoose";
var PAYMENT_RECORD_STATUSES, paymentSchema, PaymentModel;
var init_Payment = __esm({
  "models/Payment.ts"() {
    "use strict";
    PAYMENT_RECORD_STATUSES = ["pending", "paid", "failed", "refunded"];
    paymentSchema = new Schema8(
      {
        orderId: { type: Schema8.Types.ObjectId, ref: "Order", required: true, index: true },
        provider: { type: String, required: true },
        providerTxnId: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, required: true, default: "EGP" },
        status: { type: String, enum: PAYMENT_RECORD_STATUSES, default: "pending" }
      },
      { timestamps: { createdAt: true, updatedAt: true } }
    );
    paymentSchema.index({ provider: 1, providerTxnId: 1 }, { unique: true });
    PaymentModel = model8("Payment", paymentSchema);
  }
});

// services/orderTransitions.service.ts
import mongoose4 from "mongoose";
async function transitionOrder(request) {
  const order = await OrderModel.findById(request.orderId);
  if (!order || request.ownerId && String(order.userId) !== request.ownerId) throw ApiError.notFound("Order");
  assertTransition(order, request.to, request.actor);
  const { to } = request;
  const from = order.status;
  const set = { status: to };
  const paymentStatus = to === "paid" || to === "delivered" && order.paymentMethod === "cod" ? "paid" : to === "refunded" ? "refunded" : void 0;
  if (paymentStatus) set.paymentStatus = paymentStatus;
  if (to === "cancelled" && request.note) set.cancelReason = request.note;
  const updated = await mongoose4.connection.transaction(async (session) => {
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
    if (!doc) throw ApiError.conflict("The order was changed by someone else \u2014 reload and retry");
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
var init_orderTransitions_service = __esm({
  "services/orderTransitions.service.ts"() {
    "use strict";
    init_ApiError();
    init_objectId();
    init_Coupon();
    init_inventory_service();
    init_notification_service();
    init_Payment();
    init_Product();
    init_User();
    init_Order();
    init_orderStateMachine();
  }
});

// services/upload.service.ts
import { v2 as cloudinary } from "cloudinary";
function signImageUpload() {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName || !apiKey || !apiSecret) throw ApiError.badRequest("Cloudinary is not configured");
  const timestamp = Math.round(Date.now() / 1e3);
  const folder = "products";
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, apiSecret);
  return { cloudName, apiKey, timestamp, folder, signature };
}
var init_upload_service = __esm({
  "services/upload.service.ts"() {
    "use strict";
    init_env();
    init_ApiError();
  }
});

// controllers/admin.controller.ts
var getDashboard, listOrders, getNewOrdersCount, getOrder, transition, adjustStock, getInventoryLogs, listCustomers, getCustomer, setCustomerStatus, getAuditLogs, signUpload;
var init_admin_controller = __esm({
  "controllers/admin.controller.ts"() {
    "use strict";
    init_auth_middleware();
    init_validate_middleware();
    init_admin_service();
    init_audit_service();
    init_dashboard_service();
    init_inventory_service();
    init_orderTransitions_service();
    init_upload_service();
    init_orderDto();
    getDashboard = async (_req, res) => {
      res.json(await dashboardService.overview());
    };
    listOrders = async (req, res) => {
      const { query } = validated(req);
      res.json(await adminService.listOrders(query));
    };
    getNewOrdersCount = async (req, res) => {
      const { query } = validated(req);
      res.json(await adminService.newOrdersCount(query.since));
    };
    getOrder = async (req, res) => {
      const { params } = validated(req);
      res.json({ order: await adminService.getOrder(params.id) });
    };
    transition = async (req, res) => {
      const { params, body } = validated(req);
      const order = await transitionOrder({
        orderId: params.id,
        to: body.to,
        actor: "admin",
        byUserId: currentUserId(req),
        ...body.note ? { note: body.note } : {}
      });
      await recordAudit(req, { action: "order.transition", entity: "order", entityId: params.id, meta: { to: body.to, note: body.note } });
      res.json({ order: toOrderDto(order, "admin", { includeCustomer: true }) });
    };
    adjustStock = async (req, res) => {
      const { body } = validated(req);
      const result = await inventoryService.adjust({ ...body, byUserId: currentUserId(req) });
      await recordAudit(req, { action: "inventory.adjust", entity: "sku", entityId: body.sku, meta: { delta: body.delta, note: body.note } });
      res.json(result);
    };
    getInventoryLogs = async (req, res) => {
      const { query } = validated(req);
      res.json(await adminService.inventoryLogs(query));
    };
    listCustomers = async (req, res) => {
      const { query } = validated(req);
      res.json(await adminService.listCustomers(query));
    };
    getCustomer = async (req, res) => {
      const { params } = validated(req);
      res.json(await adminService.getCustomer(params.id));
    };
    setCustomerStatus = async (req, res) => {
      const { params, body } = validated(req);
      const result = await adminService.setCustomerStatus(params.id, body.status);
      await recordAudit(req, { action: `customer.${body.status === "banned" ? "ban" : "unban"}`, entity: "user", entityId: params.id });
      res.json(result);
    };
    getAuditLogs = async (req, res) => {
      const { query } = validated(req);
      res.json(await adminService.auditLogs(query));
    };
    signUpload = (_req, res) => {
      res.json(signImageUpload());
    };
  }
});

// validators/admin.validators.ts
import { z as z7 } from "zod";
var adminListOrdersSchemas, adminOrderIdSchemas, transitionOrderSchemas, newOrdersSchemas, adjustStockSchemas, inventoryLogsSchemas, listCustomersSchemas, customerIdSchemas, customerStatusSchemas, auditLogsSchemas;
var init_admin_validators = __esm({
  "validators/admin.validators.ts"() {
    "use strict";
    init_orderStateMachine();
    init_common_validators();
    init_product_validators();
    adminListOrdersSchemas = {
      query: paginationQuery.extend({
        status: z7.enum(ORDER_STATUSES).optional(),
        q: z7.string().trim().max(80).optional(),
        paymentMethod: z7.enum(["cod", "card", "wallet", "fawry"]).optional(),
        from: z7.coerce.date().optional(),
        to: z7.coerce.date().optional()
      })
    };
    adminOrderIdSchemas = { params: idParams };
    transitionOrderSchemas = {
      params: idParams,
      body: z7.object({ to: z7.enum(ORDER_STATUSES), note: z7.string().trim().max(500).optional() })
    };
    newOrdersSchemas = { query: z7.object({ since: z7.coerce.date().optional() }) };
    adjustStockSchemas = {
      body: z7.object({
        sku: skuSchema,
        delta: z7.number().int().refine((n) => n !== 0, "delta cannot be 0").refine((n) => Math.abs(n) <= 1e5),
        note: z7.string().trim().min(3, "A written reason is required").max(500)
      })
    };
    inventoryLogsSchemas = { query: paginationQuery.extend({ sku: skuSchema.optional() }) };
    listCustomersSchemas = { query: paginationQuery.extend({ q: z7.string().trim().max(80).optional() }) };
    customerIdSchemas = { params: idParams };
    customerStatusSchemas = { params: idParams, body: z7.object({ status: z7.enum(["active", "banned"]) }) };
    auditLogsSchemas = { query: paginationQuery };
  }
});

// models/Brand.ts
import { model as model9, Schema as Schema9 } from "mongoose";
var brandSchema, BrandModel;
var init_Brand = __esm({
  "models/Brand.ts"() {
    "use strict";
    brandSchema = new Schema9(
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
    BrandModel = model9("Brand", brandSchema);
  }
});

// utils/revalidate.ts
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
  "utils/revalidate.ts"() {
    "use strict";
    init_env();
    init_logger();
    init_background();
  }
});

// utils/slug.ts
function slugify(input) {
  return input.normalize("NFKC").toLowerCase().trim().replace(/[ً-ٟـ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
var init_slug = __esm({
  "utils/slug.ts"() {
    "use strict";
  }
});

// utils/uniqueSlug.ts
async function uniqueSlug(base, exists) {
  const root = slugify(base) || "item";
  let candidate = root;
  for (let i = 2; await exists(candidate); i++) candidate = `${root}-${i}`;
  return candidate;
}
var init_uniqueSlug = __esm({
  "utils/uniqueSlug.ts"() {
    "use strict";
    init_slug();
  }
});

// controllers/brand.controller.ts
var listBrands, getBrand, createBrand, updateBrand, deleteBrand;
var init_brand_controller = __esm({
  "controllers/brand.controller.ts"() {
    "use strict";
    init_validate_middleware();
    init_Brand();
    init_Product();
    init_audit_service();
    init_ApiError();
    init_revalidate();
    init_uniqueSlug();
    listBrands = async (_req, res) => {
      res.json({ items: await BrandModel.find().sort({ name: 1 }).lean() });
    };
    getBrand = async (req, res) => {
      const { params } = validated(req);
      const brand = await BrandModel.findOne({ slug: params.slug }).lean();
      if (!brand) throw ApiError.notFound("Brand");
      res.json({ brand });
    };
    createBrand = async (req, res) => {
      const { body } = validated(req);
      const slug = body.slug ?? await uniqueSlug(body.name, (s) => BrandModel.exists({ slug: s }).then(Boolean));
      const brand = await BrandModel.create({ ...body, slug });
      await recordAudit(req, { action: "brand.create", entity: "brand", entityId: brand.id });
      revalidateStorefront(["brands", "products"]);
      res.status(201).json({ brand });
    };
    updateBrand = async (req, res) => {
      const { params, body } = validated(req);
      const brand = await BrandModel.findByIdAndUpdate(params.id, { $set: body }, { returnDocument: "after", runValidators: true });
      if (!brand) throw ApiError.notFound("Brand");
      await recordAudit(req, { action: "brand.update", entity: "brand", entityId: params.id });
      revalidateStorefront(["brands", "products"]);
      res.json({ brand });
    };
    deleteBrand = async (req, res) => {
      const { params } = validated(req);
      if (await ProductModel.exists({ brandId: params.id })) throw ApiError.conflict("This brand still has products");
      if (!await BrandModel.findByIdAndDelete(params.id)) throw ApiError.notFound("Brand");
      await recordAudit(req, { action: "brand.delete", entity: "brand", entityId: params.id });
      revalidateStorefront(["brands", "products"]);
      res.status(204).end();
    };
  }
});

// validators/brand.validators.ts
import { z as z8 } from "zod";
var createBrandSchemas, updateBrandSchemas, brandIdSchemas, brandSlugSchemas;
var init_brand_validators = __esm({
  "validators/brand.validators.ts"() {
    "use strict";
    init_common_validators();
    createBrandSchemas = {
      body: z8.object({
        name: z8.string().trim().min(1).max(80),
        slug: slugSchema.optional(),
        logo: z8.url().optional(),
        description: localizedOptionalLongSchema.optional()
      })
    };
    updateBrandSchemas = { params: idParams, body: createBrandSchemas.body.partial() };
    brandIdSchemas = { params: idParams };
    brandSlugSchemas = { params: z8.object({ slug: slugSchema }) };
  }
});

// routes/brand.routes.ts
import { Router as Router2 } from "express";
var brandRouter, brandAdminRouter;
var init_brand_routes = __esm({
  "routes/brand.routes.ts"() {
    "use strict";
    init_brand_controller();
    init_validate_middleware();
    init_brand_validators();
    brandRouter = Router2();
    brandRouter.get("/", listBrands);
    brandRouter.get("/:slug", validate(brandSlugSchemas), getBrand);
    brandAdminRouter = Router2();
    brandAdminRouter.get("/", listBrands);
    brandAdminRouter.post("/", validate(createBrandSchemas), createBrand);
    brandAdminRouter.patch("/:id", validate(updateBrandSchemas), updateBrand);
    brandAdminRouter.delete("/:id", validate(brandIdSchemas), deleteBrand);
  }
});

// models/Category.ts
import { model as model10, Schema as Schema10 } from "mongoose";
var ATTRIBUTE_TYPES, localized3, attributeSchema, categorySchema, CategoryModel;
var init_Category = __esm({
  "models/Category.ts"() {
    "use strict";
    ATTRIBUTE_TYPES = ["select", "color", "text", "number"];
    localized3 = { ar: { type: String, required: true }, en: { type: String, required: true } };
    attributeSchema = new Schema10(
      {
        key: { type: String, required: true, match: /^[a-z][a-z0-9_]{0,31}$/ },
        label: { type: localized3, required: true, _id: false },
        type: { type: String, enum: ATTRIBUTE_TYPES, default: "select" },
        values: {
          type: [
            new Schema10(
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
    categorySchema = new Schema10(
      {
        name: { type: localized3, required: true, _id: false },
        slug: { type: String, required: true, unique: true },
        parentId: { type: Schema10.Types.ObjectId, ref: "Category", default: null, index: true },
        level: { type: Number, required: true, min: 1, max: 3 },
        path: { type: [Schema10.Types.ObjectId], default: [] },
        image: String,
        attributes: { type: [attributeSchema], default: [] },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      },
      { timestamps: true }
    );
    categorySchema.index({ path: 1 });
    CategoryModel = model10("Category", categorySchema);
  }
});

// services/category.service.ts
import { Types as Types2 } from "mongoose";
function mergeAttributes(chain) {
  const byKey = /* @__PURE__ */ new Map();
  for (const category of chain) for (const attribute of category.attributes) byKey.set(attribute.key, attribute);
  return [...byKey.values()];
}
var categoryService;
var init_category_service = __esm({
  "services/category.service.ts"() {
    "use strict";
    init_constants();
    init_ApiError();
    init_objectId();
    init_uniqueSlug();
    init_Product();
    init_Category();
    categoryService = {
      async create(input) {
        const _id = new Types2.ObjectId();
        let level = 1;
        let path = [_id];
        if (input.parentId) {
          const parent = await CategoryModel.findById(input.parentId);
          if (!parent) throw ApiError.notFound("Parent category");
          if (parent.level >= MAX_CATEGORY_DEPTH) {
            throw ApiError.unprocessable("VALIDATION_ERROR", `Categories can be nested at most ${MAX_CATEGORY_DEPTH} levels deep`);
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
        if (!category) throw ApiError.notFound("Category");
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
        if (hasChildren) throw ApiError.conflict("Delete or move the sub-categories first");
        if (hasProducts) throw ApiError.conflict("This category still has products");
        const deleted = await CategoryModel.findByIdAndDelete(id);
        if (!deleted) throw ApiError.notFound("Category");
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
        if (!category) throw ApiError.notFound("Category");
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

// controllers/category.controller.ts
var getCategoryTree, getCategoryDetails, listCategories, createCategory, updateCategory, deleteCategory;
var init_category_controller = __esm({
  "controllers/category.controller.ts"() {
    "use strict";
    init_validate_middleware();
    init_category_service();
    init_audit_service();
    init_revalidate();
    getCategoryTree = async (_req, res) => {
      res.json({ items: await categoryService.tree() });
    };
    getCategoryDetails = async (req, res) => {
      const { params } = validated(req);
      res.json(await categoryService.getDetailsBySlug(params.slug));
    };
    listCategories = async (_req, res) => {
      res.json({ items: await categoryService.listAll() });
    };
    createCategory = async (req, res) => {
      const { body } = validated(req);
      const category = await categoryService.create(body);
      await recordAudit(req, { action: "category.create", entity: "category", entityId: category.id });
      revalidateStorefront(["categories"]);
      res.status(201).json({ category });
    };
    updateCategory = async (req, res) => {
      const { params, body } = validated(req);
      const category = await categoryService.update(params.id, body);
      await recordAudit(req, { action: "category.update", entity: "category", entityId: params.id });
      revalidateStorefront(["categories", "products"]);
      res.json({ category });
    };
    deleteCategory = async (req, res) => {
      const { params } = validated(req);
      await categoryService.remove(params.id);
      await recordAudit(req, { action: "category.delete", entity: "category", entityId: params.id });
      revalidateStorefront(["categories"]);
      res.status(204).end();
    };
  }
});

// validators/category.validators.ts
import { z as z9 } from "zod";
var attributeValueSchema, attributeDefSchema, attributesSchema, categoryFields, createCategorySchemas, updateCategorySchemas, categoryIdSchemas, categorySlugSchemas;
var init_category_validators = __esm({
  "validators/category.validators.ts"() {
    "use strict";
    init_common_validators();
    init_objectId();
    init_Category();
    attributeValueSchema = z9.object({
      value: z9.string().trim().min(1).max(60),
      label: localizedSchema.optional(),
      swatch: z9.string().trim().max(32).optional()
    });
    attributeDefSchema = z9.object({
      key: attributeKeySchema,
      label: localizedSchema,
      type: z9.enum(ATTRIBUTE_TYPES).default("select"),
      values: z9.array(attributeValueSchema).max(100).default([]),
      filterable: z9.boolean().default(false),
      variantOption: z9.boolean().default(false)
    }).refine((a) => !a.variantOption || a.values.length > 0, {
      message: "A variant option needs at least one allowed value",
      path: ["values"]
    });
    attributesSchema = z9.array(attributeDefSchema).max(20).refine((attrs) => new Set(attrs.map((a) => a.key)).size === attrs.length, {
      message: "Attribute keys must be unique within a category"
    });
    categoryFields = z9.object({
      name: localizedSchema,
      slug: slugSchema,
      image: z9.url(),
      sortOrder: z9.number().int().min(0),
      isActive: z9.boolean(),
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
    categorySlugSchemas = { params: z9.object({ slug: slugSchema }) };
  }
});

// routes/category.routes.ts
import { Router as Router3 } from "express";
var categoryRouter, categoryAdminRouter;
var init_category_routes = __esm({
  "routes/category.routes.ts"() {
    "use strict";
    init_category_controller();
    init_validate_middleware();
    init_category_validators();
    categoryRouter = Router3();
    categoryRouter.get("/", getCategoryTree);
    categoryRouter.get("/:slug", validate(categorySlugSchemas), getCategoryDetails);
    categoryAdminRouter = Router3();
    categoryAdminRouter.get("/", listCategories);
    categoryAdminRouter.post("/", validate(createCategorySchemas), createCategory);
    categoryAdminRouter.patch("/:id", validate(updateCategorySchemas), updateCategory);
    categoryAdminRouter.delete("/:id", validate(categoryIdSchemas), deleteCategory);
  }
});

// models/Collection.ts
import { model as model11, Schema as Schema11 } from "mongoose";
var localized4, collectionSchema, CollectionModel;
var init_Collection = __esm({
  "models/Collection.ts"() {
    "use strict";
    localized4 = { ar: { type: String, default: "" }, en: { type: String, default: "" } };
    collectionSchema = new Schema11(
      {
        title: { type: localized4, required: true, _id: false },
        slug: { type: String, required: true, unique: true },
        description: { type: localized4, _id: false, default: () => ({ ar: "", en: "" }) },
        image: String,
        productIds: { type: [Schema11.Types.ObjectId], ref: "Product", default: [] },
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
      },
      { timestamps: true }
    );
    CollectionModel = model11("Collection", collectionSchema);
  }
});

// services/productQuery.service.ts
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
    if (!category) throw ApiError.notFound("Category");
    base.push({ categoryPath: category._id });
    const chain = await CategoryModel.find({ _id: { $in: category.path } }).sort({ level: 1 }).lean();
    attributeDefs = mergeAttributes(chain).filter((a) => a.filterable);
  }
  if (query.collection) {
    const collection = await CollectionModel.findOne({ slug: query.collection, isActive: true }).lean();
    if (!collection) throw ApiError.notFound("Collection");
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
var init_productQuery_service = __esm({
  "services/productQuery.service.ts"() {
    "use strict";
    init_ApiError();
    init_text();
    init_Brand();
    init_Category();
    init_category_service();
    init_Collection();
    init_Product();
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

// controllers/collection.controller.ts
var listCollections, getCollection, listAllCollections, createCollection, updateCollection, deleteCollection;
var init_collection_controller = __esm({
  "controllers/collection.controller.ts"() {
    "use strict";
    init_validate_middleware();
    init_Collection();
    init_Product();
    init_audit_service();
    init_productQuery_service();
    init_ApiError();
    init_revalidate();
    init_uniqueSlug();
    listCollections = async (_req, res) => {
      const items = await CollectionModel.find({ isActive: true }).sort({ sortOrder: 1 }).select("-productIds").lean();
      res.json({ items });
    };
    getCollection = async (req, res) => {
      const { params } = validated(req);
      const collection = await CollectionModel.findOne({ slug: params.slug, isActive: true }).lean();
      if (!collection) throw ApiError.notFound("Collection");
      const preview = await ProductModel.aggregate([
        { $match: { _id: { $in: collection.productIds.slice(0, 12) }, status: "published" } },
        { $project: CARD_PROJECTION }
      ]);
      const { productIds: _omit, ...meta2 } = collection;
      res.json({ collection: meta2, preview: preview.map(toCard) });
    };
    listAllCollections = async (_req, res) => {
      res.json({ items: await CollectionModel.find().sort({ sortOrder: 1 }).lean() });
    };
    createCollection = async (req, res) => {
      const { body } = validated(req);
      const slug = body.slug ?? await uniqueSlug(body.title.en, (s) => CollectionModel.exists({ slug: s }).then(Boolean));
      const collection = await CollectionModel.create({ ...body, slug });
      await recordAudit(req, { action: "collection.create", entity: "collection", entityId: collection.id });
      revalidateStorefront(["collections"]);
      res.status(201).json({ collection });
    };
    updateCollection = async (req, res) => {
      const { params, body } = validated(req);
      const collection = await CollectionModel.findByIdAndUpdate(params.id, { $set: body }, { returnDocument: "after", runValidators: true });
      if (!collection) throw ApiError.notFound("Collection");
      await recordAudit(req, { action: "collection.update", entity: "collection", entityId: params.id });
      revalidateStorefront(["collections"]);
      res.json({ collection });
    };
    deleteCollection = async (req, res) => {
      const { params } = validated(req);
      if (!await CollectionModel.findByIdAndDelete(params.id)) throw ApiError.notFound("Collection");
      await recordAudit(req, { action: "collection.delete", entity: "collection", entityId: params.id });
      revalidateStorefront(["collections"]);
      res.status(204).end();
    };
  }
});

// validators/collection.validators.ts
import { z as z10 } from "zod";
var fields, createCollectionSchemas, updateCollectionSchemas, collectionIdSchemas, collectionSlugSchemas;
var init_collection_validators = __esm({
  "validators/collection.validators.ts"() {
    "use strict";
    init_objectId();
    init_common_validators();
    fields = z10.object({
      title: localizedSchema,
      slug: slugSchema,
      description: localizedOptionalLongSchema,
      image: z10.url(),
      productIds: z10.array(objectIdSchema).max(200),
      sortOrder: z10.number().int().min(0),
      isActive: z10.boolean()
    });
    createCollectionSchemas = {
      body: fields.partial({ slug: true, description: true, image: true }).extend({
        productIds: fields.shape.productIds.default([]),
        sortOrder: fields.shape.sortOrder.default(0),
        isActive: fields.shape.isActive.default(true)
      })
    };
    updateCollectionSchemas = { params: idParams, body: fields.partial() };
    collectionIdSchemas = { params: idParams };
    collectionSlugSchemas = { params: z10.object({ slug: slugSchema }) };
  }
});

// routes/collection.routes.ts
import { Router as Router4 } from "express";
var collectionRouter, collectionAdminRouter;
var init_collection_routes = __esm({
  "routes/collection.routes.ts"() {
    "use strict";
    init_collection_controller();
    init_validate_middleware();
    init_collection_validators();
    collectionRouter = Router4();
    collectionRouter.get("/", listCollections);
    collectionRouter.get("/:slug", validate(collectionSlugSchemas), getCollection);
    collectionAdminRouter = Router4();
    collectionAdminRouter.get("/", listAllCollections);
    collectionAdminRouter.post("/", validate(createCollectionSchemas), createCollection);
    collectionAdminRouter.patch("/:id", validate(updateCollectionSchemas), updateCollection);
    collectionAdminRouter.delete("/:id", validate(collectionIdSchemas), deleteCollection);
  }
});

// controllers/coupon.controller.ts
var listCoupons, createCoupon, updateCoupon, deleteCoupon;
var init_coupon_controller = __esm({
  "controllers/coupon.controller.ts"() {
    "use strict";
    init_validate_middleware();
    init_Coupon();
    init_audit_service();
    init_ApiError();
    init_common_validators();
    listCoupons = async (req, res) => {
      const { query } = validated(req);
      const [items, total] = await Promise.all([
        CouponModel.find().sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
        CouponModel.countDocuments()
      ]);
      res.json(toPage(items, total, query));
    };
    createCoupon = async (req, res) => {
      const { body } = validated(req);
      const coupon = await CouponModel.create(body);
      await recordAudit(req, { action: "coupon.create", entity: "coupon", entityId: coupon.id });
      res.status(201).json({ coupon });
    };
    updateCoupon = async (req, res) => {
      const { params, body } = validated(req);
      const coupon = await CouponModel.findByIdAndUpdate(params.id, { $set: body }, { returnDocument: "after", runValidators: true });
      if (!coupon) throw ApiError.notFound("Coupon");
      await recordAudit(req, { action: "coupon.update", entity: "coupon", entityId: params.id });
      res.json({ coupon });
    };
    deleteCoupon = async (req, res) => {
      const { params } = validated(req);
      if (!await CouponModel.findByIdAndDelete(params.id)) throw ApiError.notFound("Coupon");
      await recordAudit(req, { action: "coupon.delete", entity: "coupon", entityId: params.id });
      res.status(204).end();
    };
  }
});

// validators/coupon.validators.ts
import { z as z11 } from "zod";
var baseBody, refineCoupon, createCouponSchemas, updateCouponSchemas, couponIdSchemas, listCouponsSchemas;
var init_coupon_validators = __esm({
  "validators/coupon.validators.ts"() {
    "use strict";
    init_Coupon();
    init_common_validators();
    baseBody = z11.object({
      code: z11.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Code: 3\u201330 letters, digits, "-" or "_"'),
      type: z11.enum(COUPON_TYPES),
      value: z11.number().int().min(1),
      minOrder: piastersSchema,
      maxDiscount: piastersSchema.min(1).optional(),
      startsAt: z11.coerce.date().optional(),
      expiresAt: z11.coerce.date().optional(),
      maxUses: z11.number().int().min(1).optional(),
      isActive: z11.boolean()
    });
    refineCoupon = (schema) => schema.refine((c) => c.type !== "percent" || c.value === void 0 || c.value <= 100, {
      message: "Percent coupons are capped at 100",
      path: ["value"]
    }).refine((c) => !c.startsAt || !c.expiresAt || c.startsAt < c.expiresAt, {
      message: "expiresAt must be after startsAt",
      path: ["expiresAt"]
    });
    createCouponSchemas = {
      body: refineCoupon(baseBody.extend({ minOrder: piastersSchema.default(0), isActive: z11.boolean().default(true) }))
    };
    updateCouponSchemas = { params: idParams, body: refineCoupon(baseBody.partial()) };
    couponIdSchemas = { params: idParams };
    listCouponsSchemas = { query: paginationQuery };
  }
});

// routes/coupon.routes.ts
import { Router as Router5 } from "express";
var couponAdminRouter;
var init_coupon_routes = __esm({
  "routes/coupon.routes.ts"() {
    "use strict";
    init_coupon_controller();
    init_validate_middleware();
    init_coupon_validators();
    couponAdminRouter = Router5();
    couponAdminRouter.get("/", validate(listCouponsSchemas), listCoupons);
    couponAdminRouter.post("/", validate(createCouponSchemas), createCoupon);
    couponAdminRouter.patch("/:id", validate(updateCouponSchemas), updateCoupon);
    couponAdminRouter.delete("/:id", validate(couponIdSchemas), deleteCoupon);
  }
});

// models/Review.ts
import { model as model12, Schema as Schema12 } from "mongoose";
var reviewSchema, ReviewModel;
var init_Review = __esm({
  "models/Review.ts"() {
    "use strict";
    reviewSchema = new Schema12(
      {
        productId: { type: Schema12.Types.ObjectId, ref: "Product", required: true },
        userId: { type: Schema12.Types.ObjectId, ref: "User", required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        title: { type: String, maxlength: 120 },
        comment: { type: String, required: true, maxlength: 2e3 },
        verifiedPurchase: { type: Boolean, default: true }
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    );
    reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
    reviewSchema.index({ productId: 1, createdAt: -1 });
    ReviewModel = model12("Review", reviewSchema);
  }
});

// services/productBuilder.service.ts
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
var init_productBuilder_service = __esm({
  "services/productBuilder.service.ts"() {
    "use strict";
    init_ApiError();
    init_text();
    fail = (issues) => {
      throw ApiError.validation(issues, "Product does not match its category definition");
    };
  }
});

// services/product.service.ts
import { Types as Types3 } from "mongoose";
async function resolveContext(input) {
  const category = await CategoryModel.findById(input.categoryId).lean();
  if (!category) throw ApiError.notFound("Category");
  const [attributes, brand, ancestors] = await Promise.all([
    categoryService.effectiveAttributes(category),
    input.brandId ? BrandModel.findById(input.brandId).lean() : Promise.resolve(null),
    CategoryModel.find({ _id: { $in: category.path } }).lean()
  ]);
  if (input.brandId && !brand) throw ApiError.notFound("Brand");
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
  "services/product.service.ts"() {
    "use strict";
    init_ApiError();
    init_revalidate();
    init_text();
    init_uniqueSlug();
    init_Brand();
    init_Category();
    init_category_service();
    init_InventoryLog();
    init_Order();
    init_Review();
    init_productBuilder_service();
    init_Product();
    init_productQuery_service();
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
        if (!existing) throw ApiError.notFound("Product");
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
        if (result.matchedCount === 0) throw ApiError.notFound("Product");
        revalidate(existing.slug);
        if (slug !== existing.slug) revalidate(slug);
        return ProductModel.findById(id).lean();
      },
      /** Products that were ever ordered are archived (back to draft) instead of deleted, preserving history. */
      async remove(id) {
        const product = await ProductModel.findById(id);
        if (!product) throw ApiError.notFound("Product");
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
        if (!product) throw ApiError.notFound("Product");
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
        if (!product) throw ApiError.notFound("Product");
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

// services/productImport.service.ts
import { z as z12 } from "zod";
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
      const message = error instanceof z12.ZodError ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : error.message;
      results.push({ row, ok: false, error: message });
    }
  }
  return results;
}
var rowSchema;
var init_productImport_service = __esm({
  "services/productImport.service.ts"() {
    "use strict";
    init_common_validators();
    init_Brand();
    init_Category();
    init_product_service();
    init_product_validators();
    rowSchema = z12.object({
      title_en: z12.string().trim().min(1).max(200),
      title_ar: z12.string().trim().min(1).max(200),
      category_slug: z12.string().trim().min(1),
      brand_slug: z12.string().trim().optional(),
      sku: skuSchema,
      price_egp: z12.string().trim().regex(/^\d+(\.\d{1,2})?$/, "price_egp must be like 149.99"),
      stock: z12.string().trim().regex(/^\d+$/),
      image_url: z12.url().optional().or(z12.literal("")),
      description_en: z12.string().optional(),
      description_ar: z12.string().optional(),
      status: z12.enum(["draft", "published"]).optional()
    });
  }
});

// controllers/product.controller.ts
var listPublicProducts, suggest, getProduct, listAdminProducts, getAdminProduct, createProduct, updateProduct, deleteProduct, importAdminProducts;
var init_product_controller = __esm({
  "controllers/product.controller.ts"() {
    "use strict";
    init_validate_middleware();
    init_audit_service();
    init_product_service();
    init_productImport_service();
    init_productQuery_service();
    listPublicProducts = async (req, res) => {
      const { query } = validated(req);
      res.json(await listProducts(query));
    };
    suggest = async (req, res) => {
      const { query } = validated(req);
      res.json({ items: await suggestProducts(query.q, query.limit) });
    };
    getProduct = async (req, res) => {
      const { params } = validated(req);
      res.json(await productService.getBySlug(params.slug));
    };
    listAdminProducts = async (req, res) => {
      const { query } = validated(req);
      res.json(await productService.listAdmin(query));
    };
    getAdminProduct = async (req, res) => {
      const { params } = validated(req);
      res.json({ product: await productService.getAdmin(params.id) });
    };
    createProduct = async (req, res) => {
      const { body } = validated(req);
      const product = await productService.create(body);
      await recordAudit(req, { action: "product.create", entity: "product", entityId: product.id });
      res.status(201).json({ product });
    };
    updateProduct = async (req, res) => {
      const { params, body } = validated(req);
      const product = await productService.update(params.id, body);
      await recordAudit(req, { action: "product.update", entity: "product", entityId: params.id });
      res.json({ product });
    };
    deleteProduct = async (req, res) => {
      const { params } = validated(req);
      const outcome = await productService.remove(params.id);
      await recordAudit(req, { action: `product.${outcome}`, entity: "product", entityId: params.id });
      res.json({ outcome });
    };
    importAdminProducts = async (req, res) => {
      const { body } = validated(req);
      const results = await importProducts(body.rows);
      await recordAudit(req, {
        action: "product.import",
        entity: "product",
        meta: { rows: body.rows.length, created: results.filter((r) => r.ok).length }
      });
      res.json({ results });
    };
  }
});

// routes/product.routes.ts
import { Router as Router6 } from "express";
var productRouter, productAdminRouter;
var init_product_routes = __esm({
  "routes/product.routes.ts"() {
    "use strict";
    init_product_controller();
    init_validate_middleware();
    init_product_validators();
    productRouter = Router6();
    productRouter.get("/", validate(listProductsSchemas), listPublicProducts);
    productRouter.get("/suggest", validate(suggestSchemas), suggest);
    productRouter.get("/:slug", validate(productSlugSchemas), getProduct);
    productAdminRouter = Router6();
    productAdminRouter.get("/", validate(adminListProductsSchemas), listAdminProducts);
    productAdminRouter.post("/", validate(createProductSchemas), createProduct);
    productAdminRouter.post("/import", validate(importProductsSchemas), importAdminProducts);
    productAdminRouter.get("/:id", validate(productIdSchemas), getAdminProduct);
    productAdminRouter.put("/:id", validate(updateProductSchemas), updateProduct);
    productAdminRouter.delete("/:id", validate(productIdSchemas), deleteProduct);
  }
});

// models/ShippingZone.ts
import { model as model13, Schema as Schema13 } from "mongoose";
var shippingZoneSchema, ShippingZoneModel;
var init_ShippingZone = __esm({
  "models/ShippingZone.ts"() {
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

// controllers/shipping.controller.ts
var labelFor, listZones, listAllZones, upsertZone, deleteZone;
var init_shipping_controller = __esm({
  "controllers/shipping.controller.ts"() {
    "use strict";
    init_constants();
    init_validate_middleware();
    init_ShippingZone();
    init_audit_service();
    init_ApiError();
    labelFor = (key) => GOVERNORATES.find((g) => g.key === key);
    listZones = async (_req, res) => {
      const zones = await ShippingZoneModel.find({ isActive: true }).lean();
      res.json({
        items: zones.map((z18) => ({
          governorate: z18.governorate,
          name: labelFor(z18.governorate) ?? { ar: z18.governorate, en: z18.governorate },
          fee: z18.fee,
          estimatedDays: z18.estimatedDays
        })).sort((a, b) => a.name.en.localeCompare(b.name.en))
      });
    };
    listAllZones = async (_req, res) => {
      res.json({ items: await ShippingZoneModel.find().sort({ governorate: 1 }).lean() });
    };
    upsertZone = async (req, res) => {
      const { params, body } = validated(req);
      const zone = await ShippingZoneModel.findOneAndUpdate(
        { governorate: params.governorate },
        { $set: body },
        { upsert: true, returnDocument: "after", runValidators: true }
      );
      await recordAudit(req, { action: "shipping.upsert", entity: "shipping_zone", entityId: params.governorate, meta: body });
      res.json({ zone });
    };
    deleteZone = async (req, res) => {
      const { params } = validated(req);
      if (!await ShippingZoneModel.findOneAndDelete({ governorate: params.governorate })) {
        throw ApiError.notFound("Shipping zone");
      }
      await recordAudit(req, { action: "shipping.delete", entity: "shipping_zone", entityId: params.governorate });
      res.status(204).end();
    };
  }
});

// validators/shipping.validators.ts
import { z as z13 } from "zod";
var upsertZoneSchemas, zoneKeySchemas;
var init_shipping_validators = __esm({
  "validators/shipping.validators.ts"() {
    "use strict";
    init_constants();
    init_common_validators();
    upsertZoneSchemas = {
      params: z13.object({ governorate: z13.enum(GOVERNORATE_KEYS) }),
      body: z13.object({
        fee: piastersSchema,
        estimatedDays: z13.object({ min: z13.number().int().min(0).max(30), max: z13.number().int().min(0).max(30) }),
        isActive: z13.boolean().default(true)
      }).refine((b) => b.estimatedDays.min <= b.estimatedDays.max, { message: "min must be \u2264 max" })
    };
    zoneKeySchemas = { params: upsertZoneSchemas.params };
  }
});

// routes/shipping.routes.ts
import { Router as Router7 } from "express";
var shippingRouter, shippingAdminRouter;
var init_shipping_routes = __esm({
  "routes/shipping.routes.ts"() {
    "use strict";
    init_shipping_controller();
    init_validate_middleware();
    init_shipping_validators();
    shippingRouter = Router7();
    shippingRouter.get("/zones", listZones);
    shippingAdminRouter = Router7();
    shippingAdminRouter.get("/", listAllZones);
    shippingAdminRouter.put("/:governorate", validate(upsertZoneSchemas), upsertZone);
    shippingAdminRouter.delete("/:governorate", validate(zoneKeySchemas), deleteZone);
  }
});

// routes/admin.routes.ts
import { Router as Router8 } from "express";
var adminRouter;
var init_admin_routes = __esm({
  "routes/admin.routes.ts"() {
    "use strict";
    init_admin_controller();
    init_auth_middleware();
    init_validate_middleware();
    init_admin_validators();
    init_brand_routes();
    init_category_routes();
    init_collection_routes();
    init_coupon_routes();
    init_product_routes();
    init_shipping_routes();
    adminRouter = Router8();
    adminRouter.use(authenticate, requireRole("admin", "demo_admin"));
    adminRouter.use(denyDemoWrites);
    adminRouter.get("/dashboard", getDashboard);
    adminRouter.use("/products", productAdminRouter);
    adminRouter.use("/categories", categoryAdminRouter);
    adminRouter.use("/brands", brandAdminRouter);
    adminRouter.use("/collections", collectionAdminRouter);
    adminRouter.use("/coupons", couponAdminRouter);
    adminRouter.use("/shipping-zones", shippingAdminRouter);
    adminRouter.get("/orders", validate(adminListOrdersSchemas), listOrders);
    adminRouter.get("/orders/new-count", validate(newOrdersSchemas), getNewOrdersCount);
    adminRouter.get("/orders/:id", validate(adminOrderIdSchemas), getOrder);
    adminRouter.post("/orders/:id/transition", validate(transitionOrderSchemas), transition);
    adminRouter.post("/inventory/adjust", validate(adjustStockSchemas), adjustStock);
    adminRouter.get("/inventory/logs", validate(inventoryLogsSchemas), getInventoryLogs);
    adminRouter.get("/customers", validate(listCustomersSchemas), listCustomers);
    adminRouter.get("/customers/:id", validate(customerIdSchemas), getCustomer);
    adminRouter.patch("/customers/:id/status", validate(customerStatusSchemas), setCustomerStatus);
    adminRouter.get("/audit-logs", validate(auditLogsSchemas), getAuditLogs);
    adminRouter.post("/uploads/sign", signUpload);
  }
});

// middleware/rateLimit.middleware.ts
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
      throw ApiError.tooManyRequests(result.retryAfterSeconds);
    }
    next();
  };
}
var MemoryRateLimiter, UpstashRateLimiter, redis, getRedis, hasUpstash, memoryLimiters;
var init_rateLimit_middleware = __esm({
  "middleware/rateLimit.middleware.ts"() {
    "use strict";
    init_env();
    init_ApiError();
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

// utils/userDto.ts
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
var init_userDto = __esm({
  "utils/userDto.ts"() {
    "use strict";
  }
});

// utils/crypto.ts
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
  "utils/crypto.ts"() {
    "use strict";
  }
});

// models/AuthToken.ts
import { model as model14, Schema as Schema14 } from "mongoose";
var AUTH_TOKEN_TYPES, authTokenSchema, AuthTokenModel;
var init_AuthToken = __esm({
  "models/AuthToken.ts"() {
    "use strict";
    AUTH_TOKEN_TYPES = ["email_verification", "password_reset"];
    authTokenSchema = new Schema14(
      {
        userId: { type: Schema14.Types.ObjectId, ref: "User", required: true, index: true },
        type: { type: String, enum: AUTH_TOKEN_TYPES, required: true },
        tokenHash: { type: String, required: true, unique: true },
        expiresAt: { type: Date, required: true },
        usedAt: Date
      },
      { timestamps: { createdAt: true, updatedAt: false } }
    );
    authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    AuthTokenModel = model14("AuthToken", authTokenSchema);
  }
});

// services/auth.service.ts
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
  if (!consumed) throw ApiError.badRequest("This link is invalid or has expired");
  return consumed.userId;
}
function assertCanSignIn(user) {
  if (user.status === "banned") throw new ApiError(403, "ACCOUNT_BANNED", "This account has been suspended");
}
var EMAIL_VERIFICATION_TTL_MS, PASSWORD_RESET_TTL_MS, DAY_MS, DUMMY_HASH, hashPassword, authService;
var init_auth_service = __esm({
  "services/auth.service.ts"() {
    "use strict";
    init_env();
    init_crypto();
    init_ApiError();
    init_logger();
    init_notification_service();
    init_userDto();
    init_User();
    init_AuthToken();
    init_Session();
    init_token_service();
    EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1e3;
    PASSWORD_RESET_TTL_MS = 15 * 60 * 1e3;
    DAY_MS = 24 * 60 * 60 * 1e3;
    DUMMY_HASH = bcrypt.hashSync("not-a-real-password", env.BCRYPT_COST);
    hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_COST);
    authService = {
      async register(input, meta2) {
        if (await UserModel.exists({ email: input.email })) {
          throw ApiError.conflict("An account with this e-mail already exists", "EMAIL_TAKEN");
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
            throw ApiError.conflict("An account with this e-mail already exists", "EMAIL_TAKEN");
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
        if (!user || !user.passwordHash || !valid) throw ApiError.invalidCredentials();
        assertCanSignIn(user);
        user.lastLoginAt = /* @__PURE__ */ new Date();
        await user.save();
        return issueSession(user, meta2);
      },
      async loginWithGoogle(input, meta2) {
        if (!env.GOOGLE_CLIENT_ID) throw ApiError.badRequest("Google sign-in is not configured");
        const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
        let payload;
        try {
          const ticket = await client.verifyIdToken({ idToken: input.credential, audience: env.GOOGLE_CLIENT_ID });
          payload = ticket.getPayload();
        } catch {
          throw ApiError.unauthenticated("Invalid Google credential");
        }
        if (!payload?.sub || !payload.email || !payload.email_verified) {
          throw ApiError.unauthenticated("Google account e-mail is not verified");
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
        if (!rawToken) throw ApiError.unauthenticated("Missing refresh token");
        const session = await SessionModel.findOne({ refreshTokenHash: sha256(rawToken) });
        if (!session) throw ApiError.unauthenticated("Invalid refresh token");
        const reuse = () => this.handleReuse(session.family, session.userId);
        if (session.rotatedAt) return reuse();
        if (session.revokedAt || session.expiresAt <= /* @__PURE__ */ new Date()) throw ApiError.unauthenticated("Session expired");
        const claimed = await SessionModel.findOneAndUpdate(
          { _id: session._id, rotatedAt: { $exists: false }, revokedAt: { $exists: false } },
          { $set: { rotatedAt: /* @__PURE__ */ new Date() } }
        );
        if (!claimed) return reuse();
        const user = await UserModel.findById(session.userId);
        if (!user || user.status === "banned") {
          await SessionModel.updateMany({ family: session.family }, { $set: { revokedAt: /* @__PURE__ */ new Date() } });
          throw ApiError.unauthenticated("Session no longer valid");
        }
        return issueSession(user, meta2, session.family);
      },
      async handleReuse(family, userId) {
        await SessionModel.updateMany({ family, revokedAt: { $exists: false } }, { $set: { revokedAt: /* @__PURE__ */ new Date() } });
        logger.warn({ family, userId: String(userId) }, "refresh token reuse detected \u2014 session family revoked");
        throw new ApiError(401, "TOKEN_REUSE_DETECTED", "Refresh token reuse detected. Please sign in again.");
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

// controllers/auth.controller.ts
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
  "controllers/auth.controller.ts"() {
    "use strict";
    init_env();
    init_auth_middleware();
    init_validate_middleware();
    init_User();
    init_userDto();
    init_ApiError();
    init_auth_service();
    REFRESH_COOKIE = "rt";
    REFRESH_COOKIE_PATH = "/api/auth";
    meta = (req) => ({
      ...req.get("user-agent") ? { userAgent: req.get("user-agent") } : {},
      ...req.ip ? { ip: req.ip } : {}
    });
    clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: isProduction, sameSite: "lax", path: REFRESH_COOKIE_PATH });
    register = async (req, res) => {
      const { body } = validated(req);
      respondWithSession(res, await authService.register(body, meta(req)), 201);
    };
    login = async (req, res) => {
      const { body } = validated(req);
      respondWithSession(res, await authService.login(body, meta(req)));
    };
    google = async (req, res) => {
      const { body } = validated(req);
      respondWithSession(res, await authService.loginWithGoogle(body, meta(req)));
    };
    refresh = async (req, res) => {
      try {
        respondWithSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE], meta(req)));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) clearRefreshCookie(res);
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
      const { body } = validated(req);
      await authService.verifyEmail(body.token);
      res.status(204).end();
    };
    resendVerification = async (req, res) => {
      await authService.resendVerification(currentUserId(req));
      res.status(204).end();
    };
    forgotPassword = async (req, res) => {
      const { body } = validated(req);
      await authService.forgotPassword(body.email);
      res.status(202).json({ message: "If an account exists for this e-mail, a reset link was sent." });
    };
    resetPassword = async (req, res) => {
      const { body } = validated(req);
      await authService.resetPassword(body.token, body.password);
      clearRefreshCookie(res);
      res.status(204).end();
    };
    me = async (req, res) => {
      const user = await UserModel.findById(currentUserId(req));
      if (!user) throw ApiError.unauthenticated();
      res.json({ user: toPublicUser(user) });
    };
  }
});

// routes/auth.routes.ts
import { Router as Router9 } from "express";
var authRouter, byEmail;
var init_auth_routes = __esm({
  "routes/auth.routes.ts"() {
    "use strict";
    init_auth_middleware();
    init_rateLimit_middleware();
    init_validate_middleware();
    init_auth_controller();
    init_auth_validators();
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

// services/optionLabels.service.ts
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
var init_optionLabels_service = __esm({
  "services/optionLabels.service.ts"() {
    "use strict";
    init_Category();
    init_category_service();
  }
});

// models/Cart.ts
import { model as model15, Schema as Schema15 } from "mongoose";
var cartSchema, CartModel;
var init_Cart = __esm({
  "models/Cart.ts"() {
    "use strict";
    cartSchema = new Schema15(
      {
        userId: { type: Schema15.Types.ObjectId, ref: "User", required: true, unique: true },
        items: {
          type: [
            new Schema15(
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
    CartModel = model15("Cart", cartSchema);
  }
});

// services/cart.service.ts
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
  if (!variant) throw ApiError.unprocessable("PRODUCT_UNAVAILABLE", "This product is no longer available", { sku });
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
  "services/cart.service.ts"() {
    "use strict";
    init_ApiError();
    init_objectId();
    init_optionLabels_service();
    init_Product();
    init_Cart();
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
        if (target > MAX_QTY_PER_LINE) throw ApiError.badRequest(`Maximum ${MAX_QTY_PER_LINE} units per item`);
        if (target > stock) {
          throw ApiError.conflict(`Only ${stock} unit(s) available`, "INSUFFICIENT_STOCK", { sku, available: stock });
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

// controllers/cart.controller.ts
var previewCart, getCart, addItem, setItemQty, removeItem, clearCart, mergeCart, acknowledgePrices;
var init_cart_controller = __esm({
  "controllers/cart.controller.ts"() {
    "use strict";
    init_auth_middleware();
    init_validate_middleware();
    init_cart_service();
    previewCart = async (req, res) => {
      const { body } = validated(req);
      res.json({ cart: await cartService.preview(body.items) });
    };
    getCart = async (req, res) => {
      res.json({ cart: await cartService.get(currentUserId(req)) });
    };
    addItem = async (req, res) => {
      const { body } = validated(req);
      res.status(201).json({ cart: await cartService.setItem(currentUserId(req), body.sku, body.qty, "add") });
    };
    setItemQty = async (req, res) => {
      const { params, body } = validated(req);
      res.json({ cart: await cartService.setItem(currentUserId(req), params.sku, body.qty, "set") });
    };
    removeItem = async (req, res) => {
      const { params } = validated(req);
      res.json({ cart: await cartService.removeItem(currentUserId(req), params.sku) });
    };
    clearCart = async (req, res) => {
      await cartService.clear(currentUserId(req));
      res.status(204).end();
    };
    mergeCart = async (req, res) => {
      const { body } = validated(req);
      res.json({ cart: await cartService.merge(currentUserId(req), body.items) });
    };
    acknowledgePrices = async (req, res) => {
      res.json({ cart: await cartService.acknowledgePrices(currentUserId(req)) });
    };
  }
});

// validators/cart.validators.ts
import { z as z14 } from "zod";
var cartItem, addItemSchemas, setQtySchemas, skuParamSchemas, itemsBodySchemas;
var init_cart_validators = __esm({
  "validators/cart.validators.ts"() {
    "use strict";
    init_product_validators();
    cartItem = z14.object({ sku: skuSchema, qty: z14.number().int().min(1).max(99) });
    addItemSchemas = { body: cartItem };
    setQtySchemas = {
      params: z14.object({ sku: skuSchema }),
      body: z14.object({ qty: z14.number().int().min(0).max(99) })
    };
    skuParamSchemas = { params: z14.object({ sku: skuSchema }) };
    itemsBodySchemas = { body: z14.object({ items: z14.array(cartItem).max(50) }) };
  }
});

// routes/cart.routes.ts
import { Router as Router10 } from "express";
var cartRouter;
var init_cart_routes = __esm({
  "routes/cart.routes.ts"() {
    "use strict";
    init_cart_controller();
    init_auth_middleware();
    init_validate_middleware();
    init_cart_validators();
    cartRouter = Router10();
    cartRouter.post("/preview", validate(itemsBodySchemas), previewCart);
    cartRouter.use(authenticate);
    cartRouter.get("/", getCart);
    cartRouter.post("/items", validate(addItemSchemas), addItem);
    cartRouter.patch("/items/:sku", validate(setQtySchemas), setItemQty);
    cartRouter.delete("/items/:sku", validate(skuParamSchemas), removeItem);
    cartRouter.delete("/", clearCart);
    cartRouter.post("/merge", validate(itemsBodySchemas), mergeCart);
    cartRouter.post("/acknowledge-prices", acknowledgePrices);
  }
});

// utils/money.ts
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
  "utils/money.ts"() {
    "use strict";
  }
});

// services/couponRules.service.ts
function reject(reason, extra) {
  throw ApiError.unprocessable("COUPON_INVALID", `Coupon rejected: ${reason}`, { reason, ...extra });
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
var init_couponRules_service = __esm({
  "services/couponRules.service.ts"() {
    "use strict";
    init_ApiError();
    init_money();
  }
});

// services/pricing.service.ts
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
var init_pricing_service = __esm({
  "services/pricing.service.ts"() {
    "use strict";
    init_money();
  }
});

// services/checkout.service.ts
async function requireShippingZone(governorate) {
  const zone = await ShippingZoneModel.findOne({ governorate, isActive: true }).lean();
  if (!zone) {
    throw ApiError.unprocessable("SHIPPING_UNAVAILABLE", "We do not deliver to this governorate yet", { governorate });
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
    if (!address) throw ApiError.notFound("Address");
    governorate = address.governorate;
  }
  const zone = governorate ? await requireShippingZone(governorate) : null;
  let discount = 0;
  let coupon = null;
  if (input.couponCode) {
    const doc = await CouponModel.findOne({ code: input.couponCode.toUpperCase() }).lean();
    try {
      if (!doc) throw ApiError.unprocessable("COUPON_INVALID", "Coupon not found", { reason: "not_found" });
      discount = evaluateCoupon(doc, view.subtotal);
      coupon = { code: doc.code };
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
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
  "services/checkout.service.ts"() {
    "use strict";
    init_env();
    init_ApiError();
    init_cart_service();
    init_Cart();
    init_Coupon();
    init_couponRules_service();
    init_ShippingZone();
    init_User();
    init_pricing_service();
  }
});

// services/payments/providers/cod.provider.ts
var CodProvider;
var init_cod_provider = __esm({
  "services/payments/providers/cod.provider.ts"() {
    "use strict";
    init_ApiError();
    CodProvider = class {
      name = "cod";
      method = "cod";
      enabled = true;
      initialOrderStatus = "pending_confirmation";
      async createPayment() {
        return null;
      }
      verifyWebhook() {
        throw new ApiError(400, "BAD_REQUEST", "Cash on delivery has no webhooks");
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

// services/payments/providers/comingSoon.provider.ts
var ComingSoonProvider;
var init_comingSoon_provider = __esm({
  "services/payments/providers/comingSoon.provider.ts"() {
    "use strict";
    init_ApiError();
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
        throw ApiError.unprocessable("PAYMENT_METHOD_UNAVAILABLE", `${this.name} payments are coming soon`);
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

// services/payments/providers/mock.provider.ts
var MOCK_SIGNATURE_HEADER, MockProvider;
var init_mock_provider = __esm({
  "services/payments/providers/mock.provider.ts"() {
    "use strict";
    init_env();
    init_crypto();
    init_ApiError();
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
          throw new ApiError(401, "INVALID_SIGNATURE", "Invalid webhook signature");
        }
        const payload = JSON.parse(rawBody.toString("utf8"));
        if (!payload.type || !payload.id || !payload.orderNumber || typeof payload.amount !== "number") {
          throw ApiError.badRequest("Malformed webhook payload");
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

// services/payments/payment.registry.ts
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
  "services/payments/payment.registry.ts"() {
    "use strict";
    init_constants();
    init_env();
    init_ApiError();
    init_cod_provider();
    init_comingSoon_provider();
    init_mock_provider();
    providers = buildProviders();
    byMethod = new Map(providers.map((p) => [p.method, p]));
    paymentRegistry = {
      /** Provider for a checkout method; rejects methods that are not live yet ("coming soon"). */
      forMethod(method) {
        const provider = byMethod.get(method);
        if (!provider?.enabled) {
          throw ApiError.unprocessable("PAYMENT_METHOD_UNAVAILABLE", `Payment method "${method}" is not available yet`);
        }
        return provider;
      },
      /** Provider that owns a webhook URL segment, e.g. `/payments/webhooks/mock`. */
      forWebhook(name) {
        const provider = providers.find((p) => p.name === name && p.enabled && p.name !== "cod");
        if (!provider) throw ApiError.notFound("Payment provider");
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

// controllers/checkout.controller.ts
var getPaymentMethods, quote;
var init_checkout_controller = __esm({
  "controllers/checkout.controller.ts"() {
    "use strict";
    init_auth_middleware();
    init_validate_middleware();
    init_checkout_service();
    init_payment_registry();
    getPaymentMethods = (_req, res) => {
      res.json({ items: paymentRegistry.describe() });
    };
    quote = async (req, res) => {
      const { body } = validated(req);
      res.json(await quoteCheckout(currentUserId(req), body));
    };
  }
});

// validators/order.validators.ts
import { z as z15 } from "zod";
var createOrderSchemas, idempotencyKeySchema, listOrdersSchemas, orderNumberSchemas, cancelOrderSchemas, quoteSchemas;
var init_order_validators = __esm({
  "validators/order.validators.ts"() {
    "use strict";
    init_constants();
    init_objectId();
    init_common_validators();
    createOrderSchemas = {
      body: z15.object({
        addressId: objectIdSchema,
        paymentMethod: z15.enum(PAYMENT_METHODS),
        couponCode: z15.string().trim().toUpperCase().max(30).optional(),
        note: z15.string().trim().max(500).optional(),
        expectedTotal: z15.number().int().nonnegative().optional()
      })
    };
    idempotencyKeySchema = z15.string().trim().min(8).max(100);
    listOrdersSchemas = { query: paginationQuery };
    orderNumberSchemas = { params: z15.object({ orderNumber: z15.string().regex(/^ORD-\d{6,}$/) }) };
    cancelOrderSchemas = {
      ...orderNumberSchemas,
      body: z15.object({ reason: z15.string().trim().max(500).optional() })
    };
    quoteSchemas = {
      body: z15.object({
        addressId: objectIdSchema.optional(),
        governorate: z15.string().max(40).optional(),
        couponCode: z15.string().trim().toUpperCase().max(30).optional()
      })
    };
  }
});

// routes/checkout.routes.ts
import { Router as Router11 } from "express";
var checkoutRouter;
var init_checkout_routes = __esm({
  "routes/checkout.routes.ts"() {
    "use strict";
    init_checkout_controller();
    init_auth_middleware();
    init_validate_middleware();
    init_order_validators();
    checkoutRouter = Router11();
    checkoutRouter.get("/payment-methods", getPaymentMethods);
    checkoutRouter.post("/quote", authenticate, validate(quoteSchemas), quote);
  }
});

// services/payments/payment.initiate.ts
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
  "services/payments/payment.initiate.ts"() {
    "use strict";
    init_logger();
    init_Payment();
  }
});

// models/Counter.ts
import { model as model16, Schema as Schema16 } from "mongoose";
async function nextSequence(name) {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  return doc.seq;
}
var counterSchema, CounterModel;
var init_Counter = __esm({
  "models/Counter.ts"() {
    "use strict";
    counterSchema = new Schema16({ _id: String, seq: { type: Number, default: 0 } });
    CounterModel = model16("Counter", counterSchema);
  }
});

// services/order.service.ts
import mongoose5, { Types as Types4 } from "mongoose";
async function createOrder(userId, input) {
  const replay = async () => {
    const existing = await OrderModel.findOne({ userId, idempotencyKey: input.idempotencyKey });
    return existing ? { order: existing, created: false, payment: null } : null;
  };
  const previous = await replay();
  if (previous) return previous;
  const user = await UserModel.findById(userId);
  if (!user) throw ApiError.unauthenticated();
  if (user.status === "banned") throw new ApiError(403, "ACCOUNT_BANNED", "This account has been suspended");
  if (env.REQUIRE_VERIFIED_EMAIL_FOR_ORDERS && !user.emailVerified) {
    throw new ApiError(403, "EMAIL_UNVERIFIED_FOR_ORDER", "Please verify your e-mail before placing an order");
  }
  const address = user.addresses.find((a) => String(a._id) === input.addressId);
  if (!address) throw ApiError.notFound("Address");
  const provider = paymentRegistry.forMethod(input.paymentMethod);
  const cart = await CartModel.findOne({ userId }).lean();
  if (!cart || cart.items.length === 0) throw ApiError.unprocessable("EMPTY_CART", "Your cart is empty");
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
      const items = cart.items.map((cartItem2) => {
        const found = variantBySku.get(cartItem2.sku);
        if (!found) {
          throw ApiError.unprocessable("PRODUCT_UNAVAILABLE", "A product in your cart is no longer available", { sku: cartItem2.sku });
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
          qty: cartItem2.qty,
          lineTotal: variant.price * cartItem2.qty
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
        if (!coupon) throw ApiError.unprocessable("COUPON_INVALID", "Coupon not found", { reason: "not_found" });
        discount = evaluateCoupon(coupon, subtotal);
        const claimed = await CouponModel.updateOne(
          { _id: coupon._id, $or: [{ maxUses: { $exists: false } }, { $expr: { $lt: ["$usedCount", "$maxUses"] } }] },
          { $inc: { usedCount: 1 } },
          { session }
        );
        if (claimed.modifiedCount !== 1) throw ApiError.unprocessable("COUPON_INVALID", "Coupon exhausted", { reason: "exhausted" });
        couponCode = coupon.code;
      }
      const totals = calculateTotals({
        lines: items.map((i) => ({ unitPrice: i.unitPrice, qty: i.qty })),
        shippingFee: zone.fee,
        discount
      });
      if (input.expectedTotal !== void 0 && input.expectedTotal !== totals.total) {
        throw ApiError.conflict("Prices changed since you last viewed your cart", "PRICE_CHANGED", {
          expected: input.expectedTotal,
          actual: totals.total
        });
      }
      if (provider.method === "cod" && totals.total > env.COD_MAX_AMOUNT) {
        throw ApiError.unprocessable("COD_LIMIT_EXCEEDED", "Order value exceeds the cash-on-delivery limit", {
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
async function listOrdersForUser(userId, query) {
  const filter = { userId };
  const [items, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    OrderModel.countDocuments(filter)
  ]);
  return toPage(items.map((o) => toOrderDto(o, "customer")), total, query);
}
async function getOrderForUser(userId, orderNumber) {
  const order = await OrderModel.findOne({ orderNumber, userId }).lean();
  if (!order) throw ApiError.notFound("Order");
  return toOrderDto(order, "customer");
}
async function cancelOrderForUser(userId, orderNumber, reason) {
  const order = await OrderModel.findOne({ orderNumber, userId }).select("_id");
  if (!order) throw ApiError.notFound("Order");
  const updated = await transitionOrder({
    orderId: order.id,
    to: "cancelled",
    actor: "customer",
    byUserId: userId,
    ownerId: userId,
    ...reason ? { note: reason } : {}
  });
  return toOrderDto(updated, "customer");
}
var isIdempotencyConflict;
var init_order_service = __esm({
  "services/order.service.ts"() {
    "use strict";
    init_env();
    init_ApiError();
    init_Cart();
    init_optionLabels_service();
    init_Coupon();
    init_couponRules_service();
    init_inventory_service();
    init_notification_service();
    init_payment_initiate();
    init_payment_registry();
    init_Product();
    init_User();
    init_checkout_service();
    init_Counter();
    init_Order();
    init_orderTransitions_service();
    init_pricing_service();
    init_orderDto();
    init_common_validators();
    isIdempotencyConflict = (error) => error?.code === 11e3 && JSON.stringify(error.keyPattern ?? {}).includes("idempotencyKey");
  }
});

// controllers/order.controller.ts
var placeOrder, listMyOrders, getMyOrder, cancelMyOrder;
var init_order_controller = __esm({
  "controllers/order.controller.ts"() {
    "use strict";
    init_auth_middleware();
    init_validate_middleware();
    init_order_service();
    init_ApiError();
    init_orderDto();
    init_order_validators();
    placeOrder = async (req, res) => {
      const { body } = validated(req);
      const key = idempotencyKeySchema.safeParse(req.get("idempotency-key"));
      if (!key.success) throw ApiError.badRequest('An "Idempotency-Key" header (8\u2013100 chars) is required');
      const result = await createOrder(currentUserId(req), { ...body, idempotencyKey: key.data });
      res.status(result.created ? 201 : 200).json({
        order: toOrderDto(result.order, "customer"),
        payment: result.payment,
        replayed: !result.created
      });
    };
    listMyOrders = async (req, res) => {
      const { query } = validated(req);
      res.json(await listOrdersForUser(currentUserId(req), query));
    };
    getMyOrder = async (req, res) => {
      const { params } = validated(req);
      res.json({ order: await getOrderForUser(currentUserId(req), params.orderNumber) });
    };
    cancelMyOrder = async (req, res) => {
      const { params, body } = validated(req);
      res.json({ order: await cancelOrderForUser(currentUserId(req), params.orderNumber, body.reason) });
    };
  }
});

// routes/order.routes.ts
import { Router as Router12 } from "express";
var orderRouter;
var init_order_routes = __esm({
  "routes/order.routes.ts"() {
    "use strict";
    init_order_controller();
    init_auth_middleware();
    init_rateLimit_middleware();
    init_validate_middleware();
    init_order_validators();
    orderRouter = Router12();
    orderRouter.use(authenticate);
    orderRouter.post("/", rateLimit({ name: "orders:create", requests: 20, windowSeconds: 600 }), validate(createOrderSchemas), placeOrder);
    orderRouter.get("/", validate(listOrdersSchemas), listMyOrders);
    orderRouter.get("/:orderNumber", validate(orderNumberSchemas), getMyOrder);
    orderRouter.post("/:orderNumber/cancel", validate(cancelOrderSchemas), cancelMyOrder);
  }
});

// models/PaymentEvent.ts
import { model as model17, Schema as Schema17 } from "mongoose";
var WEBHOOK_OUTCOMES, paymentEventSchema, PaymentEventModel;
var init_PaymentEvent = __esm({
  "models/PaymentEvent.ts"() {
    "use strict";
    WEBHOOK_OUTCOMES = [
      "processed",
      "duplicate",
      "invalid_signature",
      "amount_mismatch",
      "unknown_payment",
      "order_not_payable",
      "ignored"
    ];
    paymentEventSchema = new Schema17({
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
    PaymentEventModel = model17("PaymentEvent", paymentEventSchema, "payment_events");
  }
});

// services/payments/payment.webhook.ts
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
    if (error instanceof ApiError && error.code === "INVALID_TRANSITION") {
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
  "services/payments/payment.webhook.ts"() {
    "use strict";
    init_logger();
    init_ApiError();
    init_Order();
    init_orderTransitions_service();
    init_Payment();
    init_PaymentEvent();
  }
});

// controllers/payment.controller.ts
var receiveWebhook;
var init_payment_controller = __esm({
  "controllers/payment.controller.ts"() {
    "use strict";
    init_payment_registry();
    init_payment_webhook();
    init_ApiError();
    receiveWebhook = async (req, res) => {
      const provider = paymentRegistry.forWebhook(String(req.params["provider"]));
      if (!req.rawBody) throw ApiError.badRequest("Missing request body");
      const result = await handleWebhook(provider, req.headers, req.rawBody);
      res.status(200).json({ received: true, outcome: result.outcome });
    };
  }
});

// routes/payment.routes.ts
import { Router as Router13 } from "express";
var paymentRouter;
var init_payment_routes = __esm({
  "routes/payment.routes.ts"() {
    "use strict";
    init_payment_controller();
    paymentRouter = Router13();
    paymentRouter.post("/webhooks/:provider", receiveWebhook);
  }
});

// services/review.service.ts
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
var hasDeliveredPurchase, publicName, reviewService;
var init_review_service = __esm({
  "services/review.service.ts"() {
    "use strict";
    init_Order();
    init_Product();
    init_Review();
    init_User();
    init_ApiError();
    init_objectId();
    init_common_validators();
    hasDeliveredPurchase = (userId, productId) => OrderModel.exists({ userId, status: "delivered", "items.productId": toObjectId(productId) });
    publicName = (name) => {
      const [first = "", last] = name.trim().split(/\s+/);
      return last ? `${first} ${last[0]}.` : first;
    };
    reviewService = {
      async list(productId, query) {
        const filter = { productId: toObjectId(productId) };
        const [reviews, total] = await Promise.all([
          ReviewModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
          ReviewModel.countDocuments(filter)
        ]);
        const users = await UserModel.find({ _id: { $in: reviews.map((r) => r.userId) } }).select("name").lean();
        const names = new Map(users.map((u) => [String(u._id), u.name]));
        return toPage(
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
        );
      },
      async eligibility(userId, productId) {
        const [purchased, existing] = await Promise.all([
          hasDeliveredPurchase(userId, productId),
          ReviewModel.exists({ productId, userId })
        ]);
        return { canReview: Boolean(purchased) && !existing, alreadyReviewed: Boolean(existing) };
      },
      async create(userId, input) {
        if (!await hasDeliveredPurchase(userId, input.productId)) {
          throw ApiError.forbidden("Only customers who received this product can review it");
        }
        const review = await ReviewModel.create({ ...input, userId: toObjectId(userId), verifiedPurchase: true });
        await recomputeRating(input.productId);
        return review;
      }
    };
  }
});

// controllers/review.controller.ts
var listReviews, getEligibility, createReview;
var init_review_controller = __esm({
  "controllers/review.controller.ts"() {
    "use strict";
    init_auth_middleware();
    init_validate_middleware();
    init_review_service();
    listReviews = async (req, res) => {
      const { query } = validated(req);
      res.json(await reviewService.list(query.productId, query));
    };
    getEligibility = async (req, res) => {
      const { params } = validated(req);
      res.json(await reviewService.eligibility(currentUserId(req), params.productId));
    };
    createReview = async (req, res) => {
      const { body } = validated(req);
      const review = await reviewService.create(currentUserId(req), body);
      res.status(201).json({ id: review.id });
    };
  }
});

// validators/review.validators.ts
import { z as z16 } from "zod";
var listReviewsSchemas, createReviewSchemas, eligibilitySchemas;
var init_review_validators = __esm({
  "validators/review.validators.ts"() {
    "use strict";
    init_objectId();
    init_common_validators();
    listReviewsSchemas = { query: paginationQuery.extend({ productId: objectIdSchema }) };
    createReviewSchemas = {
      body: z16.object({
        productId: objectIdSchema,
        rating: z16.number().int().min(1).max(5),
        title: z16.string().trim().max(120).optional(),
        comment: z16.string().trim().min(3).max(2e3)
      })
    };
    eligibilitySchemas = { params: z16.object({ productId: objectIdSchema }) };
  }
});

// routes/review.routes.ts
import { Router as Router14 } from "express";
var reviewRouter;
var init_review_routes = __esm({
  "routes/review.routes.ts"() {
    "use strict";
    init_review_controller();
    init_auth_middleware();
    init_validate_middleware();
    init_review_validators();
    reviewRouter = Router14();
    reviewRouter.get("/", validate(listReviewsSchemas), listReviews);
    reviewRouter.get("/eligibility/:productId", authenticate, validate(eligibilitySchemas), getEligibility);
    reviewRouter.post("/", authenticate, validate(createReviewSchemas), createReview);
  }
});

// services/user.service.ts
var userService;
var init_user_service = __esm({
  "services/user.service.ts"() {
    "use strict";
    init_Product();
    init_User();
    init_ApiError();
    init_userDto();
    init_productQuery_service();
    userService = {
      async getById(userId) {
        const user = await UserModel.findById(userId);
        if (!user) throw ApiError.unauthenticated();
        return user;
      },
      /** Account snapshot returned by every profile endpoint. */
      toProfile(user) {
        return { user: toPublicUser(user), addresses: user.addresses, wishlist: user.wishlist.map(String) };
      },
      async updateProfile(userId, patch) {
        const user = await this.getById(userId);
        if (patch.name) user.name = patch.name;
        if (patch.locale) user.locale = patch.locale;
        await user.save();
        return user;
      },
      // ── addresses ──────────────────────────────────────────────────────────────
      async addAddress(userId, input) {
        const user = await this.getById(userId);
        const makeDefault = input.isDefault || user.addresses.length === 0;
        if (makeDefault) user.addresses.forEach((a) => a.isDefault = false);
        user.addresses.push({ ...input, isDefault: makeDefault });
        await user.save();
        return user;
      },
      async updateAddress(userId, addressId, input) {
        const user = await this.getById(userId);
        const address = user.addresses.find((a) => String(a._id) === addressId);
        if (!address) throw ApiError.notFound("Address");
        if (input.isDefault) user.addresses.forEach((a) => a.isDefault = false);
        Object.assign(address, input);
        await user.save();
        return user;
      },
      async removeAddress(userId, addressId) {
        const user = await this.getById(userId);
        const remaining = user.addresses.filter((a) => String(a._id) !== addressId);
        if (remaining.length === user.addresses.length) throw ApiError.notFound("Address");
        if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) remaining[0].isDefault = true;
        user.set("addresses", remaining);
        await user.save();
        return user;
      },
      // ── wishlist ───────────────────────────────────────────────────────────────
      async getWishlist(userId) {
        const user = await this.getById(userId);
        const rows = await ProductModel.aggregate([
          { $match: { _id: { $in: user.wishlist }, status: "published" } },
          { $project: CARD_PROJECTION }
        ]);
        const order = new Map(user.wishlist.map((id, index) => [String(id), index]));
        return rows.map(toCard).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      },
      async addToWishlist(userId, productId) {
        if (!await ProductModel.exists({ _id: productId })) throw ApiError.notFound("Product");
        await UserModel.updateOne({ _id: userId }, { $addToSet: { wishlist: productId } });
      },
      async removeFromWishlist(userId, productId) {
        await UserModel.updateOne({ _id: userId }, { $pull: { wishlist: productId } });
      }
    };
  }
});

// controllers/user.controller.ts
var getProfile, updateProfile, addAddress, updateAddress, deleteAddress, getWishlist, addToWishlist, removeFromWishlist;
var init_user_controller = __esm({
  "controllers/user.controller.ts"() {
    "use strict";
    init_auth_middleware();
    init_validate_middleware();
    init_user_service();
    getProfile = async (req, res) => {
      res.json(userService.toProfile(await userService.getById(currentUserId(req))));
    };
    updateProfile = async (req, res) => {
      const { body } = validated(req);
      res.json(userService.toProfile(await userService.updateProfile(currentUserId(req), body)));
    };
    addAddress = async (req, res) => {
      const { body } = validated(req);
      res.status(201).json(userService.toProfile(await userService.addAddress(currentUserId(req), body)));
    };
    updateAddress = async (req, res) => {
      const { params, body } = validated(req);
      res.json(userService.toProfile(await userService.updateAddress(currentUserId(req), params.addressId, body)));
    };
    deleteAddress = async (req, res) => {
      const { params } = validated(req);
      res.json(userService.toProfile(await userService.removeAddress(currentUserId(req), params.addressId)));
    };
    getWishlist = async (req, res) => {
      res.json({ items: await userService.getWishlist(currentUserId(req)) });
    };
    addToWishlist = async (req, res) => {
      const { params } = validated(req);
      await userService.addToWishlist(currentUserId(req), params.productId);
      res.status(204).end();
    };
    removeFromWishlist = async (req, res) => {
      const { params } = validated(req);
      await userService.removeFromWishlist(currentUserId(req), params.productId);
      res.status(204).end();
    };
  }
});

// validators/user.validators.ts
import { z as z17 } from "zod";
var addressBody, updateProfileSchemas, addAddressSchemas, updateAddressSchemas, addressIdSchemas, wishlistSchemas;
var init_user_validators = __esm({
  "validators/user.validators.ts"() {
    "use strict";
    init_constants();
    init_objectId();
    init_common_validators();
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
    updateProfileSchemas = {
      body: z17.object({ name: z17.string().trim().min(2).max(120).optional(), locale: z17.enum(["ar", "en"]).optional() })
    };
    addAddressSchemas = { body: addressBody };
    updateAddressSchemas = { params: z17.object({ addressId: objectIdSchema }), body: addressBody };
    addressIdSchemas = { params: z17.object({ addressId: objectIdSchema }) };
    wishlistSchemas = { params: z17.object({ productId: objectIdSchema }) };
  }
});

// routes/user.routes.ts
import { Router as Router15 } from "express";
var userRouter;
var init_user_routes = __esm({
  "routes/user.routes.ts"() {
    "use strict";
    init_user_controller();
    init_auth_middleware();
    init_validate_middleware();
    init_user_validators();
    userRouter = Router15();
    userRouter.use(authenticate);
    userRouter.get("/me", getProfile);
    userRouter.patch("/me", validate(updateProfileSchemas), updateProfile);
    userRouter.post("/me/addresses", validate(addAddressSchemas), addAddress);
    userRouter.put("/me/addresses/:addressId", validate(updateAddressSchemas), updateAddress);
    userRouter.delete("/me/addresses/:addressId", validate(addressIdSchemas), deleteAddress);
    userRouter.get("/me/wishlist", getWishlist);
    userRouter.put("/me/wishlist/:productId", validate(wishlistSchemas), addToWishlist);
    userRouter.delete("/me/wishlist/:productId", validate(wishlistSchemas), removeFromWishlist);
  }
});

// routes/index.ts
import { Router as Router16 } from "express";
var apiRouter;
var init_routes = __esm({
  "routes/index.ts"() {
    "use strict";
    init_health_controller();
    init_admin_routes();
    init_auth_routes();
    init_brand_routes();
    init_cart_routes();
    init_category_routes();
    init_collection_routes();
    init_checkout_routes();
    init_order_routes();
    init_payment_routes();
    init_product_routes();
    init_review_routes();
    init_shipping_routes();
    init_user_routes();
    apiRouter = Router16();
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

// app.ts
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
  "app.ts"() {
    "use strict";
    init_env();
    init_health_controller();
    init_error_middleware();
    init_sanitize_middleware();
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

// handler.ts
var handler;
try {
  const { createApp: createApp2 } = await Promise.resolve().then(() => (init_app(), app_exports));
  handler = createApp2();
} catch (error) {
  console.error("API failed to start:", error);
  const isConfigError = error instanceof Error && error.message.startsWith("Invalid environment configuration");
  const body = JSON.stringify({
    error: {
      code: "STARTUP_FAILED",
      message: isConfigError ? error.message : "The API failed to start. Check the function logs."
    }
  });
  handler = (_req, res) => {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(body);
  };
}
var handler_default = handler;
export {
  handler_default as default
};
