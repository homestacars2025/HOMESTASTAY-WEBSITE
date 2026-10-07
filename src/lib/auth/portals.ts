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

/** Where a handoff lands when nothing more specific was asked for. */
export const HOST_DEFAULT_NEXT: HostNextPath = '/units';

/**
 * A website path that is really a PORTAL page — "/units", or "/en/units" —
 * mapped to the portal path. These must never be treated as website
 * destinations: the website has no /units, so they would 404 here.
 */
export function portalPathOf(raw: string | null | undefined, locales: readonly string[]): HostNextPath | null {
  if (!raw || !raw.startsWith('/')) return null;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  const bare = segments.length > 0 && locales.includes(segments[0]) ? `/${segments.slice(1).join('/')}` : path;
  return hostNextPath(bare);
}

/**
 * The portal's one-time handoff endpoint (HS-HOST: /api/auth/handoff).
 *
 * `next` is ALWAYS sent — the default when none was asked for. The portal's
 * handoff turned a missing `next` into /{locale}null (e.g. /en/ennull, a 404):
 * that is the "signed in as a host, got a 404" bug of 2026-10-07. Sending a
 * valid value means this side can never hit it, whatever the portal does.
 */
export function hostHandoffUrl(tokenHash: string, locale: string, next?: HostNextPath | null): string {
  const url = new URL('/api/auth/handoff', HOST_PORTAL_ORIGIN);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('locale', locale);
  url.searchParams.set('next', next ?? HOST_DEFAULT_NEXT);
  return url.toString();
}
