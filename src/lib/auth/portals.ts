/**
 * Where accounts that are not guests belong. Hosts are handed off to their
 * portal already signed in; staff are pointed at their own sign-in.
 */
export const HOST_PORTAL_ORIGIN = 'https://host.homestastay.com';
export const TEAM_PORTAL_URL    = 'https://team.homestastay.com/login';
export const ADMIN_PORTAL_URL   = 'https://admin.homestastay.com/login';

/** The portal's one-time handoff endpoint (HS-HOST: /api/auth/handoff). */
export function hostHandoffUrl(tokenHash: string, locale: string): string {
  const url = new URL('/api/auth/handoff', HOST_PORTAL_ORIGIN);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('locale', locale);
  return url.toString();
}
