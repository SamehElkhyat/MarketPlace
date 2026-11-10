import { Router } from 'express';
import { z } from 'zod';
import { GOVERNORATE_KEYS } from '../../config/constants';
import { authenticate, currentUserId } from '../../http/middleware/authenticate';
import { validate, validated } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { objectIdSchema } from '../../lib/object-id';
import { phoneSchema } from '../../lib/schemas';
import { ProductModel } from '../products/product.model';
import { CARD_PROJECTION, toCard, type CardRow } from '../products/product.query';
import { toPublicUser } from './user.dto';
import { UserModel } from './user.model';

const addressBody = z.object({
  label: z.string().trim().max(40).optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  governorate: z.enum(GOVERNORATE_KEYS),
  city: z.string().trim().min(2).max(80),
  street: z.string().trim().min(3).max(240),
  notes: z.string().trim().max(300).optional(),
  isDefault: z.boolean().default(false),
});

const profileSchemas = {
  body: z.object({ name: z.string().trim().min(2).max(120).optional(), locale: z.enum(['ar', 'en']).optional() }),
};
const addAddressSchemas = { body: addressBody };
const updateAddressSchemas = { params: z.object({ addressId: objectIdSchema }), body: addressBody };
const addressIdSchemas = { params: z.object({ addressId: objectIdSchema }) };
const wishlistSchemas = { params: z.object({ productId: objectIdSchema }) };

export const userRouter = Router();
userRouter.use(authenticate);

async function loadUser(req: Express.Request) {
  const user = await UserModel.findById(currentUserId(req));
  if (!user) throw AppError.unauthenticated();
  return user;
}

const profileDto = (user: Awaited<ReturnType<typeof loadUser>>) => ({
  user: toPublicUser(user),
  addresses: user.addresses,
  wishlist: user.wishlist.map(String),
});

userRouter.get('/me', async (req, res) => {
  res.json(profileDto(await loadUser(req)));
});

userRouter.patch('/me', validate(profileSchemas), async (req, res) => {
  const { body } = validated<typeof profileSchemas>(req);
  const user = await loadUser(req);
  if (body.name) user.name = body.name;
  if (body.locale) user.locale = body.locale;
  await user.save();
  res.json(profileDto(user));
});

// ── addresses ────────────────────────────────────────────────────────────────
userRouter.post('/me/addresses', validate(addAddressSchemas), async (req, res) => {
  const { body } = validated<typeof addAddressSchemas>(req);
  const user = await loadUser(req);
  const makeDefault = body.isDefault || user.addresses.length === 0;
  if (makeDefault) user.addresses.forEach((a) => (a.isDefault = false));
  user.addresses.push({ ...body, isDefault: makeDefault } as (typeof user.addresses)[number]);
  await user.save();
  res.status(201).json(profileDto(user));
});

userRouter.put('/me/addresses/:addressId', validate(updateAddressSchemas), async (req, res) => {
  const { params, body } = validated<typeof updateAddressSchemas>(req);
  const user = await loadUser(req);
  const address = user.addresses.find((a) => String(a._id) === params.addressId);
  if (!address) throw AppError.notFound('Address');
  if (body.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  Object.assign(address, body);
  await user.save();
  res.json(profileDto(user));
});

userRouter.delete('/me/addresses/:addressId', validate(addressIdSchemas), async (req, res) => {
  const { params } = validated<typeof addressIdSchemas>(req);
  const user = await loadUser(req);
  const remaining = user.addresses.filter((a) => String(a._id) !== params.addressId);
  if (remaining.length === user.addresses.length) throw AppError.notFound('Address');
  if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) remaining[0]!.isDefault = true;
  user.set('addresses', remaining);
  await user.save();
  res.json(profileDto(user));
});

// ── wishlist ─────────────────────────────────────────────────────────────────
userRouter.get('/me/wishlist', async (req, res) => {
  const user = await loadUser(req);
  const rows = await ProductModel.aggregate<CardRow>([
    { $match: { _id: { $in: user.wishlist }, status: 'published' } },
    { $project: CARD_PROJECTION },
  ]);
  const order = new Map(user.wishlist.map((id, index) => [String(id), index]));
  res.json({ items: rows.map(toCard).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) });
});

userRouter.put('/me/wishlist/:productId', validate(wishlistSchemas), async (req, res) => {
  const { params } = validated<typeof wishlistSchemas>(req);
  if (!(await ProductModel.exists({ _id: params.productId }))) throw AppError.notFound('Product');
  await UserModel.updateOne({ _id: currentUserId(req) }, { $addToSet: { wishlist: params.productId } });
  res.status(204).end();
});

userRouter.delete('/me/wishlist/:productId', validate(wishlistSchemas), async (req, res) => {
  const { params } = validated<typeof wishlistSchemas>(req);
  await UserModel.updateOne({ _id: currentUserId(req) }, { $pull: { wishlist: params.productId } });
  res.status(204).end();
});
