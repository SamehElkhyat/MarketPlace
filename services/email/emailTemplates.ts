import { env } from '../../config/env';
import type { OrderAttrs } from '../../models/Order';
import { EMAIL_BRAND, escapeHtml, renderLayout, type EmailLocale } from './emailLayout';
import type { OutgoingEmail } from './emailTransport';

type Rendered = Omit<OutgoingEmail, 'to'>;

const BRAND_NAME = 'ATELIER';

const copy = {
  ar: {
    footer: 'وصلتك هذه الرسالة لأنك تتعامل مع متجرنا. لو لم تطلب ذلك يمكنك تجاهلها.',
    hello: (name: string) => `أهلاً ${name}،`,
    verify: {
      subject: 'فعّل حسابك',
      title: 'أهلاً بك في أتيليه',
      body: 'شكراً لانضمامك. اضغط على الزر أدناه لتفعيل بريدك الإلكتروني. الرابط صالح لمدة 24 ساعة.',
      cta: 'تفعيل الحساب',
    },
    reset: {
      subject: 'إعادة تعيين كلمة المرور',
      title: 'إعادة تعيين كلمة المرور',
      body: 'تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. الرابط صالح لمدة 15 دقيقة ويُستخدم مرة واحدة فقط.',
      cta: 'اختيار كلمة مرور جديدة',
    },
    order: {
      placed: { subject: (n: string) => `تأكيد طلبك ${n}`, title: 'تم استلام طلبك', body: 'سنراجع طلبك ونتواصل معك قريباً لتأكيده.' },
      shipped: { subject: (n: string) => `تم شحن طلبك ${n}`, title: 'طلبك في الطريق إليك', body: 'تم تسليم طلبك لشركة الشحن وسيصلك خلال أيام قليلة.' },
      delivered: { subject: (n: string) => `تم تسليم طلبك ${n}`, title: 'تم تسليم طلبك', body: 'نتمنى أن ينال إعجابك. يسعدنا أن تشاركنا تقييمك للمنتجات.' },
      cancelled: { subject: (n: string) => `تم إلغاء طلبك ${n}`, title: 'تم إلغاء الطلب', body: 'تم إلغاء هذا الطلب وإرجاع المنتجات إلى المخزون.' },
      cta: 'عرض الطلب',
      number: 'رقم الطلب',
      subtotal: 'المجموع الفرعي',
      shipping: 'الشحن',
      discount: 'الخصم',
      total: 'الإجمالي',
      address: 'عنوان التوصيل',
      qty: 'الكمية',
    },
  },
  en: {
    footer: 'You are receiving this e-mail because you shop with us. If this was not you, you can ignore it.',
    hello: (name: string) => `Hello ${name},`,
    verify: {
      subject: 'Verify your account',
      title: 'Welcome to Atelier',
      body: 'Thank you for joining. Press the button below to verify your e-mail address. The link is valid for 24 hours.',
      cta: 'Verify e-mail',
    },
    reset: {
      subject: 'Reset your password',
      title: 'Reset your password',
      body: 'We received a request to reset your password. The link is valid for 15 minutes and can be used once.',
      cta: 'Choose a new password',
    },
    order: {
      placed: { subject: (n: string) => `Order confirmation ${n}`, title: 'We received your order', body: 'We will review your order and get in touch shortly to confirm it.' },
      shipped: { subject: (n: string) => `Your order ${n} has shipped`, title: 'Your order is on its way', body: 'Your order was handed to the courier and should arrive within a few days.' },
      delivered: { subject: (n: string) => `Your order ${n} was delivered`, title: 'Your order was delivered', body: 'We hope you love it. We would be glad to hear your review.' },
      cancelled: { subject: (n: string) => `Your order ${n} was cancelled`, title: 'Order cancelled', body: 'This order was cancelled and the items were returned to stock.' },
      cta: 'View order',
      number: 'Order number',
      subtotal: 'Subtotal',
      shipping: 'Shipping',
      discount: 'Discount',
      total: 'Total',
      address: 'Delivery address',
      qty: 'Qty',
    },
  },
} as const;

const money = (piasters: number, locale: EmailLocale) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP' }).format(piasters / 100);

const paragraph = (text: string) => `<p style="margin:0 0 16px">${escapeHtml(text)}</p>`;

function toText(parts: string[]): string {
  return parts.filter(Boolean).join('\n\n');
}

