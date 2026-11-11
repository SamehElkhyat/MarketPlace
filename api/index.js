/**
 * Vercel Function entry (committed, hand-written, tiny).
 *
 * The real app is the pre-bundled `_app.js` (built by `npm run build`, also committed so deploys never depend on
 * Vercel auto-detecting a framework). It is imported LAZILY inside try/catch, so ANY startup failure — a missing
 * module, a bad environment variable, an ESM/CJS mismatch — is answered as readable JSON instead of Vercel's
 * generic "FUNCTION_INVOCATION_FAILED" page. Secrets are never printed: only the error's first line.
 */
let loading;

async function load() {
  const { default: handler } = await import('./_app.js');
  return handler;
}

export default async function vercelHandler(req, res) {
  try {
    loading ??= load();
    const handler = await loading;
    return handler(req, res);
  } catch (error) {
    loading = undefined; // retry on the next request
    console.error('API failed to start:', error);
    const message = String(error?.message ?? error).split('\n').slice(0, 6).join('\n').slice(0, 500);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'STARTUP_FAILED', name: error?.name, message } }));
  }
}
