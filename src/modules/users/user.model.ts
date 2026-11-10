import { model, Schema, type Types } from 'mongoose';
import { USER_ROLES, USER_STATUSES, type UserRole, type UserStatus } from '../../config/constants';

export interface Address {
  _id: Types.ObjectId;
  label?: string;
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  street: string;
  notes?: string;
  isDefault: boolean;
}

export interface UserAttrs {
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  status: UserStatus;
  googleId?: string;
  emailVerified: boolean;
  /** Preferred language — drives the language of transactional e-mails. */
  locale: 'ar' | 'en';
  addresses: Address[];
  wishlist: Types.ObjectId[];
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<Address>({
  label: { type: String, trim: true, maxlength: 40 },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true },
  governorate: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true, maxlength: 80 },
  street: { type: String, required: true, trim: true, maxlength: 240 },
  notes: { type: String, trim: true, maxlength: 300 },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new Schema<UserAttrs>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    // Never selected by default — must be requested explicitly with `.select('+passwordHash')`.
    passwordHash: { type: String, select: false },
    role: { type: String, enum: USER_ROLES, default: 'customer', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active' },
    googleId: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    locale: { type: String, enum: ['ar', 'en'], default: 'ar' },
    addresses: { type: [addressSchema], default: [] },
    wishlist: { type: [Schema.Types.ObjectId], ref: 'Product', default: [] },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.index({ createdAt: -1 });

export const UserModel = model<UserAttrs>('User', userSchema);
