import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { accountKind } from '@/lib/auth/account-role';
import { continueUrl } from '@/lib/auth/continue-url';

/**
 * Server-side gate for account-specific pages.
 *
 * Verified on the SERVER, never only on the client — CLAUDE.md §10. A client
 * check is a UX affordance; this is the boundary.
 *
 * WHY THE email_confirmed_at CHECK IS NOT REDUNDANT
 *   With "Confirm email" on, Supabase issues no session until the address is
 *   verified, so in the normal flow an unconfirmed user never reaches here.
 *   But that is a property of a provider setting someone can toggle off in a
 *   dashboard, and sessions minted while it was off outlive the change. This
 *   makes the guarantee a property of the code instead.
 *
 * Accounts are keyed on a verified email (bookings, wallet, My bookings), so
 * a phone-only session is sent to finish its profile, not let through.
 *
 * NOT FOR THE BOOKING FLOW. Booking deliberately requires no account — see
 * CLAUDE.md §4. Only account-specific surfaces (my bookings, saved
 * preferences) call this.
 */
export async function requireConfirmedUser(
  locale: string,
  returnPath: string,
): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const returnUrl = encodeURIComponent(returnPath);

  if (!user) {
    redirect(`/${locale}/sign-in?returnUrl=${returnUrl}`);
  }

  // The customer area is for guests. A host, staff or blocked session is sent
  // through /api/auth/continue, which hands a host to the portal, points staff
  // at their sign-in, and signs this website session out for both. First, so
  // no such account is ever asked to "complete" a guest profile below.
  if ((await accountKind(user.id)) !== 'customer') {
    redirect(continueUrl(returnPath, locale));
  }

  if (!user.email) {
    // Signed in by phone, email not added — or added but its code not entered
    // yet (a pending address waits in new_email, so .email is still empty).
    // /verify-email would open with no address and no way forward; finishing
    // the profile is the step they actually have left.
    redirect(`/${locale}/complete-profile?returnUrl=${returnUrl}`);
  }

  if (!user.email_confirmed_at) {
    // They have a session but an unverified address. Send them to the same
    // place a fresh signup lands, with the resend option, rather than to
    // sign-in — signing in again would only reproduce the same state.
    redirect(
      `/${locale}/verify-email?email=${encodeURIComponent(user.email ?? '')}` +
        `&returnUrl=${returnUrl}`,
    );
  }

  return user;
}
