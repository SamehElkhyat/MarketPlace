import { createApp } from './app';

/**
 * Vercel entry point — the default export is the Express app (zero-config Express deployment).
 * Local development uses `src/dev.ts`, which adds `listen()`.
 */
const app = createApp();

export default app;
