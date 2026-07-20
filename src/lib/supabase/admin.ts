/**
 * Service-role Supabase client — SERVER ONLY.
 *
 * The booking RPCs (create_booking_hold, start_payment_attempt,
 * complete_payment) are SECURITY DEFINER and granted to service_role alone.
 * The anon client in ./server.ts cannot reach them by design: if
 * create_booking_hold were callable by anon, anyone could hold every unit for
 * 30 minutes on repeat and shut down sales at no cost to themselves.
 *
 * This client bypasses RLS entirely. Every caller is responsible for its own
 * authorisation — never hand it a table name derived from user input, and
 * never return its rows to the client unfiltered.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Hard stop rather than a lint rule. If this module is ever pulled into a
 * Client Component bundle the import itself fails loudly in development,
 * instead of shipping a build that quietly reads `undefined` for the key.
 */
if (typeof window !== 'undefined') {
  throw new Error(
    '[supabase/admin] imported in the browser. This module holds the ' +
      'service-role key and must only be used from Server Actions and ' +
      'Route Handlers.'
  );
}

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      '[supabase/admin] NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY must both be set.'
    );
  }

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cached;
}
