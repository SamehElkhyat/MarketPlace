import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Opaque, URL-safe random token (default 32 bytes = 256 bits of entropy). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Only hashes of tokens are persisted, so a DB leak does not leak usable tokens. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time string comparison (prevents timing attacks on signature checks). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
