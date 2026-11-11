import { pino } from 'pino';
import { env } from './env';

/** pino-pretty runs in a worker thread that serverless bundles don't trace — only use it on a developer machine. */
const prettyLogs = env.NODE_ENV === 'development' && !process.env['VERCEL'];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  ...(prettyLogs ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } } : {}),
});

export type Logger = typeof logger;
