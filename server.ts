import { createApp } from './app';
import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { logger } from './config/logger';

/**
 * Long-running HTTP server for local development, Docker, or any VM/container host.
 *
 *   npm run dev      (reload on change)
 *   npm start        (single run)
 *
 * On Vercel this file is NOT used — the platform calls the exported handler in `handler.ts` instead,
 * because serverless functions never call `listen()`.
 */
await connectDb();

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}  (docs: /api/docs, health: /health)`);
});

/** Finish in-flight requests and close the database cleanly (Ctrl+C, container stop). */
function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
  // Don't hang forever on stuck connections.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
