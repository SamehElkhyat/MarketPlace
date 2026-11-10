import { Router } from 'express';
import { z } from 'zod';
import { authenticate, currentUserId } from '../../http/middleware/authenticate';
import { validate, validated } from '../../http/validate';
import { skuSchema } from '../products/product.schemas';
import { cartService } from './cart.service';

const guestItem = z.object({ sku: skuSchema, qty: z.number().int().min(1).max(99) });

const addSchemas = { body: guestItem };
const setSchemas = { params: z.object({ sku: skuSchema }), body: z.object({ qty: z.number().int().min(0).max(99) }) };
const skuParams = { params: z.object({ sku: skuSchema }) };
const listSchemas = { body: z.object({ items: z.array(guestItem).max(50) }) };

export const cartRouter = Router();

/** Guest cart pricing: the browser sends SKUs + quantities, the server prices them. Nothing is stored. */
cartRouter.post('/preview', validate(listSchemas), async (req, res) => {
  const { body } = validated<typeof listSchemas>(req);
  res.json({ cart: await cartService.preview(body.items) });
});

cartRouter.use(authenticate);

cartRouter.get('/', async (req, res) => {
  res.json({ cart: await cartService.get(currentUserId(req)) });
});

cartRouter.post('/items', validate(addSchemas), async (req, res) => {
  const { body } = validated<typeof addSchemas>(req);
  res.status(201).json({ cart: await cartService.setItem(currentUserId(req), body.sku, body.qty, 'add') });
});

cartRouter.patch('/items/:sku', validate(setSchemas), async (req, res) => {
  const { params, body } = validated<typeof setSchemas>(req);
  res.json({ cart: await cartService.setItem(currentUserId(req), params.sku, body.qty, 'set') });
});

cartRouter.delete('/items/:sku', validate(skuParams), async (req, res) => {
  const { params } = validated<typeof skuParams>(req);
  res.json({ cart: await cartService.removeItem(currentUserId(req), params.sku) });
});

cartRouter.delete('/', async (req, res) => {
  await cartService.clear(currentUserId(req));
  res.status(204).end();
});

cartRouter.post('/merge', validate(listSchemas), async (req, res) => {
  const { body } = validated<typeof listSchemas>(req);
  res.json({ cart: await cartService.merge(currentUserId(req), body.items) });
});

cartRouter.post('/acknowledge-prices', async (req, res) => {
  res.json({ cart: await cartService.acknowledgePrices(currentUserId(req)) });
});
