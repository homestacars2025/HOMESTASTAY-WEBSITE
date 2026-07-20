import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

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
