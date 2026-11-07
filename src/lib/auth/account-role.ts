import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Which door an account belongs behind, from profiles.role and status — the
 * same source of truth the host portal's gate reads.
 *
 *   customer  the website (also: no profile row yet, or the column default)
 *   owner     the host portal, via the one-time handoff
 *   team      team.homestastay.com
 *   admin     admin.homestastay.com
 *   blocked   any status other than 'active' — whatever the role
 *
 * Read with the service role: this decides where a session may go, so it
 * must not depend on the session's own RLS view of its row. Only the two
 * columns are read, and only for the caller's own id.
 */
export type AccountKind = 'customer' | 'owner' | 'team' | 'admin' | 'blocked';

export async function accountKind(userId: string): Promise<AccountKind> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('role, status')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // Unknown is treated as a guest, the least-privileged door on this site.
    // A host or staff member then simply stays a guest for one request; no
    // one is handed anything they were not already entitled to here.
    console.error('[account-role] read failed', { userId, code: error.code, message: error.message });
    return 'customer';
  }
  return kindFor(data?.role ?? null, data?.status ?? null);
}

/**
 * Whether the account may use the guest side of the site — book, My bookings,
 * Wallet, Account, Saved. Guests, and hosts too: a host books like anyone else
 * with the same account (decision 2026-11-07), except their OWN units, which
 * the database refuses (create_booking_hold → 'cannot_book_own_unit').
 * Staff and blocked accounts stay out.
 */
export function usesGuestArea(kind: AccountKind): boolean {
  return kind === 'customer' || kind === 'owner';
}

/** Same rule as HS-HOST isExplicitlyBlocked: only an explicit non-'active' blocks. */
export function kindFor(role: string | null, status: string | null): AccountKind {
  if (status != null && status !== 'active') return 'blocked';
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  if (role === 'team')  return 'team';
  return 'customer';
}
