import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The current auth session's id (the JWT's `session_id` claim), read from
 * VERIFIED claims — getClaims() checks the token's signature — never from an
 * unverified cookie decode. Null when there is no valid session.
 */
export async function currentSessionId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sid = data?.claims?.session_id;
  if (error || typeof sid !== 'string' || !UUID_RE.test(sid)) return null;
  return sid;
}

/**
 * The same claim from a bearer token the caller has ALREADY verified with
 * getUser(token) (lib/app/auth). Decoding the payload is then safe: the auth
 * server just vouched for this exact token.
 */
export function sessionIdFromVerifiedToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    const sid = payload?.session_id;
    return typeof sid === 'string' && UUID_RE.test(sid) ? sid : null;
  } catch {
    return null;
  }
}
