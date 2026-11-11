import mongoose, { Types } from 'mongoose';
import { env } from '../config/env';
import type { PaymentMethod } from '../config/constants';
import { ApiError } from '../utils/ApiError';
import { CartModel } from '../models/Cart';
import { describeOptions, loadAttributesByProduct } from './optionLabels.service';
import { CouponModel } from '../models/Coupon';
import { evaluateCoupon } from './couponRules.service';
import { inventoryService } from './inventory.service';
import { notifications } from './notification.service';
import type { PaymentInitResult } from './payments/PaymentProvider';
import { initiatePayment } from './payments/payment.initiate';
import { paymentRegistry } from './payments/payment.registry';
import { ProductModel } from '../models/Product';
import { UserModel } from '../models/User';
import { formatOrderNumber, requireShippingZone } from './checkout.service';
import { nextSequence } from '../models/Counter';
import { OrderModel, type OrderItem } from '../models/Order';
import { transitionOrder, type OrderDoc } from './orderTransitions.service';
import { calculateTotals } from './pricing.service';
import { toOrderDto } from '../utils/orderDto';
import { toPage, type PaginationQuery } from '../validators/common.validators';

export interface CreateOrderInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  couponCode?: string | undefined;
  note?: string | undefined;
  /** Total (piasters) the shopper saw. If prices moved in the meantime we refuse instead of surprising them. */
  expectedTotal?: number | undefined;
  idempotencyKey: string;
}

export interface CreateOrderResult {
  order: OrderDoc;
  /** False when an earlier request with the same idempotency key already created this order. */
  created: boolean;
  payment: PaymentInitResult | null;
}

const isIdempotencyConflict = (error: unknown): boolean =>
  (error as { code?: number })?.code === 11000 &&
  JSON.stringify((error as { keyPattern?: unknown }).keyPattern ?? {}).includes('idempotencyKey');

/**
 * Places an order.
 *
 *  - IDEMPOTENT: the (userId, idempotencyKey) unique index makes a double-click or network retry return
 *    the original order instead of creating a second one.
 *  - ATOMIC: stock reservation, coupon claim, order insert and cart clearing share one MongoDB
 *    transaction — a multi-item order is "all or nothing".
 *  - SERVER-PRICED: prices come from the database inside the transaction; the client only sends ids.
 */
