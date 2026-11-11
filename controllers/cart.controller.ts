import type { RequestHandler } from 'express';
import { currentUserId } from '../middleware/auth.middleware';
import { validated } from '../middleware/validate.middleware';
import { cartService } from '../services/cart.service';
import type {
  addItemSchemas,
  itemsBodySchemas,
  setQtySchemas,
  skuParamSchemas,
} from '../validators/cart.validators';

/** Guest cart pricing: the browser sends SKUs + quantities, the server prices them. Nothing is stored. */
export const previewCart: RequestHandler = async (req, res) => {
  const { body } = validated<typeof itemsBodySchemas>(req);
  res.json({ cart: await cartService.preview(body.items) });
};

export const getCart: RequestHandler = async (req, res) => {
  res.json({ cart: await cartService.get(currentUserId(req)) });
};

export const addItem: RequestHandler = async (req, res) => {
  const { body } = validated<typeof addItemSchemas>(req);
  res.status(201).json({ cart: await cartService.setItem(currentUserId(req), body.sku, body.qty, 'add') });
};

export const setItemQty: RequestHandler = async (req, res) => {
  const { params, body } = validated<typeof setQtySchemas>(req);
  res.json({ cart: await cartService.setItem(currentUserId(req), params.sku, body.qty, 'set') });
};

export const removeItem: RequestHandler = async (req, res) => {
  const { params } = validated<typeof skuParamSchemas>(req);
  res.json({ cart: await cartService.removeItem(currentUserId(req), params.sku) });
};

export const clearCart: RequestHandler = async (req, res) => {
  await cartService.clear(currentUserId(req));
  res.status(204).end();
};

/** Merges the guest cart (kept in the browser) into the account cart right after sign-in. */
export const mergeCart: RequestHandler = async (req, res) => {
  const { body } = validated<typeof itemsBodySchemas>(req);
  res.json({ cart: await cartService.merge(currentUserId(req), body.items) });
};

export const acknowledgePrices: RequestHandler = async (req, res) => {
  res.json({ cart: await cartService.acknowledgePrices(currentUserId(req)) });
};
