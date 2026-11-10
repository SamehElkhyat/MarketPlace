import { allowedTransitions, type Actor, type OrderStatus } from './order-state-machine';
import type { OrderAttrs } from './order.model';

type OrderLike = OrderAttrs & { _id: unknown; id?: string };

/**
 * Serialises an order for the API. `allowedActions` tells the UI exactly which transitions the current
 * actor may trigger — the admin screen renders only those buttons (the server still enforces them).
 */
export function toOrderDto(order: OrderLike, actor: Actor, opts: { includeCustomer?: boolean } = {}) {
  const allowedActions: OrderStatus[] = allowedTransitions(order, actor);
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    items: order.items.map((i) => ({
      productId: String(i.productId),
      sku: i.sku,
      title: i.title,
      image: i.image,
      optionValues: i.optionValues,
      options: i.options,
      unitPrice: i.unitPrice,
      qty: i.qty,
      lineTotal: i.lineTotal,
    })),
    shippingAddress: order.shippingAddress,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    discount: order.discount,
    total: order.total,
    couponCode: order.couponCode,
    customerNote: order.customerNote,
    cancelReason: order.cancelReason,
    statusHistory: order.statusHistory.map((h) => ({
      status: h.status,
      at: h.at,
      actor: h.actor,
      ...(h.note ? { note: h.note } : {}),
    })),
    allowedActions,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    ...(opts.includeCustomer
      ? { customer: { id: String(order.userId), name: order.customerName, email: order.customerEmail } }
      : {}),
  };
}
