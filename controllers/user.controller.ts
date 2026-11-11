import type { RequestHandler } from 'express';
import { currentUserId } from '../middleware/auth.middleware';
import { validated } from '../middleware/validate.middleware';
import { userService } from '../services/user.service';
import type {
  addAddressSchemas,
  addressIdSchemas,
  updateAddressSchemas,
  updateProfileSchemas,
  wishlistSchemas,
} from '../validators/user.validators';

// ── profile ──────────────────────────────────────────────────────────────────
export const getProfile: RequestHandler = async (req, res) => {
  res.json(userService.toProfile(await userService.getById(currentUserId(req))));
};

export const updateProfile: RequestHandler = async (req, res) => {
  const { body } = validated<typeof updateProfileSchemas>(req);
  res.json(userService.toProfile(await userService.updateProfile(currentUserId(req), body)));
};

// ── addresses ────────────────────────────────────────────────────────────────
export const addAddress: RequestHandler = async (req, res) => {
  const { body } = validated<typeof addAddressSchemas>(req);
  res.status(201).json(userService.toProfile(await userService.addAddress(currentUserId(req), body)));
};

export const updateAddress: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof updateAddressSchemas>(req);
  res.json(userService.toProfile(await userService.updateAddress(currentUserId(req), params.addressId, body)));
};

export const deleteAddress: RequestHandler = async (req, res) => {
  const { params } = validated<typeof addressIdSchemas>(req);
  res.json(userService.toProfile(await userService.removeAddress(currentUserId(req), params.addressId)));
};

// ── wishlist ─────────────────────────────────────────────────────────────────
export const getWishlist: RequestHandler = async (req, res) => {
  res.json({ items: await userService.getWishlist(currentUserId(req)) });
};

export const addToWishlist: RequestHandler = async (req, res) => {
  const { params } = validated<typeof wishlistSchemas>(req);
  await userService.addToWishlist(currentUserId(req), params.productId);
  res.status(204).end();
};

export const removeFromWishlist: RequestHandler = async (req, res) => {
  const { params } = validated<typeof wishlistSchemas>(req);
  await userService.removeFromWishlist(currentUserId(req), params.productId);
  res.status(204).end();
};
