import { Router } from 'express';
import { authenticate } from '../../http/middleware/authenticate';
import { rateLimit } from '../../http/middleware/rate-limit';
import { validate } from '../../http/validate';
import * as controller from './auth.controller';
import {
  forgotPasswordSchemas,
  googleSchemas,
  loginSchemas,
  registerSchemas,
  resetPasswordSchemas,
  verifyEmailSchemas,
} from './auth.schemas';

export const authRouter = Router();

const byEmail = (req: { body?: { email?: unknown } }) =>
  typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : undefined;

authRouter.post(
  '/register',
  rateLimit({ name: 'auth:register', requests: 10, windowSeconds: 3600 }),
  validate(registerSchemas),
  controller.register,
);
authRouter.post(
  '/login',
  rateLimit({ name: 'auth:login', requests: 10, windowSeconds: 15 * 60, keyBy: byEmail }),
  validate(loginSchemas),
  controller.login,
);
authRouter.post(
  '/google',
  rateLimit({ name: 'auth:google', requests: 20, windowSeconds: 15 * 60 }),
  validate(googleSchemas),
  controller.google,
);
authRouter.post('/refresh', rateLimit({ name: 'auth:refresh', requests: 60, windowSeconds: 60 }), controller.refresh);
authRouter.post('/logout', controller.logout);
authRouter.post('/logout-all', authenticate, controller.logoutAll);
authRouter.post('/verify-email', validate(verifyEmailSchemas), controller.verifyEmail);
authRouter.post(
  '/resend-verification',
  authenticate,
  rateLimit({ name: 'auth:resend', requests: 5, windowSeconds: 3600 }),
  controller.resendVerification,
);
authRouter.post(
  '/forgot-password',
  rateLimit({ name: 'auth:forgot', requests: 5, windowSeconds: 3600, keyBy: byEmail }),
  validate(forgotPasswordSchemas),
  controller.forgotPassword,
);
authRouter.post(
  '/reset-password',
  rateLimit({ name: 'auth:reset', requests: 10, windowSeconds: 3600 }),
  validate(resetPasswordSchemas),
  controller.resetPassword,
);
authRouter.get('/me', authenticate, controller.me);
