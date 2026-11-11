import { jwtVerify, SignJWT } from 'jose';
import { USER_ROLES, type UserRole } from '../config/constants';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'marketplace-api';

export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
}

export async function signAccessToken({ userId, role }: AccessTokenPayload): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ['HS256'] });
    const role = payload['role'];
    if (!payload.sub || typeof role !== 'string' || !(USER_ROLES as readonly string[]).includes(role)) {
      throw ApiError.unauthenticated('Malformed access token');
    }
    return { userId: payload.sub, role: role as UserRole };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthenticated('Invalid or expired access token');
  }
}
