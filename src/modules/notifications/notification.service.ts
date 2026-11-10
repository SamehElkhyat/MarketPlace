import { runInBackground } from '../../lib/background';
import type { OrderAttrs } from '../orders/order.model';
import type { OrderStatus } from '../orders/order-state-machine';
import { emailTransport } from './email-transport';
import {
  orderEmail,
  passwordResetEmail,
  verificationEmail,
  type OrderEmailKind,
} from './email-templates';
import type { EmailLocale } from './email-layout';

export interface Recipient {
  name: string;
  email: string;
  locale: EmailLocale;
}

/**
 * All sending is fire-and-forget after the HTTP response (`waitUntil` on Vercel),
 * so a slow mail provider never makes a customer wait — or fail — at checkout.
 */
export const notifications = {
  verifyEmail(to: Recipient, token: string): void {
    runInBackground(
      () => emailTransport.send({ to: to.email, ...verificationEmail({ name: to.name, token, locale: to.locale }) }),
      'email:verify',
    );
  },

  passwordReset(to: Recipient, token: string): void {
    runInBackground(
      () => emailTransport.send({ to: to.email, ...passwordResetEmail({ name: to.name, token, locale: to.locale }) }),
      'email:password-reset',
    );
  },

  order(kind: OrderEmailKind, to: Recipient, order: OrderAttrs): void {
    runInBackground(
      () => emailTransport.send({ to: to.email, ...orderEmail({ kind, name: to.name, locale: to.locale, order }) }),
      `email:order-${kind}`,
    );
  },

  /** Sends the e-mail (if any) that corresponds to an order status change. */
  orderStatusChanged(status: OrderStatus, to: Recipient, order: OrderAttrs): void {
    const kind: OrderEmailKind | null =
      status === 'paid' ? 'placed' : status === 'shipped' ? 'shipped' : status === 'delivered' ? 'delivered' : status === 'cancelled' ? 'cancelled' : null;
    if (kind) this.order(kind, to, order);
  },
};
