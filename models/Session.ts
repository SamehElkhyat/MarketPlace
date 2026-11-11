import { model, Schema, type Types } from 'mongoose';

export interface SessionAttrs {
  userId: Types.ObjectId;
  /** SHA-256 of the opaque refresh token. The raw token only exists in the httpOnly cookie. */
  refreshTokenHash: string;
  /** All tokens descending from one login share a family — revoking the family kills the chain. */
  family: string;
  expiresAt: Date;
  revokedAt?: Date;
  /** Set when this token was exchanged for a new one (rotation). Re-presenting it = theft signal. */
  rotatedAt?: Date;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
}

const sessionSchema = new Schema<SessionAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    rotatedAt: Date,
    userAgent: { type: String, maxlength: 300 },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Mongo removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model<SessionAttrs>('Session', sessionSchema);
