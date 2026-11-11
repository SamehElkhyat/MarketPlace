import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  ORDER_STATUSES,
  restoresStock,
  type OrderStatus,
} from '../../services/orderStateMachine';
import { ApiError } from '../../utils/ApiError';

const cod = (status: OrderStatus, paymentStatus: 'unpaid' | 'paid' = 'unpaid') => ({ status, paymentStatus });

describe('order state machine', () => {
  it('walks the COD happy path', () => {
    expect(canTransition(cod('pending_confirmation'), 'confirmed', 'admin')).toBe(true);
    expect(canTransition(cod('confirmed'), 'processing', 'admin')).toBe(true);
    expect(canTransition(cod('processing'), 'shipped', 'admin')).toBe(true);
    expect(canTransition(cod('shipped'), 'delivered', 'admin')).toBe(true);
  });

  it('walks the online happy path; only the system (webhook) can mark an order paid', () => {
    expect(canTransition(cod('pending_payment'), 'paid', 'system')).toBe(true);
    expect(canTransition(cod('pending_payment'), 'paid', 'admin')).toBe(false);
    expect(canTransition(cod('pending_payment'), 'paid', 'customer')).toBe(false);
    expect(canTransition(cod('paid', 'paid'), 'processing', 'admin')).toBe(true);
  });

  it('rejects every move that is not in the table, even for admins', () => {
    expect(canTransition(cod('pending_confirmation'), 'shipped', 'admin')).toBe(false);
    expect(canTransition(cod('confirmed'), 'delivered', 'admin')).toBe(false);
    expect(canTransition(cod('shipped'), 'cancelled', 'admin')).toBe(false);
    expect(canTransition(cod('delivered'), 'processing', 'admin')).toBe(false);
  });

  it('treats cancelled and refunded as terminal', () => {
    for (const status of ['cancelled', 'refunded'] as const) {
      for (const to of ORDER_STATUSES) {
        for (const actor of ['customer', 'admin', 'system'] as const) {
          expect(canTransition(cod(status, 'paid'), to, actor)).toBe(false);
        }
      }
    }
  });

  it('lets customers cancel only before processing starts', () => {
    expect(canTransition(cod('pending_confirmation'), 'cancelled', 'customer')).toBe(true);
    expect(canTransition(cod('confirmed'), 'cancelled', 'customer')).toBe(true);
    expect(canTransition(cod('processing'), 'cancelled', 'customer')).toBe(false);
    expect(canTransition(cod('processing'), 'cancelled', 'admin')).toBe(true);
    expect(canTransition(cod('shipped'), 'cancelled', 'customer')).toBe(false);
  });

  it('money guard: paid orders leave through "refunded", never "cancelled"', () => {
    expect(canTransition(cod('processing', 'paid'), 'cancelled', 'admin')).toBe(false);
    expect(canTransition(cod('processing', 'paid'), 'refunded', 'admin')).toBe(true);
    // …and an unpaid order has nothing to refund
    expect(canTransition(cod('processing', 'unpaid'), 'refunded', 'admin')).toBe(false);
  });

  it('allows refunding a delivered, collected order', () => {
    expect(canTransition(cod('delivered', 'paid'), 'refunded', 'admin')).toBe(true);
  });

  it('assertTransition throws an INVALID_TRANSITION ApiError with the allowed moves', () => {
    try {
      assertTransition(cod('shipped'), 'confirmed', 'admin');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const e = error as ApiError;
      expect(e.code).toBe('INVALID_TRANSITION');
      expect(e.status).toBe(422);
      expect((e.details as { allowed: string[] }).allowed).toEqual(['delivered']);
    }
  });

  it('lists exactly the actions the UI may show', () => {
    expect(allowedTransitions(cod('pending_confirmation'), 'admin').sort()).toEqual(['cancelled', 'confirmed']);
    expect(allowedTransitions(cod('pending_confirmation'), 'customer')).toEqual(['cancelled']);
  });

  it('only cancellations and refunds restore stock', () => {
    expect(ORDER_STATUSES.filter(restoresStock).sort()).toEqual(['cancelled', 'refunded']);
  });
});
