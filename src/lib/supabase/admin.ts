import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * `server-only` above is load-bearing: importing this from a "use client"
 * module is a build error, not a runtime surprise. The service key must never
 * reach the browser.
 *
 * Only for paths that genuinely cannot use the anon client. The owner decision
 * pages qualify: they are authenticated by a decision_token in the URL rather
 * than a Supabase session, so there is no `auth.uid()` for RLS to match on.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fail loudly at the call site rather than sending `Bearer undefined` and
  // getting an opaque 401 that looks like a bad token.
  if (!url || !key) {
    throw new Error(
      'createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set',
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
