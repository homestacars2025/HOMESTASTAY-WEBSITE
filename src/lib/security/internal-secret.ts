import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Shared secrets for the database's own calls into this site — the cache
 * revalidation webhook and the TLYNC reconcile sweep.
 *
 * The database keeps the value it SENDS in Supabase Vault, readable only with
 * the service role via get_internal_secret(). The site used to compare against
 * a Vercel env var alone, and the two drifted: both routes rejected every
 * database call. So a request is now accepted when its header matches EITHER
 * the env var (unchanged behaviour) OR the Vault value — one rotation on
 * either side no longer takes the route down.
 *
 * The Vault value is cached in memory for 60 s. On a mismatch it is fetched
 * again once before rejecting, so a secret rotated in Vault is honoured at
 * the next call rather than a minute later — but no more than once every 5 s,
 * so a stream of wrong guesses cannot turn into a stream of Vault reads.
 *
 * The secret is never logged, returned or put in an error.
 */

export type InternalSecretName = 'revalidate_secret' | 'tlync_reconcile_secret';

const TTL_MS            = 60_000;
const MIN_REFETCH_MS    = 5_000;

interface Entry { value: string | null; fetchedAt: number }
const cache    = new Map<InternalSecretName, Entry>();
const inFlight = new Map<InternalSecretName, Promise<Entry>>();

/**
 * Constant-time equality. Both sides are hashed first so the comparison runs
 * on equal-length buffers: timingSafeEqual would throw on a length mismatch,
 * and an early length check would leak the secret's length.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

async function fetchFromVault(name: InternalSecretName): Promise<Entry> {
  const pending = inFlight.get(name);
  if (pending) return pending;

  const request = (async (): Promise<Entry> => {
    let value: string | null = null;
    try {
      const { data, error } = await createAdminClient().rpc('get_internal_secret', { p_name: name });
      if (error) {
        console.error('[internal-secret] vault read failed', { name, code: error.code, message: error.message });
      } else if (typeof data === 'string' && data.length > 0) {
        value = data;
      }
    } catch (err) {
      console.error('[internal-secret] vault read threw', {
        name, error: err instanceof Error ? err.message : 'unknown',
      });
    }
    // A failed read is cached as null too, for the same window — a Vault
    // outage must not become one RPC per incoming request.
    const entry = { value, fetchedAt: Date.now() };
    cache.set(name, entry);
    return entry;
  })();

  inFlight.set(name, request);
  try {
    return await request;
  } finally {
    inFlight.delete(name);
  }
}

/**
 * True when `provided` matches the env var or the Vault secret `name`.
 * An empty or missing header is always false.
 */
export async function isInternalSecret(
  provided: string | null | undefined,
  { env, name }: { env: string | undefined; name: InternalSecretName },
): Promise<boolean> {
  if (!provided) return false;

  if (env && safeEqual(provided, env)) return true;

  const now = Date.now();
  let entry = cache.get(name);
  const fresh = entry !== undefined && now - entry.fetchedAt < TTL_MS;
  if (!fresh) entry = await fetchFromVault(name);
  if (entry?.value && safeEqual(provided, entry.value)) return true;

  // A fresh cache that did not match may simply be stale (rotated in Vault):
  // read once more before refusing — rate-limited, see above.
  if (fresh && entry && now - entry.fetchedAt >= MIN_REFETCH_MS) {
    entry = await fetchFromVault(name);
    if (entry.value && safeEqual(provided, entry.value)) return true;
  }

  return false;
}
