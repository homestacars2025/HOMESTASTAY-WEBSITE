// Single source of truth for Homesta Stay contact / social links.
// The SiteFooter, contact page, and any other surface import from here.
// Update href values here — they propagate everywhere automatically.

export const CONTACT_EMAIL = 'info@homestastay.com';

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
  { key: 'whatsapp',  href: '#', isPlaceholder: true },
] as const;
