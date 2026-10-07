/**
 * /api/auth/continue — the single place every sign-in ends, so where an
 * account belongs (guest, host, staff, blocked) is decided once, on the
 * server, from profiles.role and status. Client-safe: builds a URL only.
 *
 * Callers navigate to it with a FULL page load (window.location.assign, or a
 * server redirect), never a client-side push: the route sets and clears auth
 * cookies and may leave the site entirely (host portal handoff).
 *
 * `next` is the host portal page to open after a handoff (allow-listed again
 * by the route and by the portal); it is ignored for every other account.
 */
export function continueUrl(
  returnUrl: string | null | undefined,
  locale: string,
  next?: string | null,
): string {
  const query = new URLSearchParams({ locale });
  if (returnUrl) query.set('returnUrl', returnUrl);
  if (next) query.set('next', next);
  return `/api/auth/continue?${query.toString()}`;
}
