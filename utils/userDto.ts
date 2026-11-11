import type { HydratedDocument } from 'mongoose';
import type { UserAttrs } from '../models/User';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserAttrs['role'];
  emailVerified: boolean;
  locale: UserAttrs['locale'];
  createdAt: Date;
}

export function toPublicUser(user: HydratedDocument<UserAttrs>): PublicUser {
  return {
    id: user.id as string,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    locale: user.locale,
    createdAt: user.createdAt,
  };
}
