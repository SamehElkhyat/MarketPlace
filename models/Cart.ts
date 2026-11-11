import { model, Schema, type Types } from 'mongoose';

export interface CartItem {
  sku: string;
  qty: number;
  /** Unit price (piasters) when the item was added — used to warn the shopper if it changed. */
  priceAtAdd: number;
}

export interface CartAttrs {
  userId: Types.ObjectId;
  items: CartItem[];
  updatedAt: Date;
}

const cartSchema = new Schema<CartAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: {
      type: [
        new Schema<CartItem>(
          {
            sku: { type: String, required: true },
            qty: { type: Number, required: true, min: 1, max: 99 },
            priceAtAdd: { type: Number, required: true, min: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const CartModel = model<CartAttrs>('Cart', cartSchema);
