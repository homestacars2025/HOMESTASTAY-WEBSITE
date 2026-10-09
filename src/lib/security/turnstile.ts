import 'server-only';

/**
 * Cloudflare Turnstile, verified on the server. Every SMS the website asks
 * Supabase to send passes through here first: an SMS costs money and a phone
 * field is the classic target for SMS pumping, so no human check, no SMS.
 *
 * FAILS CLOSED: without TURNSTILE_SECRET_KEY nothing is verified and nothing
 * is sent — the pages hide the phone option in that case (see
 * isPhoneAuthAvailable), so this is the backstop, not the UX.
 */
export { TURNSTILE_ACTION_PHONE } from './turnstile-action';

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyTurnstile(token: string | null | undefined, ip: string, expectedAction?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean; action?: string; 'error-codes'?: string[] };
    if (!data.success) {
      console.warn('[turnstile] rejected', { codes: data['error-codes'] ?? [] });
      return false;
    }
    if (expectedAction && data.action && data.action !== expectedAction) {
      console.warn('[turnstile] action mismatch', { expected: expectedAction, got: data.action });
      return false;
    }
    return true;
  } catch (err) {
    console.error('[turnstile] verification unavailable', { error: err instanceof Error ? err.message : 'unknown' });
    return false;
  }
}
