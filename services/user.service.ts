import type { HydratedDocument } from 'mongoose';
import { ProductModel } from '../models/Product';
import { UserModel, type UserAttrs } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { toPublicUser } from '../utils/userDto';
import { CARD_PROJECTION, toCard, type CardRow } from './productQuery.service';

type UserDoc = HydratedDocument<UserAttrs>;
type AddressInput = Omit<UserAttrs['addresses'][number], '_id'>;

export const userService = {
  async getById(userId: string): Promise<UserDoc> {
    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.unauthenticated();
    return user;
  },

  /** Account snapshot returned by every profile endpoint. */
  toProfile(user: UserDoc) {
    return { user: toPublicUser(user), addresses: user.addresses, wishlist: user.wishlist.map(String) };
  },

  async updateProfile(userId: string, patch: { name?: string | undefined; locale?: 'ar' | 'en' | undefined }) {
    const user = await this.getById(userId);
    if (patch.name) user.name = patch.name;
    if (patch.locale) user.locale = patch.locale;
    await user.save();
    return user;
  },

  // ── addresses ──────────────────────────────────────────────────────────────
  async addAddress(userId: string, input: AddressInput & { isDefault: boolean }) {
    const user = await this.getById(userId);
    const makeDefault = input.isDefault || user.addresses.length === 0; // the first address is always the default
    if (makeDefault) user.addresses.forEach((a) => (a.isDefault = false));
    user.addresses.push({ ...input, isDefault: makeDefault } as (typeof user.addresses)[number]);
    await user.save();
    return user;
  },

  async updateAddress(userId: string, addressId: string, input: AddressInput) {
    const user = await this.getById(userId);
    const address = user.addresses.find((a) => String(a._id) === addressId);
    if (!address) throw ApiError.notFound('Address');
    if (input.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
    Object.assign(address, input);
    await user.save();
    return user;
  },

  async removeAddress(userId: string, addressId: string) {
    const user = await this.getById(userId);
    const remaining = user.addresses.filter((a) => String(a._id) !== addressId);
    if (remaining.length === user.addresses.length) throw ApiError.notFound('Address');
    // never leave the account without a default address
    if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) remaining[0]!.isDefault = true;
    user.set('addresses', remaining);
    await user.save();
    return user;
  },

  // ── wishlist ───────────────────────────────────────────────────────────────
  async getWishlist(userId: string) {
    const user = await this.getById(userId);
    const rows = await ProductModel.aggregate<CardRow>([
      { $match: { _id: { $in: user.wishlist }, status: 'published' } },
      { $project: CARD_PROJECTION },
    ]);
    const order = new Map(user.wishlist.map((id, index) => [String(id), index]));
    return rows.map(toCard).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  },

  async addToWishlist(userId: string, productId: string) {
    if (!(await ProductModel.exists({ _id: productId }))) throw ApiError.notFound('Product');
    await UserModel.updateOne({ _id: userId }, { $addToSet: { wishlist: productId } });
  },

  async removeFromWishlist(userId: string, productId: string) {
    await UserModel.updateOne({ _id: userId }, { $pull: { wishlist: productId } });
  },
};
