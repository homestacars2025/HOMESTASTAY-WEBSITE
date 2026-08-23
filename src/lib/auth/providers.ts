import { unstable_cache } from 'next/cache';

/**
 * Is Google sign-in actually enabled on the Supabase project?
 *
 * WHY THIS GUARD EXISTS — measured, not hypothetical.
 *   signInWithOAuth does a top-level redirect to
 *   {SUPABASE_URL}/auth/v1/authorize. When the provider is turned off there,
 *   Supabase answers that navigation with a bare JSON body:
 *
 *     {"code":400,"error_code":"validation_failed",
 *      "msg":"Unsupported provider: provider is not enabled"}
 *
 *   The guest is now looking at raw JSON on a supabase.co URL, with no way
 *   back. Nothing on our side can catch it: the browser has already left the
 *   page, so there is no promise to reject and no error boundary in scope.
 *
 *   So the button is not rendered at all unless the provider answers for
 *   itself. Enabling Google in the dashboard makes it appear within the
 *   revalidate window below — no deploy needed — and disabling it takes the
 *   button away again just as quietly.
 *
 * The settings endpoint is public (it is what the auth client reads to decide
 * which buttons a hosted UI shows) and needs only the anon key.
 */

const SETTINGS_TIMEOUT_MS = 3000;

export const isGoogleAuthEnabled = unstable_cache(
  async (): Promise<boolean> => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return false;

    try {
      const res = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(SETTINGS_TIMEOUT_MS),
        cache: 'no-store',
      });
      if (!res.ok) return false;

      const body: unknown = await res.json();
      const external =
        body && typeof body === 'object' && 'external' in body
          ? (body as { external?: Record<string, unknown> }).external
          : undefined;

      return external?.google === true;
    } catch (error) {
      // Fail CLOSED. An unreachable settings endpoint means we cannot promise
      // the redirect will work, and a hidden button costs a guest one extra
      // form; a broken one costs them the sign-in.
      console.error('[auth] provider settings lookup failed', { error });
      return false;
    }
  },
  ['auth-provider-settings'],
  { revalidate: 300 },
);
