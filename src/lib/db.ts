import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Serverless-safe connection cache.
 *
 * On Vercel every function instance re-evaluates modules; without caching the connection on
 * `globalThis` each cold start would open a new pool and exhaust Atlas' free-tier connection limit.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = globalThis as typeof globalThis & { __mongooseCache?: MongooseCache };
const cache: MongooseCache = (globalForMongoose.__mongooseCache ??= { conn: null, promise: null });

export async function connectDb(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

  cache.promise ??= mongoose
    .connect(uri, {
      // Small pool: each serverless instance handles few concurrent requests.
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8_000,
      autoIndex: env.NODE_ENV !== 'production',
    })
    .then((m) => {
      logger.info('MongoDB connected');
      return m;
    });

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null; // allow retry on the next request
    throw error;
  }
  return cache.conn;
}

export async function disconnectDb(): Promise<void> {
  cache.conn = null;
  cache.promise = null;
  await mongoose.disconnect();
}
