/**
 * Where accounts that are not guests belong. Hosts are handed off to their
 * portal already signed in; staff are pointed at their own sign-in.
 */
export const HOST_PORTAL_ORIGIN = 'https://host.homestastay.com';
export const TEAM_PORTAL_URL    = 'https://team.homestastay.com/login';
export const ADMIN_PORTAL_URL   = 'https://admin.homestastay.com/login';

/**
 * Portal pages a handoff may land on — the same allow-list the portal's
 * /api/auth/handoff enforces. Anything else is dropped and the portal opens
 * its default (/units).
 */
export const HOST_NEXT_PATHS = ['/units', '/bookings', '/calendar', '/accounting', '/profile'] as const;
export type HostNextPath = (typeof HOST_NEXT_PATHS)[number];

export function hostNextPath(raw: string | null | undefined): HostNextPath | null {
  return (HOST_NEXT_PATHS as readonly string[]).includes(raw ?? '') ? (raw as HostNextPath) : null;
}

/** The portal's one-time handoff endpoint (HS-HOST: /api/auth/handoff). */
export function hostHandoffUrl(tokenHash: string, locale: string, next?: HostNextPath | null): string {
  const url = new URL('/api/auth/handoff', HOST_PORTAL_ORIGIN);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('locale', locale);
  if (next) url.searchParams.set('next', next);
  return url.toString();
}
