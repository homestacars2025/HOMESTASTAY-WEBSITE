import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cookie-less anon client for PUBLIC reads (listings, unit detail, prices).
 *
 * WHY NOT the cookie-based server client:
 *   Public listing data never depends on the visitor's session, and
 *   unstable_cache() cannot wrap a function that touches cookies()/headers()
 *   — it throws. So every cacheable read must use a client with no request
 *   scope. Anon key + RLS is exactly right: it sees the same public rows a
 *   guest would, and quote_units is granted to anon.
 *
 * Never use this for anything user-specific or for writes — that is the
 * cookie client (server.ts) or the service-role client (admin.ts).
 */
let cached: SupabaseClient | null = null;

export function createPublicClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return cached;
}