export function verificationEmail(args: { name: string; token: string; locale: EmailLocale }): Rendered {
  const t = copy[args.locale];
  const url = `${env.APP_URL}/${args.locale}/verify-email?token=${encodeURIComponent(args.token)}`;
  return {
    subject: t.verify.subject,
    html: renderLayout({
      locale: args.locale,
      title: t.verify.title,
      preheader: t.verify.body,
      bodyHtml: paragraph(t.hello(args.name)) + paragraph(t.verify.body),
      cta: { label: t.verify.cta, url },
      footer: t.footer,
      brandName: BRAND_NAME,
    }),
    text: toText([t.hello(args.name), t.verify.body, url]),
  };
}

export function passwordResetEmail(args: { name: string; token: string; locale: EmailLocale }): Rendered {
  const t = copy[args.locale];
  const url = `${env.APP_URL}/${args.locale}/reset-password?token=${encodeURIComponent(args.token)}`;
  return {
    subject: t.reset.subject,
    html: renderLayout({
      locale: args.locale,
      title: t.reset.title,
      preheader: t.reset.body,
      bodyHtml: paragraph(t.hello(args.name)) + paragraph(t.reset.body),
      cta: { label: t.reset.cta, url },
      footer: t.footer,
      brandName: BRAND_NAME,
    }),
    text: toText([t.hello(args.name), t.reset.body, url]),
  };
}

export type OrderEmailKind = 'placed' | 'shipped' | 'delivered' | 'cancelled';

type OrderEmailInput = Pick<
  OrderAttrs,
  'orderNumber' | 'items' | 'subtotal' | 'shippingFee' | 'discount' | 'total' | 'shippingAddress'
>;

export function orderEmail(args: {
  kind: OrderEmailKind;
  name: string;
  locale: EmailLocale;
  order: OrderEmailInput;
}): Rendered {
  const t = copy[args.locale];
  const o = t.order;
  const section = o[args.kind];
  const { order, locale } = args;
  const c = EMAIL_BRAND;
  const url = `${env.APP_URL}/${locale}/account/orders/${encodeURIComponent(order.orderNumber)}`;

  const cell = `padding:10px 0;border-bottom:1px solid ${c.border};font-size:14px`;
  const rows = order.items
    .map(
      (item) => `<tr>
        <td style="${cell}">${escapeHtml(item.title[locale])}<br><span style="color:${c.muted};font-size:12px">${escapeHtml(item.sku)} · ${o.qty} ${item.qty}</span></td>
        <td style="${cell};text-align:${locale === 'ar' ? 'left' : 'right'};white-space:nowrap">${money(item.lineTotal, locale)}</td>
      </tr>`,
    )
    .join('');

  const totalLine = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;font-size:14px;${strong ? 'font-weight:600' : `color:${c.muted}`}">${label}</td><td style="padding:4px 0;font-size:14px;text-align:${locale === 'ar' ? 'left' : 'right'};${strong ? 'font-weight:600' : ''}">${value}</td></tr>`;

  const a = order.shippingAddress;
  const body = `
    ${paragraph(t.hello(args.name))}
    ${paragraph(section.body)}
    <p style="margin:0 0 8px;color:${c.muted};font-size:13px">${o.number}</p>
    <p style="margin:0 0 20px;font-family:${c.serif};font-size:22px">${escapeHtml(order.orderNumber)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">
      ${totalLine(o.subtotal, money(order.subtotal, locale))}
      ${totalLine(o.shipping, money(order.shippingFee, locale))}
      ${order.discount > 0 ? totalLine(o.discount, `− ${money(order.discount, locale)}`) : ''}
      ${totalLine(o.total, money(order.total, locale), true)}
    </table>
    <p style="margin:24px 0 4px;color:${c.muted};font-size:13px">${o.address}</p>
    <p style="margin:0">${escapeHtml(a.fullName)}<br>${escapeHtml(a.street)}, ${escapeHtml(a.city)}<br>${escapeHtml(a.phone)}</p>`;

  return {
    subject: section.subject(order.orderNumber),
    html: renderLayout({
      locale,
      title: section.title,
      preheader: section.body,
      bodyHtml: body,
      cta: { label: o.cta, url },
      footer: t.footer,
      brandName: BRAND_NAME,
    }),
    text: toText([
      t.hello(args.name),
      section.body,
      `${o.number}: ${order.orderNumber}`,
      ...order.items.map((i) => `${i.title[locale]} × ${i.qty} — ${money(i.lineTotal, locale)}`),
      `${o.total}: ${money(order.total, locale)}`,
      url,
    ]),
  };
}
