import { AppError } from '../../lib/errors';

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'pending_confirmation',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Who is performing a transition. `system` = webhooks / background jobs. */
export type Actor = 'customer' | 'admin' | 'system';

interface Transition {
  to: OrderStatus;
  actors: readonly Actor[];
}

/**
 * The ONLY legal order lifecycle. Every status change in the codebase goes through
 * {@link assertTransition}; anything not listed here is rejected — even if an admin asks for it.
 *
 *   COD:     pending_confirmation → confirmed ─┐
 *   Online:  pending_payment → paid ───────────┴→ processing → shipped → delivered → refunded
 *   Cancel:  pending_payment | pending_confirmation | confirmed | processing → cancelled
 *   Refund:  paid | processing | delivered → refunded
 */
const TRANSITIONS: Record<OrderStatus, readonly Transition[]> = {
  pending_confirmation: [
    { to: 'confirmed', actors: ['admin'] },
    { to: 'cancelled', actors: ['customer', 'admin'] },
  ],
  confirmed: [
    { to: 'processing', actors: ['admin'] },
    { to: 'cancelled', actors: ['customer', 'admin'] },
  ],
  pending_payment: [
    { to: 'paid', actors: ['system'] },
    { to: 'cancelled', actors: ['customer', 'admin', 'system'] },
  ],
  paid: [
    { to: 'processing', actors: ['admin', 'system'] },
    { to: 'refunded', actors: ['admin'] },
  ],
  processing: [
    { to: 'shipped', actors: ['admin'] },
    { to: 'cancelled', actors: ['admin'] },
    { to: 'refunded', actors: ['admin'] },
  ],
  shipped: [{ to: 'delivered', actors: ['admin'] }],
  delivered: [{ to: 'refunded', actors: ['admin'] }],
  cancelled: [],
  refunded: [],
};

/** Statuses that put reserved stock back on the shelf. */
export const STOCK_RESTORING_STATUSES: readonly OrderStatus[] = ['cancelled', 'refunded'];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['cancelled', 'refunded'];

export interface TransitionSubject {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}

export function allowedTransitions(subject: TransitionSubject, actor: Actor): OrderStatus[] {
  return TRANSITIONS[subject.status]
    .filter((t) => t.actors.includes(actor) && passesPaymentGuard(subject, t.to))
    .map((t) => t.to);
}

/**
 * Money guards:
 *  - an order that was paid can only leave via `refunded` (money must go back), never `cancelled`;
 *  - `refunded` only makes sense when money was actually received.
 */
function passesPaymentGuard(subject: TransitionSubject, to: OrderStatus): boolean {
  if (to === 'cancelled') return subject.paymentStatus !== 'paid';
  if (to === 'refunded') return subject.paymentStatus === 'paid';
  return true;
}

export function canTransition(subject: TransitionSubject, to: OrderStatus, actor: Actor): boolean {
  return allowedTransitions(subject, actor).includes(to);
}

export function assertTransition(subject: TransitionSubject, to: OrderStatus, actor: Actor): void {
  if (!canTransition(subject, to, actor)) {
    throw AppError.unprocessable(
      'INVALID_TRANSITION',
      `Order cannot move from "${subject.status}" to "${to}" (actor: ${actor})`,
      { from: subject.status, to, actor, allowed: allowedTransitions(subject, actor) },
    );
  }
}

export const restoresStock = (to: OrderStatus): boolean => STOCK_RESTORING_STATUSES.includes(to);
