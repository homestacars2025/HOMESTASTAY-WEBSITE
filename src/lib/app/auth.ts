import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

/**
 * Bearer-token authentication for the mobile app's API surface. SERVER ONLY.
 *
 * WHY THIS EXISTS ALONGSIDE lib/supabase/server.ts
 *   The website authenticates from a cookie. A native app has no cookie jar we
 *   share — it holds a Supabase access token and sends it in a header. Same
 *   identity, different transport, so it needs its own door.
 *
 * ⚠️ THE CLIENT RETURNED HERE CARRIES THE USER'S JWT, AND THAT IS THE WHOLE
 * POINT. start_wallet_topup checks `auth.uid() = p_profile_id` itself. A plain
 * anon client has no auth.uid() and the RPC refuses; a service-role client has
 * no auth.uid() either and the check silently becomes an assertion the caller
 * makes about itself rather than a fact the database verifies. Injecting the
 * token into the Authorization header is what makes PostgREST set auth.uid()
 * to this user — the exact guarantee the cookie client gives the website.
 *
 * NEVER swap this for createAdminClient() to "make it work". If it fails, the
 * token is the problem, and failing is correct.
 */

export interface AppCaller {
  user: User;
  /** Scoped to this user: RLS applies, auth.uid() is set. */
  supabase: SupabaseClient;
}

/** Reads the bearer token, or null when the header is absent or malformed. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

/**
 * A Supabase client that acts AS the bearer's user.
 *
 * Not memoised, unlike createPublicClient: each request carries a different
 * token, and a cached client would serve one caller's identity to the next.
 */
export function createTokenClient(token: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/**
 * Who is calling, verified against the auth server.
 *
 * getUser(token), not a local JWT decode: this is an authorisation decision,
 * and only the round trip proves the token has not been revoked. The website
 * makes the same call for the same reason.
 *
 * Returns null for absent, malformed, expired or revoked — the caller answers
 * 401 for all of them without distinguishing.
 */
export async function authenticate(request: Request): Promise<AppCaller | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const supabase = createTokenClient(token);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    // Logged without the token itself, obviously — this line exists to tell a
    // rejected app build apart from an outage.
    console.warn('[app/auth] token rejected', { message: error?.message });
    return null;
  }

  // Mirrors requireConfirmedUser: an unverified address must not reach a
  // money path, whatever the auth provider's current dashboard setting says.
  if (!data.user.email_confirmed_at) {
    console.warn('[app/auth] email not confirmed', { profileId: data.user.id });
    return null;
  }

  return { user: data.user, supabase };
}
