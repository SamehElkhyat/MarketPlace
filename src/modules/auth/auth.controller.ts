import type { Request, RequestHandler, Response } from 'express';
import { isProduction } from '../../config/env';
import { currentUserId } from '../../http/middleware/authenticate';
import { validated } from '../../http/validate';
import { UserModel } from '../users/user.model';
import { toPublicUser } from '../users/user.dto';
import { AppError } from '../../lib/errors';
import { authService, type AuthResult, type RequestMeta } from './auth.service';
import type {
  forgotPasswordSchemas,
  googleSchemas,
  loginSchemas,
  registerSchemas,
  resetPasswordSchemas,
  verifyEmailSchemas,
} from './auth.schemas';

export const REFRESH_COOKIE = 'rt';
/** Cookie is only sent to the auth endpoints — it never rides along on catalogue/cart requests. */
const REFRESH_COOKIE_PATH = '/api/auth';

const meta = (req: Request): RequestMeta => ({
  ...(req.get('user-agent') ? { userAgent: req.get('user-agent')! } : {}),
  ...(req.ip ? { ip: req.ip } : {}),
});

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    expires,
  });
}

const clearRefreshCookie = (res: Response) =>
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: isProduction, sameSite: 'lax', path: REFRESH_COOKIE_PATH });

function respondWithSession(res: Response, result: AuthResult, status = 200) {
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.status(status).json({ accessToken: result.accessToken, user: result.user });
}

export const register: RequestHandler = async (req, res) => {
  const { body } = validated<typeof registerSchemas>(req);
  respondWithSession(res, await authService.register(body, meta(req)), 201);
};

export const login: RequestHandler = async (req, res) => {
  const { body } = validated<typeof loginSchemas>(req);
  respondWithSession(res, await authService.login(body, meta(req)));
};

export const google: RequestHandler = async (req, res) => {
  const { body } = validated<typeof googleSchemas>(req);
  respondWithSession(res, await authService.loginWithGoogle(body, meta(req)));
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    respondWithSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE] as string | undefined, meta(req)));
  } catch (error) {
    // A rejected refresh token is useless — drop the cookie so the browser stops sending it.
    if (error instanceof AppError && error.status === 401) clearRefreshCookie(res);
    throw error;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
  clearRefreshCookie(res);
  res.status(204).end();
};

export const logoutAll: RequestHandler = async (req, res) => {
  await authService.logoutAll(currentUserId(req));
  clearRefreshCookie(res);
  res.status(204).end();
};

export const verifyEmail: RequestHandler = async (req, res) => {
  const { body } = validated<typeof verifyEmailSchemas>(req);
  await authService.verifyEmail(body.token);
  res.status(204).end();
};

export const resendVerification: RequestHandler = async (req, res) => {
  await authService.resendVerification(currentUserId(req));
  res.status(204).end();
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const { body } = validated<typeof forgotPasswordSchemas>(req);
  await authService.forgotPassword(body.email);
  res.status(202).json({ message: 'If an account exists for this e-mail, a reset link was sent.' });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const { body } = validated<typeof resetPasswordSchemas>(req);
  await authService.resetPassword(body.token, body.password);
  clearRefreshCookie(res);
  res.status(204).end();
};

export const me: RequestHandler = async (req, res) => {
  const user = await UserModel.findById(currentUserId(req));
  if (!user) throw AppError.unauthenticated();
  res.json({ user: toPublicUser(user) });
};
