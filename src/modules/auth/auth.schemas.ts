import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../lib/schemas';

export const registerSchemas = {
  body: z.object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    locale: z.enum(['ar', 'en']).default('ar'),
  }),
};

export const loginSchemas = {
  body: z.object({ email: emailSchema, password: z.string().min(1).max(128) }),
};

export const googleSchemas = {
  body: z.object({ credential: z.string().min(20), locale: z.enum(['ar', 'en']).default('ar') }),
};

export const verifyEmailSchemas = { body: z.object({ token: z.string().min(20).max(200) }) };

export const forgotPasswordSchemas = { body: z.object({ email: emailSchema }) };

export const resetPasswordSchemas = {
  body: z.object({ token: z.string().min(20).max(200), password: passwordSchema }),
};
