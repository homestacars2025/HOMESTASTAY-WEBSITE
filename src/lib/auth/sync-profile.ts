'use server';

import { createClient } from '@/lib/supabase/server';
import { profileGap, toE164, type ProfileGap } from '@/lib/auth/profile-gap';

export interface SyncProfileResult {
  gap: ProfileGap;
  /** The verified number is already on another profile; it was not saved. */
  phoneTaken: boolean;
}

const NAME_MAX = 80;

/** Trimmed, control characters out, capped. Empty → null. */
function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX);
  return v === '' ? null : v;
}

/**
 * Copy what the auth server has VERIFIED into the guest's profile row, and
 * report what is still missing. Called after every successful code: phone
 * sign-in, email confirmation, email_change, phone_change.
 *
 * WHY A SERVER ACTION
 *   The phone and email written here are read from getUser() on the server —
 *   revalidated with the auth server, never taken from the browser — so a
 *   caller cannot put an unverified number on a profile. Only the names come
 *   from the client, and they are validated here (CLAUDE.md §10).
 *
 * WHAT GETS WRITTEN
 *   phone  E.164 WITH the '+' (auth.users stores it without). A verified
 *          number replaces whatever was there: before phone-first, sign-up
 *          wrote the number from the form unchecked.
 *   email  auth.users.email once confirmed.
 *   names  only into empty columns — COALESCE(existing, new), the same shape
 *          as the OAuth callback and the booking RPC.
 *   Never role or status: handle_new_auth_user sets those and
 *   protect_profile_fields guards them.
 *
 * profiles.phone is UNIQUE. A clash (23505) means the number sits on another
 * profile — typically an owner row typed in by hand. The rest is saved, the
 * phone is not, and the caller is told so it can say something true.
 */
export async function syncProfileFromAuth(
  input: { firstName?: string; lastName?: string } = {},
): Promise<SyncProfileResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const firstName = cleanName(input.firstName);
  const lastName  = cleanName(input.lastName);
  const phone     = user.phone_confirmed_at ? toE164(user.phone) : null;
  const email     = user.email_confirmed_at && user.email ? user.email.trim().toLowerCase() : null;

  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select('email, first_name, last_name, phone')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    console.error('[sync-profile] read failed', {
      profileId: user.id, message: readError.message, code: readError.code,
    });
    return { gap: profileGap(user, firstName), phoneTaken: false };
  }

  if (!existing) {
    // The trigger did not create the row — the failure the pending migration
    // closes. Same insert as the OAuth callback; 23505 means the trigger won
    // a race, which is a success.
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      email,
      first_name: firstName,
      last_name:  lastName,
      phone,
      role:   'customer',
      status: 'active',
    });
    if (!error || error.code === '23505') {
      return { gap: profileGap(user, firstName), phoneTaken: false };
    }
    console.error('[sync-profile] insert failed', {
      profileId: user.id, message: error.message, code: error.code,
    });
    return { gap: profileGap(user, firstName), phoneTaken: false };
  }

  const isBlank = (v: unknown) => !(typeof v === 'string' && v.trim() !== '');

  const patch: Record<string, string> = {};
  if (firstName && isBlank(existing.first_name)) patch.first_name = firstName;
  if (lastName  && isBlank(existing.last_name))  patch.last_name  = lastName;
  if (email && existing.email !== email)         patch.email      = email;
  if (phone && existing.phone !== phone)         patch.phone      = phone;

  const savedFirst = patch.first_name ?? existing.first_name;
  let phoneTaken = false;

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);

    if (error?.code === '23505' && 'phone' in patch) {
      phoneTaken = true;
      console.warn('[sync-profile] verified phone already on another profile', { profileId: user.id });
      delete patch.phone;
      if (Object.keys(patch).length > 1) {
        const { error: retryError } = await supabase.from('profiles').update(patch).eq('id', user.id);
        if (retryError) {
          console.error('[sync-profile] update failed', {
            profileId: user.id, message: retryError.message, code: retryError.code,
          });
        }
      }
    } else if (error) {
      console.error('[sync-profile] update failed', {
        profileId: user.id, message: error.message, code: error.code,
      });
    }
  }

  return { gap: profileGap(user, savedFirst), phoneTaken };
}
