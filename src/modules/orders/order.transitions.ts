import mongoose, { type HydratedDocument } from 'mongoose';
import { AppError } from '../../lib/errors';
import { toObjectId } from '../../lib/object-id';
import { CouponModel } from '../coupons/coupon.model';
import { inventoryService } from '../inventory/inventory.service';
import { notifications } from '../notifications/notification.service';
import { PaymentModel } from '../payments/payment.models';
import { ProductModel } from '../products/product.model';
import { UserModel } from '../users/user.model';
import { OrderModel, type OrderAttrs } from './order.model';
import {
  assertTransition,
  restoresStock,
  type Actor,
  type OrderStatus,
  type PaymentStatus,
} from './order-state-machine';

export type OrderDoc = HydratedDocument<OrderAttrs>;

export interface TransitionRequest {
  orderId: string;
  to: OrderStatus;
  actor: Actor;
  byUserId?: string;
  note?: string;
  /** When set the order must belong to this user (customer-initiated actions). */
  ownerId?: string;
}

/**
 * The ONLY code path that changes an order's status.
 *
 *  1. validates the move against the state machine (+ payment guards),
 *  2. applies it with an optimistic `status` filter, so two admins clicking at once can't both win,
 *  3. in the SAME transaction restores stock / coupon uses and updates counters,
 *  4. sends the notification e-mail after commit.
 */
export async function transitionOrder(request: TransitionRequest): Promise<OrderDoc> {
  const order = await OrderModel.findById(request.orderId);
  if (!order || (request.ownerId && String(order.userId) !== request.ownerId)) throw AppError.notFound('Order');

  assertTransition(order, request.to, request.actor);

  const { to } = request;
  const from = order.status;
  const set: Record<string, unknown> = { status: to };
  const paymentStatus: PaymentStatus | undefined =
    to === 'paid' || (to === 'delivered' && order.paymentMethod === 'cod')
      ? 'paid'
      : to === 'refunded'
        ? 'refunded'
        : undefined;
  if (paymentStatus) set.paymentStatus = paymentStatus;
  if (to === 'cancelled' && request.note) set.cancelReason = request.note;

  const updated = await mongoose.connection.transaction(async (session) => {
    const doc = await OrderModel.findOneAndUpdate(
      { _id: order._id, status: from },
      {
        $set: set,
        $push: {
          statusHistory: {
            status: to,
            at: new Date(),
            actor: request.actor,
            ...(request.byUserId ? { byUserId: toObjectId(request.byUserId) } : {}),
            ...(request.note ? { note: request.note } : {}),
          },
        },
      },
      { returnDocument: 'after', session },
    );
    if (!doc) throw AppError.conflict('The order was changed by someone else — reload and retry');

    const stockLines = doc.items.map((i) => ({ sku: i.sku, qty: i.qty, productId: i.productId }));

    if (restoresStock(to)) {
      await inventoryService.release(stockLines, {
        session,
        reason: to === 'refunded' ? 'order_refunded' : 'order_cancelled',
        orderId: doc._id,
        ...(request.byUserId ? { byUserId: request.byUserId } : {}),
      });
    }
    if (to === 'cancelled' && doc.couponCode) {
      await CouponModel.updateOne({ code: doc.couponCode, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session });
    }
    // "Best sellers" counts delivered units only; a post-delivery refund takes them back.
    const soldDelta = to === 'delivered' ? 1 : from === 'delivered' && to === 'refunded' ? -1 : 0;
    if (soldDelta !== 0) {
      for (const item of doc.items) {
        await ProductModel.updateOne({ _id: item.productId }, { $inc: { soldCount: soldDelta * item.qty } }, { session });
      }
    }
    if (to === 'refunded') {
      await PaymentModel.updateMany({ orderId: doc._id, status: 'paid' }, { $set: { status: 'refunded' } }, { session });
    }
    return doc;
  });

  await notifyStatusChange(updated);
  return updated;
}

async function notifyStatusChange(order: OrderDoc): Promise<void> {
  const user = await UserModel.findById(order.userId).select('locale').lean();
  notifications.orderStatusChanged(
    order.status,
    { name: order.customerName, email: order.customerEmail, locale: user?.locale ?? 'ar' },
    order,
  );
}
