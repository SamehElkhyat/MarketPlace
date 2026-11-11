import { z } from 'zod';
import { skuSchema } from './product.validators';

const cartItem = z.object({ sku: skuSchema, qty: z.number().int().min(1).max(99) });

export const addItemSchemas = { body: cartItem };
export const setQtySchemas = {
  params: z.object({ sku: skuSchema }),
  body: z.object({ qty: z.number().int().min(0).max(99) }),
};
export const skuParamSchemas = { params: z.object({ sku: skuSchema }) };
/** Used by both `POST /cart/preview` (guest) and `POST /cart/merge` (after sign-in). */
export const itemsBodySchemas = { body: z.object({ items: z.array(cartItem).max(50) }) };
