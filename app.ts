import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { health } from './controllers/health.controller';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { sanitizeInput } from './middleware/sanitize.middleware';
import { connectDb } from './config/db';
import { logger } from './config/logger';
import { attachSentryErrorHandler, initSentry } from './config/sentry';
import { docsRouter } from './routes/docs.routes';
import { apiRouter } from './routes/index';

const WEBHOOK_PREFIX = '/api/payments/webhooks';

/** Lazily opens (and caches) the Mongo connection — cheap no-op once warm. */
const ensureDb: RequestHandler = async (_req, _res, next) => {
  await connectDb();
  next();
};

export function createApp(): Express {
  initSentry();
  const app = express();

  app.disable('x-powered-by');
  // The storefront proxies `/api/*` to this server, so the real client IP arrives in X-Forwarded-For.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      // Every log line of a request carries the same id; it is also returned to the client.
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/api/health' },
    }),
  );
  // No CORS: the browser only ever talks to the storefront origin, which rewrites `/api/*` to this server.
  app.use(helmet());
  app.use(cookieParser());
  app.use(
    express.json({
      limit: '1mb',
      // Webhook signatures are computed over the exact bytes the gateway sent.
      verify: (req, _res, buf) => {
        if (req.url?.startsWith(WEBHOOK_PREFIX)) (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(sanitizeInput);

  app.get('/health', health);
  app.use('/api/docs', docsRouter);
  app.use('/api', ensureDb, apiRouter);

  app.use(notFoundHandler);
  attachSentryErrorHandler(app);
  app.use(errorHandler);

  if (env.NODE_ENV !== 'test') logger.info({ env: env.NODE_ENV }, 'app created');
  return app;
}
