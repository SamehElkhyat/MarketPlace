import * as Sentry from '@sentry/node';
import type { Express } from 'express';
import { env } from './env';

let initialised = false;

export function initSentry(): void {
  if (initialised || !env.SENTRY_DSN) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0.1 });
  initialised = true;
}

/** Must be registered after all routes and before our own error handler. */
export function attachSentryErrorHandler(app: Express): void {
  if (initialised) Sentry.setupExpressErrorHandler(app);
}
