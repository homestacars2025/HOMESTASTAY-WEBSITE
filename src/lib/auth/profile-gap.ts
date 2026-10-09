import type { User } from '@supabase/supabase-js';

/**
 * What an account still lacks before it is complete. Shared by the gate
 * (requireConfirmedUser), the /complete-profile page and the sync action, so
 * the three cannot disagree about whether somebody is "done".
 *
 * Only VERIFIED contact details count. auth.users.email / .phone are set only
 * once a code is confirmed — a pending change waits in new_email / new_phone —
 * so the confirmed_at stamps are checked as well for accounts created while
 * confirmation was switched off.
 *
 * Which gaps BLOCK anything is the caller's decision. Today only a missing
 * email does (bookings, wallet and my-bookings are keyed on it); a missing
 * phone is asked for at the end of email sign-up, never forced on an existing
 * account.
 */
export interface ProfileGap {
  email: boolean;
  name:  boolean;
  phone: boolean;
}

export function profileGap(user: User, firstName: string | null | undefined): ProfileGap {
  return {
    email: !user.email || !user.email_confirmed_at,
    name:  !firstName || firstName.trim() === '',
    phone: !user.phone || !user.phone_confirmed_at,
  };
}

/** auth.users.phone is stored without the '+'; profiles keeps E.164 with it. */
export function toE164(authPhone: string | null | undefined): string | null {
  const digits = (authPhone ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : null;
}

/**
 * A returnUrl is honoured only if it is a path on this site — the same rule as
 * the OAuth callback, for the same reason: an open redirect after sign-in is a
 * phishing primitive.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '';
}

/** /complete-profile, carrying the returnUrl through. */
export function completeProfilePath(returnUrl?: string): string {
  const safe = safeReturnPath(returnUrl);
  return `/complete-profile${safe ? `?returnUrl=${encodeURIComponent(safe)}` : ''}`;
}
