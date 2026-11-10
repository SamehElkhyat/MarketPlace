import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import type { HydratedDocument, Types } from 'mongoose';
import { env } from '../../config/env';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { notifications } from '../notifications/notification.service';
import { toPublicUser, type PublicUser } from '../users/user.dto';
import { UserModel, type UserAttrs } from '../users/user.model';
import {
  AuthTokenModel,
  SessionModel,
  type AuthTokenType,
} from './auth.models';
import { signAccessToken } from './tokens';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

export interface AuthResult {
  accessToken: string;
  user: PublicUser;
  /** Raw refresh token — goes into the httpOnly cookie only, never into the JSON body. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

type UserDoc = HydratedDocument<UserAttrs>;

/** A real bcrypt hash used to burn equal CPU time when the e-mail doesn't exist (timing side-channel). */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_COST);

const hashPassword = (password: string) => bcrypt.hash(password, env.BCRYPT_COST);

async function issueSession(user: UserDoc, meta: RequestMeta, family: string = randomUUID()): Promise<AuthResult> {
  const refreshToken = randomToken(48);
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

  await SessionModel.create({
    userId: user._id,
    refreshTokenHash: sha256(refreshToken),
    family,
    expiresAt: refreshExpiresAt,
    ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 300) } : {}),
    ...(meta.ip ? { ip: meta.ip } : {}),
  });

  const accessToken = await signAccessToken({ userId: user.id as string, role: user.role });
  return { accessToken, refreshToken, refreshExpiresAt, user: toPublicUser(user) };
}

