'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { cancelTransfer, type CancelResult } from '@/lib/transfers/server';
import { UUID_RE } from '@/lib/transfers/model';

/** Cancel one of MY transfers — transfer_cancel as the user (the database checks ownership and the 24 h rule). */
export async function cancelTransferAction(transferId: string, reason: string): Promise<CancelResult> {
  if (!UUID_RE.test(transferId)) return { status: 'error' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error' };
  const result = await cancelTransfer(supabase, transferId, reason.trim().slice(0, 500) || null);
  if (result.status === 'ok') revalidatePath('/[locale]/account/transfers', 'layout');
  return result;
}
