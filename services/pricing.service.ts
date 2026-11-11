import { assertPiasters, type Piasters } from '../utils/money';

export interface PricedLine {
  unitPrice: Piasters;
  qty: number;
}

export interface Totals {
  subtotal: Piasters;
  shippingFee: Piasters;
  discount: Piasters;
  total: Piasters;
}

/**
 * Pure order-total calculation. The server is the only place prices are computed;
 * the frontend merely displays what this returns.
 *
 * The discount applies to the merchandise subtotal and can never exceed it
 * (a coupon can't make shipping negative or the order free-with-credit).
 */
export function calculateTotals(input: {
  lines: readonly PricedLine[];
  shippingFee: Piasters;
  discount?: Piasters;
}): Totals {
  const subtotal = input.lines.reduce((sum, line) => {
    assertPiasters(line.unitPrice, 'unitPrice');
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new RangeError(`Invalid quantity ${line.qty}`);
    return sum + line.unitPrice * line.qty;
  }, 0);

  const shippingFee = assertPiasters(input.shippingFee, 'shippingFee');
  const discount = Math.min(assertPiasters(input.discount ?? 0, 'discount'), subtotal);

  return { subtotal, shippingFee, discount, total: subtotal - discount + shippingFee };
}
