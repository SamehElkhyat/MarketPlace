/**
 * Brand-consistent e-mail layout ("Alabaster & Walnut"). E-mail clients do not support CSS variables,
 * so the palette is mirrored here as constants — keep in sync with the storefront design tokens.
 */
export const EMAIL_BRAND = {
  background: '#F4F1EB',
  card: '#FBFAF7',
  foreground: '#1F1A16',
  muted: '#6F675D',
  border: '#CFC6B8',
  primary: '#3E2F25',
  primaryForeground: '#FBFAF7',
  accent: '#9C5B3B',
  serif: "'Cormorant Garamond', Garamond, 'Times New Roman', serif",
  sans: "'IBM Plex Sans Arabic', Inter, 'Segoe UI', Tahoma, Arial, sans-serif",
} as const;

export type EmailLocale = 'ar' | 'en';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LayoutInput {
  locale: EmailLocale;
  title: string;
  preheader: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footer: string;
  brandName: string;
}

export function renderLayout(input: LayoutInput): string {
  const { locale, title, preheader, bodyHtml, cta, footer, brandName } = input;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const align = locale === 'ar' ? 'right' : 'left';
  const c = EMAIL_BRAND;

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 8px"><tr><td style="background:${c.primary};border-radius:2px">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 32px;color:${c.primaryForeground};text-decoration:none;font-family:${c.sans};font-size:14px;letter-spacing:.04em">${escapeHtml(cta.label)}</a>
      </td></tr></table>`
    : '';

  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${c.background};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.background};padding:40px 16px">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
      <tr><td style="padding:0 0 24px;text-align:center;font-family:${c.serif};font-size:28px;font-weight:300;letter-spacing:.12em;color:${c.foreground}">${escapeHtml(brandName)}</td></tr>
      <tr><td style="background:${c.card};border:1px solid ${c.border};border-radius:2px;padding:40px 36px;text-align:${align};font-family:${c.sans};color:${c.foreground};font-size:15px;line-height:1.7">
        <h1 style="margin:0 0 20px;font-family:${c.serif};font-weight:400;font-size:28px;line-height:1.25;color:${c.foreground}">${escapeHtml(title)}</h1>
        ${bodyHtml}
        ${button}
      </td></tr>
      <tr><td style="padding:24px 8px 0;text-align:center;font-family:${c.sans};font-size:12px;color:${c.muted}">${escapeHtml(footer)}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
