/* ---------------------------------------------------------------------------
 * WhatsApp deep links
 *
 * wa.me requires a digits-only international number: no '+', no spaces, no
 * dashes, no leading zero. The client enters it however they like in the CMS
 * ("+62 811 234 5678"), so normalisation happens here, once, and every CTA on
 * the site goes through this module. There is no second place to get it wrong.
 *
 * NOTE ON THE SOURCE NUMBER: the mockups disagree with themselves — the home
 * and expertise pages show "+62 811 234 5678" while the inquiries page shows a
 * redacted "+62 811-XXXX-XXXX". The real number is whatever the client puts in
 * Site Settings; the seeded default follows the home page.
 * ------------------------------------------------------------------------- */

/**
 * Strip everything that is not a digit.
 *
 * Also drops a single leading zero after the country code, the most common way
 * an Indonesian number gets pasted in ("+62 0811..." -> "62811..."). A number
 * with a stray zero produces a wa.me link that silently 404s, and nobody
 * notices until the leads stop.
 */
export function normalizeWhatsAppNumber(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  // "620811..." -> "62811..."
  if (digits.startsWith('620')) return `62${digits.slice(3)}`;
  // A bare local Indonesian number "0811..." -> "62811..."
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

export type WhatsAppLinkOptions = {
  number: string;
  message?: string;
  /** Appended to the message so you can tell which page produced the lead. */
  context?: string;
};

/**
 * Build a wa.me URL.
 *
 * We use wa.me rather than api.whatsapp.com/send because it resolves to the
 * native app on mobile and to WhatsApp Web on desktop without an interstitial.
 */
export function buildWhatsAppUrl({
  number,
  message,
  context,
}: WhatsAppLinkOptions): string {
  const normalized = normalizeWhatsAppNumber(number);
  const base = `https://wa.me/${normalized}`;

  const text = [message, context].filter(Boolean).join('\n\n');
  if (!text) return base;

  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Human-readable rendering for display next to the link. */
export function formatWhatsAppNumber(raw: string): string {
  const digits = normalizeWhatsAppNumber(raw);
  if (!digits) return '';
  // +62 811 234 5678
  const country = digits.slice(0, 2);
  const rest = digits.slice(2);
  const grouped = rest.replace(/(\d{3})(?=\d)/g, '$1 ');
  return `+${country} ${grouped}`.trim();
}
