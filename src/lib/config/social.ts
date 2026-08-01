// Single source of truth for Homesta Stay contact / social links.
// The SiteFooter, contact page, and any other surface import from here.
// Update href values here — they propagate everywhere automatically.

export const CONTACT_EMAIL = 'info@homestastay.com';

/**
 * Support WhatsApp — single source of truth so the number can never drift.
 * The on-site channel is still a "coming soon" placeholder (see the whatsapp
 * entry in SOCIAL_LINKS below and the infoWhatsappNote copy). To GO LIVE later:
 * set the whatsapp SOCIAL_LINK to `href: SUPPORT_WHATSAPP_LINK, isPlaceholder:
 * false` and flip the "coming soon" strings to live.
 *
 * NOTE: the separate WhatsApp bot / owner-notification system reads
 * `app_settings.support_whatsapp` in the DB — NOT this constant. Keep both in
 * sync when the number changes.
 */
export const SUPPORT_WHATSAPP = '+905415439091';
/** wa.me requires digits only (no '+'). */
export const SUPPORT_WHATSAPP_LINK = `https://wa.me/${SUPPORT_WHATSAPP.replace(/[^\d]/g, '')}`;

export type SocialLink = {
  readonly key: 'email' | 'instagram' | 'facebook' | 'whatsapp';
  readonly href: string;
  readonly isEmail?: boolean;
  // isPlaceholder: href is not live yet; render as non-clickable / dimmed
  readonly isPlaceholder?: boolean;
};

export const SOCIAL_LINKS: readonly SocialLink[] = [
  { key: 'email',     href: `mailto:${CONTACT_EMAIL}`, isEmail: true },
  { key: 'instagram', href: 'https://www.instagram.com/homestastay' },
  { key: 'facebook',  href: 'https://www.facebook.com/share/1D7wLxSNzR/' },
  // Disabled "coming soon" placeholder. To go live: href: SUPPORT_WHATSAPP_LINK, isPlaceholder: false
  { key: 'whatsapp',  href: '#', isPlaceholder: true },
] as const;
