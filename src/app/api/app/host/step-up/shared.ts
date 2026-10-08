import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { authenticate, bearerToken } from '@/lib/app/auth';
import { accountKind } from '@/lib/auth/account-role';
import { sessionIdFromVerifiedToken } from '@/lib/auth/session-id';
import { clientIp } from '@/lib/security/rate-limit';

/** JSON, never cached — these answers carry one-time credentials. */
export function json(body: unknown, status: number): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/**
 * The app caller, if it is an ACTIVE owner with a usable session id. Same
 * bearer auth as /api/app/wallet/*; the session id comes from the very token
 * getUser() just verified, so the code is bound to the app's own session.
 */
export async function appOwner(request: NextRequest) {
  const caller = await authenticate(request);
  if (!caller) return { error: json({ ok: false, error: 'unauthorized' }, 401) } as const;
  if ((await accountKind(caller.user.id)) !== 'owner' || !caller.user.email) {
    return { error: json({ ok: false, error: 'not_owner' }, 403) } as const;
  }
  const sessionId = sessionIdFromVerifiedToken(bearerToken(request) ?? '');
  if (!sessionId) return { error: json({ ok: false, error: 'unauthorized' }, 401) } as const;
  return {
    owner: { userId: caller.user.id, email: caller.user.email, sessionId, ip: clientIp(request.headers) },
  } as const;
}

/** Optional JSON body; anything unreadable is an empty object. */
export async function body(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
