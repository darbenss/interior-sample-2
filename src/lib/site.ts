import settings from '@/content/settings/site.json';

/* ---------------------------------------------------------------------------
 * Site settings, read once at build time.
 *
 * A direct JSON import rather than a content collection: this is a singleton,
 * it is needed synchronously inside every layout, and importing it statically
 * means Vite inlines it — no async read, no chance of a layout rendering before
 * the WhatsApp number is available.
 * ------------------------------------------------------------------------- */

export type SiteSettings = {
  studioName: string;
  tagline: string;
  whatsappNumber: string;
  whatsappDefaultMessage: string;
  email: string;
  addressLines: string[];
  instagram: string;
  linkedin: string;
  analyticsProvider: 'gtag' | 'dataLayer' | 'plausible' | 'cloudflare';
  analyticsId: string;
};

export const site = settings as SiteSettings;

export const nav = [
  { label: 'Home', href: '/' },
  { label: 'The Studio', href: '/studio' },
  { label: 'Expertise', href: '/expertise' },
  { label: 'Portfolio', href: '/portfolio' },
  { label: 'Journal', href: '/journal' },
  { label: 'Inquiries', href: '/inquiries' },
] as const;

export const categoryLabel: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  hospitality: 'Hospitality',
};
