import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Vercel entry point — the default export is the request handler (zero-config Express).
 * The long-running server (local dev, Docker) is `server.ts`, which adds `listen()`.
 *
 * Startup is guarded: if configuration is invalid (typically a missing environment variable on a fresh deploy)
 * the function answers every request with a clear JSON error instead of crashing into Vercel's generic
 * "FUNCTION_INVOCATION_FAILED" page. Only variable NAMES and rules are reported — never values.
 */
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let handler: Handler;

try {
  const { createApp } = await import('./app');
  handler = createApp();
} catch (error) {
  console.error('API failed to start:', error);
  const isConfigError = error instanceof Error && error.message.startsWith('Invalid environment configuration');
  const body = JSON.stringify({
    error: {
      code: 'STARTUP_FAILED',
      message: isConfigError ? (error as Error).message : 'The API failed to start. Check the function logs.',
    },
  });
  // Plain Node API on purpose: this path runs when Express itself could not be created.
  handler = (_req, res) => {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(body);
  };
}

export default handler;
