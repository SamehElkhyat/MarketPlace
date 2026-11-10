import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrap, type Harness } from '../helpers/harness';

let h: Harness;
beforeAll(async () => {
  h = await bootstrap();
});
afterAll(() => h.stop());
beforeEach(() => h.reset());

const creds = { name: 'Sara Ahmed', email: 'sara@example.com', password: 'Passw0rd!x' };

describe('registration & login', () => {
  it('registers, sets an httpOnly refresh cookie scoped to /api/auth, and e-mails a verification link', async () => {
    const res = await h.http().post('/api/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: creds.email, role: 'customer', emailVerified: false });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body).not.toHaveProperty('refreshToken');

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/i);

    await new Promise((r) => setTimeout(r, 50));
    expect(h.outbox().at(-1)).toMatchObject({ to: creds.email, subject: expect.any(String) });
    expect(h.outbox().at(-1)!.text).toMatch(/verify-email\?token=/);
  });

  it('rejects duplicate e-mails and weak passwords', async () => {
    await h.http().post('/api/auth/register').send(creds);
    const dup = await h.http().post('/api/auth/register').send(creds);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const weak = await h.http().post('/api/auth/register').send({ ...creds, email: 'x@example.com', password: 'short' });
    expect(weak.status).toBe(422);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with correct credentials only — wrong password and unknown e-mail look identical', async () => {
    await h.http().post('/api/auth/register').send(creds);
    const ok = await h.http().post('/api/auth/login').send({ email: creds.email, password: creds.password });
    expect(ok.status).toBe(200);

    const wrong = await h.http().post('/api/auth/login').send({ email: creds.email, password: 'Wrong-pass1' });
    const unknown = await h.http().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Wrong-pass1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe(unknown.body.error.code);
  });

  it('rate limits repeated failed logins (429 + Retry-After)', async () => {
    await h.http().post('/api/auth/register').send(creds);
    let last;
    for (let i = 0; i < 11; i++) last = await h.http().post('/api/auth/login').send({ email: creds.email, password: 'Wrong-pass1' });
    expect(last!.status).toBe(429);
    expect(last!.headers['retry-after']).toBeDefined();
  });

  it('blocks NoSQL operator injection', async () => {
    const res = await h.http().post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('requires a token for protected routes and rejects garbage tokens', async () => {
    expect((await h.http().get('/api/auth/me')).status).toBe(401);
    expect((await h.http().get('/api/auth/me').set('Authorization', 'Bearer nope')).status).toBe(401);
  });
});

describe('refresh-token rotation with reuse detection', () => {
  it('rotates the refresh token on every refresh', async () => {
    const s = await h.signUp();
    const r1 = await h.http().post('/api/auth/refresh').set('Cookie', s.cookie);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTruthy();
    const cookie2 = h.api.cookieFrom(r1);
    expect(cookie2).not.toBe(s.cookie);

    const r2 = await h.http().post('/api/auth/refresh').set('Cookie', cookie2);
    expect(r2.status).toBe(200);
  });

  it('detects a replayed (stolen) token and revokes the whole session family', async () => {
    const s = await h.signUp();
    const r1 = await h.http().post('/api/auth/refresh').set('Cookie', s.cookie);
    const legit = h.api.cookieFrom(r1);

    // attacker replays the ORIGINAL (already rotated) token
    const replay = await h.http().post('/api/auth/refresh').set('Cookie', s.cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // …which also kills the legitimate user's newest token: they must sign in again
    const afterwards = await h.http().post('/api/auth/refresh').set('Cookie', legit);
    expect(afterwards.status).toBe(401);
  });

  it('two simultaneous refreshes with the same token: exactly one wins', async () => {
    const s = await h.signUp();
    const [a, b] = await Promise.all([
      h.http().post('/api/auth/refresh').set('Cookie', s.cookie),
      h.http().post('/api/auth/refresh').set('Cookie', s.cookie),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('logout revokes the token; logout-all revokes every device', async () => {
    const s = await h.signUp();
    await h.http().post('/api/auth/logout').set('Cookie', s.cookie).expect(204);
    expect((await h.http().post('/api/auth/refresh').set('Cookie', s.cookie)).status).toBe(401);

    const login = (await h.http().post('/api/auth/login').send({ email: s.email, password: 'Passw0rd!x' }));
    const deviceA = h.api.cookieFrom(login);
    const login2 = await h.http().post('/api/auth/login').send({ email: s.email, password: 'Passw0rd!x' });
    const deviceB = h.api.cookieFrom(login2);

    await h.http().post('/api/auth/logout-all').set(h.api.authed(login.body.accessToken)).expect(204);
    expect((await h.http().post('/api/auth/refresh').set('Cookie', deviceA)).status).toBe(401);
    expect((await h.http().post('/api/auth/refresh').set('Cookie', deviceB)).status).toBe(401);
  });
});

describe('e-mail verification & password reset', () => {
  const tokenFromEmail = () => /token=([\w-]+)/.exec(h.outbox().at(-1)!.text)![1]!;

  it('verifies the e-mail with a single-use link', async () => {
    const s = await h.signUp();
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenFromEmail();

    await h.http().post('/api/auth/verify-email').send({ token }).expect(204);
    expect((await h.http().get('/api/auth/me').set(h.api.authed(s.token))).body.user.emailVerified).toBe(true);
    await h.http().post('/api/auth/verify-email').send({ token }).expect(400); // already used
  });

  it('forgot-password never reveals whether an e-mail exists', async () => {
    const known = await h.http().post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(known.status).toBe(202);
  });

  it('reset link works once, changes the password and revokes all sessions', async () => {
    const s = await h.signUp();
    await h.http().post('/api/auth/forgot-password').send({ email: s.email }).expect(202);
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenFromEmail();

    await h.http().post('/api/auth/reset-password').send({ token, password: 'NewPassw0rd!' }).expect(204);
    await h.http().post('/api/auth/reset-password').send({ token, password: 'Another1Pass' }).expect(400); // single use

    expect((await h.http().post('/api/auth/refresh').set('Cookie', s.cookie)).status).toBe(401); // old session dead
    expect((await h.http().post('/api/auth/login').send({ email: s.email, password: 'Passw0rd!x' })).status).toBe(401);
    expect((await h.http().post('/api/auth/login').send({ email: s.email, password: 'NewPassw0rd!' })).status).toBe(200);
  });

  it('expired reset links are rejected', async () => {
    const s = await h.signUp();
    await h.http().post('/api/auth/forgot-password').send({ email: s.email });
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenFromEmail();
    const { AuthTokenModel } = await import('../../src/modules/auth/auth.models');
    await AuthTokenModel.updateMany({ type: 'password_reset' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await h.http().post('/api/auth/reset-password').send({ token, password: 'NewPassw0rd!' }).expect(400);
  });
});

describe('RBAC', () => {
  it('customers cannot reach admin endpoints (403); anonymous gets 401', async () => {
    const s = await h.signUp();
    expect((await h.http().get('/api/admin/dashboard').set(h.api.authed(s.token))).status).toBe(403);
    expect((await h.http().get('/api/admin/dashboard')).status).toBe(401);
  });

  it('admins can', async () => {
    const admin = await h.admin();
    expect((await h.http().get('/api/admin/orders').set(h.api.authed(admin.token))).status).toBe(200);
  });

  it('banning a customer revokes their sessions', async () => {
    const admin = await h.admin();
    const s = await h.signUp();
    await h.http().patch(`/api/admin/customers/${s.userId}/status`).set(h.api.authed(admin.token)).send({ status: 'banned' }).expect(200);
    expect((await h.http().post('/api/auth/refresh').set('Cookie', s.cookie)).status).toBe(401);
    const login = await h.http().post('/api/auth/login').send({ email: s.email, password: 'Passw0rd!x' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_BANNED');
  });
});
