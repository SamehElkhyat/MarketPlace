import { waitUntil } from '@vercel/functions';
import { logger } from './logger';

/**
 * Runs work after the HTTP response is sent (emails, cache revalidation…).
 * On Vercel `waitUntil` keeps the function alive until the promise settles;
 * locally it is simply a detached promise. Failures are logged, never thrown.
 */
export function runInBackground(task: () => Promise<unknown>, label: string): void {
  const promise = Promise.resolve()
    .then(task)
    .catch((error: unknown) => logger.error({ err: error, task: label }, 'background task failed'));
  try {
    waitUntil(promise);
  } catch {
    // Not running inside a Vercel request context — the detached promise is enough.
  }
}
