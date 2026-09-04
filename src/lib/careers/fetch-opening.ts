import 'server-only';
import { parseFormSchema, parseOpening } from '@/lib/careers/validate';
import type { FormField, Opening } from '@/lib/careers/types';

/**
 * The recruitment Edge Function. SERVER ONLY.
 *
 * There is no listing surface and no direct table read: every opening this
 * site can show comes through here, and the function returns PUBLISHED
 * openings only. That is what makes the RLS question moot — the visibility
 * rule lives in one place we do not own, and cannot drift from what the
 * console shows.
 */

const FUNCTION_BASE =
  'https://djtpksherrayzxmunvkv.supabase.co/functions/v1/submit-application';

/**
 * Sixty seconds, and neither zero nor ten minutes.
 *
 * An opening that is stopped must stop accepting quickly — a career page that
 * keeps taking applications for a filled role wastes the applicant's time,
 * which is the one cost we cannot refund. But the POST re-checks and answers
 * 404 on a closed opening regardless, so this window can never actually admit
 * an application: it only decides how long a stale PAGE is reachable.
 */
export const OPENING_REVALIDATE_SECONDS = 60;

export type OpeningResult =
  | { status: 'ok'; opening: Opening; fields: FormField[] }
  /** Published, but its form cannot be rendered honestly. See parseFormSchema. */
  | { status: 'unusable_form'; opening: Opening }
  /** No such opening, or it is not published. Deliberately one answer. */
  | { status: 'not_found' }
  /** The function was unreachable or answered with something unusable. */
  | { status: 'unavailable' };

function anonKey(): string | null {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return key && key.trim() !== '' ? key : null;
}

export async function fetchOpening(slug: string): Promise<OpeningResult> {
  // The slug reaches us from the URL, so it is user input. Anything that is
  // not a plausible slug is a 404 without a network call — an unbounded string
  // in a path is how a proxy gets asked to fetch something else entirely.
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/i.test(slug)) return { status: 'not_found' };

  const key = anonKey();
  if (!key) {
    console.error('[careers/fetch] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
    return { status: 'unavailable' };
  }

  let response: Response;
  try {
    response = await fetch(`${FUNCTION_BASE}/opening/${encodeURIComponent(slug)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: OPENING_REVALIDATE_SECONDS },
    });
  } catch (err) {
    console.error('[careers/fetch] opening request failed', {
      slug, error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'unavailable' };
  }

  if (response.status === 404) return { status: 'not_found' };

  if (!response.ok) {
    console.error('[careers/fetch] opening request returned an error status', {
      slug, status: response.status,
    });
    return { status: 'unavailable' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    console.error('[careers/fetch] opening response was not JSON', { slug });
    return { status: 'unavailable' };
  }

  const envelope = body as { ok?: boolean; opening?: unknown } | null;
  if (!envelope?.ok || !envelope.opening) return { status: 'not_found' };

  const opening = parseOpening(envelope.opening);
  if (!opening) {
    console.error('[careers/fetch] opening payload missing slug or title', { slug });
    return { status: 'unavailable' };
  }

  // Re-parsed rather than read off `opening`, because the refusal reason is
  // what the page needs and Opening deliberately does not carry it.
  const schema = parseFormSchema(
    (envelope.opening as Record<string, unknown>).form_schema,
  );

  if (!schema.ok) return { status: 'unusable_form', opening };

  return { status: 'ok', opening, fields: schema.fields };
}

/** The POST target. Exported so the Server Action and this file agree on one string. */
export const SUBMIT_URL = `${FUNCTION_BASE}/`;
export { anonKey };