async function issueAuthToken(userId: Types.ObjectId, type: AuthTokenType, ttlMs: number): Promise<string> {
  const token = randomToken(32);
  await AuthTokenModel.create({ userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** One-time token consumption: the atomic `usedAt` update means a link can never be used twice. */
async function consumeAuthToken(token: string, type: AuthTokenType): Promise<Types.ObjectId> {
  const consumed = await AuthTokenModel.findOneAndUpdate(
    { tokenHash: sha256(token), type, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
  );
  if (!consumed) throw AppError.badRequest('This link is invalid or has expired');
  return consumed.userId;
}

function assertCanSignIn(user: UserDoc): void {
  if (user.status === 'banned') throw new AppError(403, 'ACCOUNT_BANNED', 'This account has been suspended');
}

export const authService = {
  async register(
    input: { name: string; email: string; password: string; locale: 'ar' | 'en' },
    meta: RequestMeta,
  ): Promise<AuthResult> {
    if (await UserModel.exists({ email: input.email })) {
      throw AppError.conflict('An account with this e-mail already exists', 'EMAIL_TAKEN');
    }

    let user: UserDoc;
    try {
      user = await UserModel.create({
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        locale: input.locale,
      });
    } catch (error) {
      // Lost a race against a concurrent registration of the same e-mail.
      if ((error as { code?: number }).code === 11000) {
        throw AppError.conflict('An account with this e-mail already exists', 'EMAIL_TAKEN');
      }
      throw error;
    }

    const token = await issueAuthToken(user._id, 'email_verification', EMAIL_VERIFICATION_TTL_MS);
    notifications.verifyEmail({ name: user.name, email: user.email, locale: user.locale }, token);

    return issueSession(user, meta);
  },

  async login(input: { email: string; password: string }, meta: RequestMeta): Promise<AuthResult> {
    const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
    // Always run bcrypt, even for unknown e-mails, so response time doesn't reveal which accounts exist.
    const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !valid) throw AppError.invalidCredentials();

    assertCanSignIn(user);
    user.lastLoginAt = new Date();
    await user.save();
    return issueSession(user, meta);
  },

  async loginWithGoogle(input: { credential: string; locale: 'ar' | 'en' }, meta: RequestMeta): Promise<AuthResult> {
    if (!env.GOOGLE_CLIENT_ID) throw AppError.badRequest('Google sign-in is not configured');

    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: input.credential, audience: env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      throw AppError.unauthenticated('Invalid Google credential');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw AppError.unauthenticated('Google account e-mail is not verified');
    }

    const email = payload.email.toLowerCase();
    let user = await UserModel.findOne({ $or: [{ googleId: payload.sub }, { email }] });

    if (!user) {
      user = await UserModel.create({
        name: payload.name ?? email.split('@')[0] ?? 'Customer',
        email,
        googleId: payload.sub,
        emailVerified: true,
        locale: input.locale,
      });
    } else {
      // Link the Google identity to an existing e-mail account. Google verified the e-mail, so this is safe.
      user.googleId ??= payload.sub;
      user.emailVerified = true;
    }

    assertCanSignIn(user);
    user.lastLoginAt = new Date();
    await user.save();
    return issueSession(user, meta);
  },

  /**
   * Refresh-token ROTATION with REUSE DETECTION.
   *
   * Every refresh exchanges the presented token for a brand-new one (same `family`) and marks the old
   * one as rotated. If a rotated token is ever presented again, either the legitimate client or an
   * attacker holds a stale copy — we cannot tell which, so we revoke the whole family and force a
   * fresh login. The atomic "claim" below also turns concurrent double-refreshes into reuse events.
   */
  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<AuthResult> {
    if (!rawToken) throw AppError.unauthenticated('Missing refresh token');

    const session = await SessionModel.findOne({ refreshTokenHash: sha256(rawToken) });
    if (!session) throw AppError.unauthenticated('Invalid refresh token');

    const reuse = () => this.handleReuse(session.family, session.userId);

    if (session.rotatedAt) return reuse();
    if (session.revokedAt || session.expiresAt <= new Date()) throw AppError.unauthenticated('Session expired');

    const claimed = await SessionModel.findOneAndUpdate(
      { _id: session._id, rotatedAt: { $exists: false }, revokedAt: { $exists: false } },
      { $set: { rotatedAt: new Date() } },
    );
    if (!claimed) return reuse(); // another request rotated it between our read and write

    const user = await UserModel.findById(session.userId);
    if (!user || user.status === 'banned') {
      await SessionModel.updateMany({ family: session.family }, { $set: { revokedAt: new Date() } });
      throw AppError.unauthenticated('Session no longer valid');
    }

    return issueSession(user, meta, session.family);
  },

  async handleReuse(family: string, userId: Types.ObjectId): Promise<never> {
    await SessionModel.updateMany({ family, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    logger.warn({ family, userId: String(userId) }, 'refresh token reuse detected — session family revoked');
    throw new AppError(401, 'TOKEN_REUSE_DETECTED', 'Refresh token reuse detected. Please sign in again.');
  },

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await SessionModel.updateOne(
      { refreshTokenHash: sha256(rawToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  },

  async logoutAll(userId: string): Promise<void> {
    await SessionModel.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  },

  async verifyEmail(token: string): Promise<void> {
    const userId = await consumeAuthToken(token, 'email_verification');
    await UserModel.updateOne({ _id: userId }, { $set: { emailVerified: true } });
  },

  async resendVerification(userId: string): Promise<void> {
    const user = await UserModel.findById(userId);
    if (!user || user.emailVerified) return;
    const token = await issueAuthToken(user._id, 'email_verification', EMAIL_VERIFICATION_TTL_MS);
    notifications.verifyEmail({ name: user.name, email: user.email, locale: user.locale }, token);
  },

  /** Always resolves silently so the endpoint can't be used to discover which e-mails are registered. */
  async forgotPassword(email: string): Promise<void> {
    const user = await UserModel.findOne({ email });
    if (!user || user.status === 'banned') return;
    const token = await issueAuthToken(user._id, 'password_reset', PASSWORD_RESET_TTL_MS);
    notifications.passwordReset({ name: user.name, email: user.email, locale: user.locale }, token);
  },

  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await consumeAuthToken(token, 'password_reset');
    await UserModel.updateOne({ _id: userId }, { $set: { passwordHash: await hashPassword(password) } });
    // A password reset must kick out anyone who might hold an old session.
    await SessionModel.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  },
};
