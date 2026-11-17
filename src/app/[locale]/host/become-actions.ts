'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { accountKind } from '@/lib/auth/account-role';
import { allow } from '@/lib/security/rate-limit';
import { ATTRIBUTION_COOKIE, parseAttribution } from '@/lib/analytics/attribution';

/**
 * Self-serve "Become a host": public.become_host(p_meta), called AS THE USER
 * (cookie client — the RPC acts on auth.uid() and is not granted to anon).
 *
 * The database decides who may: an active 'customer' with a verified phone or
 * email → role 'owner' (the owners row and the Relations/admin notification
 * are its own doing). It creates NO lead — self-signup hosts are not leads.
 *
 * One extra rule here: a VERIFIED EMAIL. The host portal signs people in only
 * through a one-time link minted from the account's email (lib/auth/host-otp
 * mintHostHandoff), so a host without one could never open the portal. Such an
 * account is sent to /complete-profile first (product decision 2026-11-17:
 * on this path the email code is the one verification).
 */

export type BecomeHostResult =
  | {
      ok: true;
      /** 'became' = this call made the account a host; 'already_host' = it was one. */
      status: 'became' | 'already_host';
      /** The account id — the pixel's dedupe id. Never shown. */
      accountId: string;
      /** Made within the last two hours: CompleteRegistration belongs to this path. */
      newAccount: boolean;
    }
  | { ok: false; error: 'signed_out' | 'needs_email' | 'not_allowed' | 'rate_limited' | 'generic' };

const NEW_ACCOUNT_MS = 2 * 60 * 60 * 1000;

export async function becomeHost(): Promise<BecomeHostResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'signed_out' };

  if (!allow(`become-host:${user.id}`, 10, 60 * 60 * 1000)) return { ok: false, error: 'rate_limited' };

  const createdAt = Date.parse(user.created_at ?? '');
  const newAccount = Number.isFinite(createdAt) && Date.now() - createdAt < NEW_ACCOUNT_MS;

  const kind = await accountKind(user.id);
  if (kind === 'owner') return { ok: true, status: 'already_host', accountId: user.id, newAccount };
  if (kind !== 'customer') return { ok: false, error: 'not_allowed' };

  if (!user.email || !user.email_confirmed_at) return { ok: false, error: 'needs_email' };

  // The saved ad tags (30-day first-party cookie), exactly the keys the RPC
  // stores — or null for an organic visitor.
  const meta = parseAttribution((await cookies()).get(ATTRIBUTION_COOKIE)?.value);

  const { data, error } = await supabase.rpc('become_host', { p_meta: meta });
  if (error) {
    const m = `${error.message} ${error.details ?? ''} ${error.hint ?? ''}`;
    if (m.includes('verify_phone_or_email_first')) return { ok: false, error: 'needs_email' };
    if (m.includes('not_allowed')) return { ok: false, error: 'not_allowed' };
    console.error('[become-host] rpc failed', { code: error.code, message: error.message });
    return { ok: false, error: 'generic' };
  }

  const status = data && typeof data === 'object' && !Array.isArray(data) ? (data as { status?: unknown }).status : data;
  console.log('[become-host] done', { userId: user.id, status, attributed: Boolean(meta) });
  return { ok: true, status: status === 'already_host' ? 'already_host' : 'became', accountId: user.id, newAccount };
}
