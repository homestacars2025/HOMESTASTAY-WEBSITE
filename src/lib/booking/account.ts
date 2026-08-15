import { createClient } from '@/lib/supabase/server';

/**
 * Who is booking, when a session exists. SERVER ONLY.
 *
 * Read in one place because two callers need exactly the same answer and must
 * not be able to disagree: the checkout page (which prefills and locks the
 * fields) and createHoldAction (which decides what actually reaches the RPC).
 * If the page showed one address and the action sent another, the guest would
 * see a booking filed under details they never agreed to — which is the bug
 * this whole change exists to close.
 *
 * Returns null for an anonymous visitor. Booking without an account stays
 * supported (CLAUDE.md §4); this is about not lying to guests who HAVE one.
 */

export interface BookingAccount {
  profileId: string;
  /** auth.users.email — the address the session is authenticated as. */
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** profiles.phone, E.164. Null on accounts that never captured one. */
  phone: string | null;
}

export async function getBookingAccount(): Promise<BookingAccount | null> {
  const supabase = await createClient();

  // getUser(), not getSession(): the email here becomes the identity on a
  // booking, so it has to be revalidated with the auth server rather than
  // trusted from a cookie.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('first_name, last_name, phone')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    // The session is real, so the guest can still book — they just fill the
    // name and phone by hand this once. Failing the whole checkout because a
    // convenience read failed would be the wrong trade.
    console.error('[booking/account] profile read failed', {
      profileId: user.id, message: error.message, code: error.code,
    });
  }

  return {
    profileId: user.id,
    // auth.users.email, never profiles.email: profiles is a copy that can
    // drift, and this value is what the wallet gate compares against on the
    // result page. One source, one answer.
    email:     user.email.trim().toLowerCase(),
    firstName: nonEmpty(profile?.first_name),
    lastName:  nonEmpty(profile?.last_name),
    phone:     nonEmpty(profile?.phone),
  };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
