# Deploying the API to Vercel

The API ships as **one Vercel Function**:

- `api/index.js` — tiny hand-written entry. It lazily imports the bundle inside `try/catch`, so a startup failure
  (bad env var, missing module…) is answered as readable JSON (`STARTUP_FAILED`) instead of Vercel's generic
  "FUNCTION_INVOCATION_FAILED" page.
- `api/_app.js` — the whole Express app, pre-bundled by esbuild (`npm run build`). **It is committed on purpose** so a
  deploy never depends on Vercel auto-detecting a framework. Run `npm run build` and commit it after changing `src/`
  (Vercel also rebuilds it during deploy).
- `vercel.json` — `"framework": null`, rewrites every path to the function.

## 1. MongoDB Atlas (free M0 is enough)

1. Create a cluster, a database user, and under **Network Access** allow `0.0.0.0/0` (Vercel's egress IPs are not fixed).
2. Copy the **SRV** connection string and put the database name in it:
   `mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net/marketplace?retryWrites=true&w=majority`
   Atlas clusters are replica sets, so the multi-document transactions used for checkout work out of the box.

## 2. Create the indexes — once per environment

Production never auto-builds indexes (keeps cold starts fast), but the app **depends** on them: unique SKUs, unique order
numbers, the `(userId, idempotencyKey)` unique index that stops double orders, TTL on sessions…

```bash
# in /backend, with MONGODB_URI pointing at Atlas (put it in .env or export it)
npm run indexes
```

Optional demo data (refuses to run in production unless you say so):

```bash
NODE_ENV=production npm run seed -- --allow-production
```

## 3. Vercel project

1. **Add New → Project** → import this repo. Framework preset: **Other** (`vercel.json` also pins `framework: null`). Root Directory: `./`
   (build/install commands, the rewrite and the function settings come from `vercel.json`; Node 22 comes from `engines`).
2. **Environment variables** (Production). See `.env.example` for all of them; the required ones are:

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` (enables `Secure` cookies) |
| `MONGODB_URI` | Atlas SRV string from step 1 |
| `JWT_ACCESS_SECRET` | ≥ 32 random chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `APP_URL` | public storefront URL (links inside e-mails) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | **needed in production** — without them rate limits are per-instance only |
| `RESEND_API_KEY`, `EMAIL_FROM` | transactional e-mail (use a domain you verified in Resend) |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | signed image uploads from the admin |
| `REVALIDATE_URL`, `REVALIDATE_SECRET` | `https://<storefront>/revalidate` + the same secret as the storefront |
| `SENTRY_DSN`, `GOOGLE_CLIENT_ID` | optional |

   Leave `PAYMENTS_MOCK_ENABLED=false` so card / wallet / Fawry show as "coming soon".
3. Deploy, then check:
   - `https://<api>.vercel.app/health` → `{"status":"ok","db":"up"}`
   - `https://<api>.vercel.app/api/docs` → Swagger UI

## 4. Connect the storefront

In the **frontend** Vercel project set `BACKEND_URL=https://<api>.vercel.app` (and `REVALIDATE_SECRET`), then redeploy it.
The browser only talks to the storefront domain; Next rewrites `/api/*` to this API, so cookies are first-party and there
is no CORS to configure. Deploy the API **before** the storefront — the storefront build fetches the catalogue.

## Notes & gotchas

- **Rate limiting & client IP.** `TRUST_PROXY=1` assumes one proxy hop. If every user appears to share one IP in logs
  (so limits trigger for everyone), raise it to `2`.
- **Hobby plan** is for personal, non-commercial use; function duration is capped (`vercel.json` asks for 30 s).
- `check-user.ts`, tests and `src/scripts` are excluded from the deployment by `.vercelignore`.
- Never commit `.env` (it is git-ignored). If a secret was ever pasted somewhere public, rotate it.
- Changing a schema's indexes? Run `npm run indexes` again after deploying.

## Troubleshooting

| What you see | Meaning |
|---|---|
| JSON `STARTUP_FAILED … MONGODB_URI …` | an environment variable is missing/invalid — the message names it |
| JSON `STARTUP_FAILED … Cannot find package 'x'` | a runtime dependency isn't in `dependencies` (not `devDependencies`) |
| `/health` → `"db":"down"` | Atlas Network Access doesn't allow Vercel (`0.0.0.0/0`) or the URI/password is wrong |
| Vercel's own "FUNCTION_INVOCATION_FAILED" page | the function crashed before `api/index.js` could answer — open **Deployment → Logs → Runtime Logs** and read the first error |