export async function createOrder(userId: string, input: CreateOrderInput): Promise<CreateOrderResult> {
  const replay = async (): Promise<CreateOrderResult | null> => {
    const existing = await OrderModel.findOne({ userId, idempotencyKey: input.idempotencyKey });
    return existing ? { order: existing, created: false, payment: null } : null;
  };
  const previous = await replay();
  if (previous) return previous;

  const user = await UserModel.findById(userId);
  if (!user) throw ApiError.unauthenticated();
  if (user.status === 'banned') throw new ApiError(403, 'ACCOUNT_BANNED', 'This account has been suspended');
  if (env.REQUIRE_VERIFIED_EMAIL_FOR_ORDERS && !user.emailVerified) {
    throw new ApiError(403, 'EMAIL_UNVERIFIED_FOR_ORDER', 'Please verify your e-mail before placing an order');
  }

  const address = user.addresses.find((a) => String(a._id) === input.addressId);
  if (!address) throw ApiError.notFound('Address');

  const provider = paymentRegistry.forMethod(input.paymentMethod);
  const cart = await CartModel.findOne({ userId }).lean();
  if (!cart || cart.items.length === 0) throw ApiError.unprocessable('EMPTY_CART', 'Your cart is empty');

  const zone = await requireShippingZone(address.governorate);
  const orderNumber = formatOrderNumber(await nextSequence('order')); // outside the txn: gaps are fine, hot-doc conflicts are not
  const orderId = new Types.ObjectId();

  let order: OrderDoc;
  try {
    order = await mongoose.connection.transaction(async (session) => {
      // NOTE: this callback may be retried by MongoDB on transient errors — keep it free of side effects.
      const skus = cart.items.map((i) => i.sku);
      const products = await ProductModel.find({ 'variants.sku': { $in: skus }, status: 'published' }).session(session);
      const variantBySku = new Map(
        products.flatMap((p) => p.variants.map((v) => [v.sku, { product: p, variant: v }] as const)),
      );

      const attributesByProduct = await loadAttributesByProduct(products);

      const items: OrderItem[] = cart.items.map((cartItem) => {
        const found = variantBySku.get(cartItem.sku);
        if (!found) {
          throw ApiError.unprocessable('PRODUCT_UNAVAILABLE', 'A product in your cart is no longer available', { sku: cartItem.sku });
        }
        const { product, variant } = found;
        return {
          productId: product._id,
          sku: variant.sku,
          title: product.title,
          ...(product.images[0] ? { image: product.images[0].url } : {}),
          optionValues: variant.optionValues,
          options: describeOptions(attributesByProduct.get(String(product._id)) ?? [], variant.optionValues),
          unitPrice: variant.price,
          qty: cartItem.qty,
          lineTotal: variant.price * cartItem.qty,
        };
      });

      // The atomic, conditional stock decrement — throws INSUFFICIENT_STOCK and aborts the whole transaction.
      await inventoryService.reserve(
        items.map((i) => ({ sku: i.sku, qty: i.qty, productId: i.productId })),
        { session, reason: 'order_placed', orderId, byUserId: userId },
      );

      const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
      let discount = 0;
      let couponCode: string | undefined;
      if (input.couponCode) {
        const coupon = await CouponModel.findOne({ code: input.couponCode.toUpperCase() }).session(session);
        if (!coupon) throw ApiError.unprocessable('COUPON_INVALID', 'Coupon not found', { reason: 'not_found' });
        discount = evaluateCoupon(coupon, subtotal);
        // Claim a use atomically so `maxUses` can never be exceeded by concurrent checkouts.
        const claimed = await CouponModel.updateOne(
          { _id: coupon._id, $or: [{ maxUses: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }] },
          { $inc: { usedCount: 1 } },
          { session },
        );
        if (claimed.modifiedCount !== 1) throw ApiError.unprocessable('COUPON_INVALID', 'Coupon exhausted', { reason: 'exhausted' });
        couponCode = coupon.code;
      }

      const totals = calculateTotals({
        lines: items.map((i) => ({ unitPrice: i.unitPrice, qty: i.qty })),
        shippingFee: zone.fee,
        discount,
      });

      if (input.expectedTotal !== undefined && input.expectedTotal !== totals.total) {
        throw ApiError.conflict('Prices changed since you last viewed your cart', 'PRICE_CHANGED', {
          expected: input.expectedTotal,
          actual: totals.total,
        });
      }
      if (provider.method === 'cod' && totals.total > env.COD_MAX_AMOUNT) {
        throw ApiError.unprocessable('COD_LIMIT_EXCEEDED', 'Order value exceeds the cash-on-delivery limit', {
          max: env.COD_MAX_AMOUNT,
        });
      }

      const [created] = await OrderModel.create(
        [
          {
            _id: orderId,
            orderNumber,
            userId: user._id,
            customerName: user.name,
            customerEmail: user.email,
            items,
            shippingAddress: {
              fullName: address.fullName,
              phone: address.phone,
              governorate: address.governorate,
              city: address.city,
              street: address.street,
              ...(address.notes ? { notes: address.notes } : {}),
            },
            ...totals,
            ...(couponCode ? { couponCode } : {}),
            paymentMethod: provider.method,
            paymentStatus: 'unpaid',
            status: provider.initialOrderStatus,
            statusHistory: [{ status: provider.initialOrderStatus, at: new Date(), actor: 'customer', byUserId: user._id }],
            ...(input.note ? { customerNote: input.note } : {}),
            idempotencyKey: input.idempotencyKey,
          },
        ],
        { session },
      );
      await CartModel.updateOne({ userId: user._id }, { $set: { items: [] } }, { session });
      return created!;
    });
  } catch (error) {
    if (isIdempotencyConflict(error)) {
      const winner = await replay();
      if (winner) return winner; // a concurrent duplicate request won the race
    }
    throw error;
  }

  // ── after commit ───────────────────────────────────────────────────────────
  if (provider.initialOrderStatus === 'pending_confirmation') {
    notifications.order('placed', { name: user.name, email: user.email, locale: user.locale }, order);
  }
  const payment =
    provider.initialOrderStatus === 'pending_payment'
      ? await initiatePayment(
          { id: order.id as string, orderNumber: order.orderNumber, total: order.total, customerName: order.customerName, customerEmail: order.customerEmail },
          provider,
        )
      : null;

  return { order, created: true, payment };
}

// ── a customer's own orders ──────────────────────────────────────────────────

export async function listOrdersForUser(userId: string, query: PaginationQuery) {
  const filter = { userId };
  const [items, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    OrderModel.countDocuments(filter),
  ]);
  return toPage(items.map((o) => toOrderDto(o, 'customer')), total, query);
}

/** Orders are looked up by (orderNumber, userId): someone else's order is a 404, never a 403 (no existence leak). */
export async function getOrderForUser(userId: string, orderNumber: string) {
  const order = await OrderModel.findOne({ orderNumber, userId }).lean();
  if (!order) throw ApiError.notFound('Order');
  return toOrderDto(order, 'customer');
}

export async function cancelOrderForUser(userId: string, orderNumber: string, reason?: string) {
  const order = await OrderModel.findOne({ orderNumber, userId }).select('_id');
  if (!order) throw ApiError.notFound('Order');

  const updated = await transitionOrder({
    orderId: order.id as string,
    to: 'cancelled',
    actor: 'customer',
    byUserId: userId,
    ownerId: userId,
    ...(reason ? { note: reason } : {}),
  });
  return toOrderDto(updated, 'customer');
}
