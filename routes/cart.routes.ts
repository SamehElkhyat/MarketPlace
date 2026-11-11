import { Router } from 'express';
import {
  acknowledgePrices,
  addItem,
  clearCart,
  getCart,
  mergeCart,
  previewCart,
  removeItem,
  setItemQty,
} from '../controllers/cart.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { addItemSchemas, itemsBodySchemas, setQtySchemas, skuParamSchemas } from '../validators/cart.validators';

/** Mounted at `/api/cart`. */
export const cartRouter = Router();

cartRouter.post('/preview', validate(itemsBodySchemas), previewCart); // public: prices a guest cart

cartRouter.use(authenticate); // everything below needs a signed-in user

cartRouter.get('/', getCart);
cartRouter.post('/items', validate(addItemSchemas), addItem);
cartRouter.patch('/items/:sku', validate(setQtySchemas), setItemQty);
cartRouter.delete('/items/:sku', validate(skuParamSchemas), removeItem);
cartRouter.delete('/', clearCart);
cartRouter.post('/merge', validate(itemsBodySchemas), mergeCart);
cartRouter.post('/acknowledge-prices', acknowledgePrices);
