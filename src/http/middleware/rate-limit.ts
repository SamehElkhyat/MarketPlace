import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { Request, RequestHandler } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export interface RateLimitResult {
  success: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
}

/** Sliding-window limiter backed by process memory — used in dev/tests when Upstash isn't configured. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly requests: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.requests) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return { success: false, retryAfterSeconds: Math.ceil((oldest + this.windowMs - now) / 1000) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { success: true, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.hits.clear();
  }
}

class UpstashRateLimiter implements RateLimiter {
  constructor(private readonly limiter: Ratelimit) {}

  async consume(key: string): Promise<RateLimitResult> {
    const { success, reset } = await this.limiter.limit(key);
    return { success, retryAfterSeconds: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
  }
}

let redis: Redis | null = null;
const getRedis = () =>
  (redis ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL!,
    token: env.UPSTASH_REDIS_REST_TOKEN!,
  }));

const hasUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

export interface RateLimitOptions {
  /** Unique bucket name, e.g. `auth:login`. */
  name: string;
  requests: number;
  windowSeconds: number;
  /** Extra discriminator appended to the client IP (e.g. the e-mail being attacked). */
  keyBy?: (req: Request) => string | undefined;
}

export const memoryLimiters: MemoryRateLimiter[] = [];

export function resetRateLimits(): void {
  memoryLimiters.forEach((limiter) => limiter.reset());
}

export function rateLimit(rawOptions: RateLimitOptions): RequestHandler {
  const options = { ...rawOptions, requests: rawOptions.requests * env.RATE_LIMIT_SCALE };
  const limiter: RateLimiter = hasUpstash
    ? new UpstashRateLimiter(
        new Ratelimit({
          redis: getRedis(),
          limiter: Ratelimit.slidingWindow(options.requests, `${options.windowSeconds} s`),
          prefix: `rl:${options.name}`,
        }),
      )
    : (() => {
        const memory = new MemoryRateLimiter(options.requests, options.windowSeconds * 1000);
        memoryLimiters.push(memory);
        return memory;
      })();

  return async (req, res, next) => {
    const extra = options.keyBy?.(req);
    const key = `${options.name}:${req.ip ?? 'unknown'}${extra ? `:${extra}` : ''}`;

    let result: RateLimitResult;
    try {
      result = await limiter.consume(key);
    } catch (error) {
      // Fail open: a Redis outage must not take checkout/login down with it.
      logger.error({ err: error, bucket: options.name }, 'rate limiter unavailable — failing open');
      return next();
    }

    if (!result.success) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw AppError.tooManyRequests(result.retryAfterSeconds);
    }
    next();
  };
}
