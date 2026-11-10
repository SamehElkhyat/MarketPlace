import { env } from '../config/env';
import { logger } from './logger';
import { runInBackground } from './background';

/**
 * Tells the Next.js storefront to purge cached pages (ISR tags) after the catalogue changes.
 * Fire-and-forget after the response; a failure only means pages refresh at their normal revalidate time.
 */
export function revalidateStorefront(tags: string[]): void {
  const { REVALIDATE_URL, REVALIDATE_SECRET } = env;
  if (!REVALIDATE_URL || !REVALIDATE_SECRET) return;

  runInBackground(async () => {
    const response = await fetch(REVALIDATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-secret': REVALIDATE_SECRET },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) logger.warn({ status: response.status, tags }, 'storefront revalidation rejected');
  }, 'revalidate-storefront');
}
