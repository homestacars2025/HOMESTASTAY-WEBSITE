import { createAdminClient } from '@/lib/supabase/admin';
import { isLibyaEligible } from './libya';
import type { BookingAccount } from '@/lib/booking/account';

/**
 * The same Libya rule, asked about an ACCOUNT rather than a booking.
 *
 * A booking carries the nationality the guest typed minutes ago. A wallet
 * top-up has no booking, and profiles has no nationality column — only a
 * phone. Phone alone would exclude the Libyan national living abroad on a
 * foreign number, who is exactly the customer the dinar rail exists for.
 *
 * So this also looks for a customers row the guest has already created by
 * booking, and reads the nationality off that. Matched on email — the account's
 * verified address, which is what create_booking_hold writes onto the customer
 * when p_profile_id is supplied.
 *
 * SERVICE-ROLE, and deliberately: customers is a CRM table with no guest-facing
 * RLS policy. Nothing from the row is returned — only a boolean — and the only
 * input is the session's own verified email.
 */
export async function isAccountLibyaEligible(account: BookingAccount): Promise<boolean> {
  // The cheap signal first. A Libyan number settles it with no query at all.
  if (isLibyaEligible({ nationality: null, phone: account.phone })) return true;

  const { data, error } = await createAdminClient()
    .from('customers')
    .select('nationality')
    .eq('email', account.email)
    .not('nationality', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Fail CLOSED. An unreadable table is not evidence that this guest is
    // Libyan, and offering a rail they cannot complete is the failure this
    // whole rule exists to prevent.
    console.error('[libya-account] nationality lookup failed — treating as not eligible', {
      profileId: account.profileId, message: error.message, code: error.code,
    });
    return false;
  }

  return isLibyaEligible({
    nationality: (data?.nationality as string | null) ?? null,
    phone: null,
  });
}
