import { Router } from 'express';
import {
  addAddress,
  addToWishlist,
  deleteAddress,
  getProfile,
  getWishlist,
  removeFromWishlist,
  updateAddress,
  updateProfile,
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  addAddressSchemas,
  addressIdSchemas,
  updateAddressSchemas,
  updateProfileSchemas,
  wishlistSchemas,
} from '../validators/user.validators';

/** Mounted at `/api/users` — every route requires a signed-in user. */
export const userRouter = Router();
userRouter.use(authenticate);

userRouter.get('/me', getProfile);
userRouter.patch('/me', validate(updateProfileSchemas), updateProfile);

userRouter.post('/me/addresses', validate(addAddressSchemas), addAddress);
userRouter.put('/me/addresses/:addressId', validate(updateAddressSchemas), updateAddress);
userRouter.delete('/me/addresses/:addressId', validate(addressIdSchemas), deleteAddress);

userRouter.get('/me/wishlist', getWishlist);
userRouter.put('/me/wishlist/:productId', validate(wishlistSchemas), addToWishlist);
userRouter.delete('/me/wishlist/:productId', validate(wishlistSchemas), removeFromWishlist);
