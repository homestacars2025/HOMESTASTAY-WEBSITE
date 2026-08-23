import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { routing } from '@/i18n/routing';

/**
 * The OAuth return leg. Google sends the guest back here with a code.
 *
 * WHY IT LIVES UNDER /api
 *   next-intl's matcher rewrites every path that is not excluded, and only
 *   `api`, `_next`, `_vercel` and the metadata routes are (see middleware).
 *   A callback at /auth/callback would 307 to /en/auth/callback, and Google
 *   only ever posts back to the exact URL registered in the provider — so the
 *   redirect would arrive at a URL the provider does not know, or drop the
 *   code. Under /api it is untouched, and no middleware change is needed.
 *
 * The email/password flow does not come through here at all. It calls
 * signInWithPassword in the browser and navigates itself, exactly as before.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Locale-prefixed absolute URL. Every public route on this site is prefixed. */
function localized(origin: string, locale: string, path: string): string {
  const safe = (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale;
  return `${origin}/${safe}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * A returnUrl is only honoured if it is a path on this site.
 *
 * An open redirect on an auth callback is the classic phishing primitive: the
 * guest signs in for real, lands on a copy of the site, and hands over whatever
 * it asks for next. Anything absolute, protocol-relative, or otherwise not
 * starting with a single slash is discarded in favour of the home page.
 */
function safeReturnUrl(raw: string | null): string {
  if (!raw) return '';
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return '';
  }
  if (!value.startsWith('/') || value.startsWith('//')) return '';
  return value;
}

/**
 * Guarantee the guest has a profile row, the same one the email flow produces.
 *
 * WHY THIS RUNS EVEN THOUGH A TRIGGER EXISTS
 *   DATABASE_SCHEMA records the row as created "on sign-up (via Supabase Auth
 *   trigger)", and the OTP path relies on that — it SELECTs and then UPDATEs,
 *   never inserts. But a guest with no profile is exactly the failure this is
 *   meant to prevent, and a trigger is not something this codebase can see or
 *   test. So the upsert is written to be correct whether or not one fires: it
 *   inserts when the row is missing and fills blanks when it is not.
 *
 * NOTHING ALREADY SET IS OVERWRITTEN. A guest who registered by email and
 * later signs in with Google keeps the name and phone they gave — Google's
 * `given_name` does not get to replace them. Same COALESCE(existing, new)
 * shape the OTP step and the booking RPC use.
 *
 * `role` is set explicitly on insert: the column defaults to 'account' and the
 * public site only ever creates 'customer' (DATABASE_SCHEMA §profiles).
 */
async function ensureProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
): Promise<void> {
  const meta = user.user_metadata ?? {};
  const str = (key: string): string | null => {
    const value = meta[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };

  // Google sends given_name/family_name; `name` (or full_name) is the fallback
  // for providers or accounts that only expose a display name.
  const display = str('full_name') ?? str('name');
  const [firstFromDisplay, ...restOfDisplay] = display ? display.split(/\s+/) : [];

  const first = str('given_name') ?? firstFromDisplay ?? null;
  const last = str('family_name') ?? (restOfDisplay.length ? restOfDisplay.join(' ') : null);

  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    console.error('[auth:callback] profile read failed', {
      userId: user.id, message: readError.message, code: readError.code,
    });
    return;
  }

  if (!existing) {
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      email: user.email ?? null,
      first_name: first,
      last_name: last,
      role: 'customer',
      status: 'active',
    });
    // 23505 = the trigger won the race and created it first, which is a
    // success for our purposes: the row exists.
    if (error && error.code !== '23505') {
      console.error('[auth:callback] profile insert failed', {
        userId: user.id, message: error.message, code: error.code,
      });
    }
    return;
  }

  const patch: Record<string, string> = {};
  const fill = (column: 'email' | 'first_name' | 'last_name', value: string | null) => {
    const current = existing[column as keyof typeof existing];
    if (value && !(typeof current === 'string' && current.trim() !== '')) {
      patch[column] = value;
    }
  };
  fill('email', user.email ?? null);
  fill('first_name', first);
  fill('last_name', last);

  if (Object.keys(patch).length === 0) return;

  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) {
    console.error('[auth:callback] profile patch failed', {
      userId: user.id, message: error.message, code: error.code,
    });
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // The origin of THIS request, so dev, preview and production each come back
  // to themselves without a hardcoded host.
  const origin = url.origin;

  const locale = url.searchParams.get('locale') ?? routing.defaultLocale;
  const returnUrl = safeReturnUrl(url.searchParams.get('returnUrl'));

  // The guest dismissed Google's consent screen, or the provider refused.
  // Google reports this as ?error=access_denied on the redirect.
  const providerError = url.searchParams.get('error');
  if (providerError) {
    const cancelled = providerError === 'access_denied';
    console.warn('[auth:callback] provider returned an error', {
      error: providerError,
      description: url.searchParams.get('error_description'),
    });
    return NextResponse.redirect(
      localized(origin, locale, `/sign-in?authError=${cancelled ? 'cancelled' : 'failed'}`),
    );
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(localized(origin, locale, '/sign-in?authError=failed'));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error('[auth:callback] code exchange failed', { message: error?.message });
    return NextResponse.redirect(localized(origin, locale, '/sign-in?authError=failed'));
  }

  // Never fatal: the session is valid and the guest is signed in either way.
  // A missing profile is worth shouting about in the logs, not worth bouncing
  // somebody back to a sign-in page they just completed.
  try {
    await ensureProfile(supabase, data.user);
  } catch (thrown) {
    console.error('[auth:callback] ensureProfile threw', { userId: data.user.id, thrown });
  }

  // The same destination the email flow uses: returnUrl, else home.
  return NextResponse.redirect(localized(origin, locale, returnUrl || '/'));
}
