import type { UserRole } from '../config/constants';

export interface AuthContext {
  userId: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate` / `optionalAuthenticate`. */
      auth?: AuthContext;
      /** Set by `validate()` — parsed + typed request parts. */
      validated?: { body: unknown; query: unknown; params: unknown };
      /** Raw request body bytes, kept for webhook signature verification. */
      rawBody?: Buffer;
    }
  }
}
