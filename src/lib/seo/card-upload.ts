import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET, cardObjectPath } from './card-store';

/**
 * Writing generated share cards to Storage — SERVER ONLY, service-role.
 *
 * Split from ./card-store so that the read side (URLs, versions, the existence
 * check) stays importable from page metadata. supabase/admin throws the moment
 * it is evaluated in a browser bundle, so the write half has to be reachable
 * only from route handlers.
 */

/**
 * Create the bucket if it is not there, once per process.
 *
 * Self-provisioning on purpose: the alternative is a deploy that silently fails
 * to store anything until somebody remembers to click through a dashboard. An
 * "already exists" error IS the success case and is swallowed; anything else is
 * reported and the caller falls back to serving from the route.
 */
let bucketEnsured = false;
async function ensureBucket(): Promise<boolean> {
  if (bucketEnsured) return true;

  const { error } = await createAdminClient().storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    fileSizeLimit: '2MB',
  });

  // The SDK reports an existing bucket as an error, which it is not, here.
  if (error && !/already exists/i.test(error.message)) {
    console.error('[og:store] createBucket failed', { message: error.message });
    return false;
  }
  bucketEnsured = true;
  return true;
}

/** Write one card. Returns false on any failure — never throws at the caller. */
export async function storeCard(
  slug: string,
  locale: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<boolean> {
  try {
    if (!(await ensureBucket())) return false;

    const { error } = await createAdminClient()
      .storage.from(BUCKET)
      .upload(cardObjectPath(slug, locale), bytes, {
        contentType,
        upsert: true,
        // The URL carries its own version, so the object itself may be cached
        // hard and long at the edge.
        cacheControl: '31536000',
      });

    if (error) {
      console.error('[og:store] upload failed', { slug, locale, message: error.message });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[og:store] upload threw', { slug, locale, error });
    return false;
  }
}
