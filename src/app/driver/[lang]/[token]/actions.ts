'use server';

import { redirect } from 'next/navigation';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * A driver's status tap — transfer_driver_update(p_token, p_status), anon.
 * The token in the link IS the credential (the database checks it and the
 * allowed transition). A plain form POST, so it works without JavaScript on
 * a slow connection; the page reloads with the outcome.
 */

const STATUSES = new Set(['en_route', 'arrived', 'picked_up', 'completed', 'no_show']);
const LANGS = new Set(['tr', 'en', 'ar', 'ru']);

export async function updateDriverStatus(form: FormData): Promise<void> {
  const token = String(form.get('token') ?? '');
  const status = String(form.get('status') ?? '');
  const lang = LANGS.has(String(form.get('lang'))) ? String(form.get('lang')) : 'tr';
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token) || !STATUSES.has(status)) redirect(`/d/${encodeURIComponent(token)}?lang=${lang}&e=invalid`);

  const { data, error } = await createPublicClient().rpc('transfer_driver_update', { p_token: token, p_status: status });
  const d = ((Array.isArray(data) ? data[0] : data) ?? {}) as { status?: string };
  let outcome = 'ok';
  if (error) {
    console.error('[driver] transfer_driver_update failed', { code: error.code, message: error.message });
    outcome = 'error';
  } else if (d.status === 'invalid_transition') outcome = 'transition';
  else if (d.status === 'invalid_link') outcome = 'link';
  else if (d.status !== 'ok') outcome = 'error';

  // /d/… is the public address; middleware maps it back to /driver/[lang]/….
  redirect(`/d/${encodeURIComponent(token)}?lang=${lang}${outcome === 'ok' ? '' : `&e=${outcome}`}`);
}
