import 'server-only';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPublicClient } from '@/lib/supabase/public';
import {
  parseOptions, parseTransfer, parseTransferList, num, str,
  type Airport, type Direction, type TransferOptions, type TransferView,
} from '@/lib/transfers/model';

/**
 * The transfer RPCs, server-side. Who may call what is the database's rule:
 *   anon      transfer_options, transfer_quote, transfer_driver_view/update
 *   the user  transfer_create, transfer_get, my_transfers, transfer_cancel
 *             (pass the COOKIE client — auth.uid() is the owner check)
 *   service   transfer_payment_init, transfer_complete_payment (payment routes)
 */

const one = (data: unknown): Record<string, unknown> =>
  ((Array.isArray(data) ? data[0] : data) ?? {}) as Record<string, unknown>;

/** Airports, districts with "from" prices, limits. Public, cached briefly. */
export const getTransferOptions = unstable_cache(
  async (): Promise<TransferOptions | null> => {
    const { data, error } = await createPublicClient().rpc('transfer_options');
    if (error) {
      console.error('[transfers] transfer_options failed', { code: error.code, message: error.message });
      throw new Error('transfer_options');
    }
    return parseOptions(data);
  },
  ['transfer-options-v1'],
  { revalidate: 300, tags: ['transfers'] },
);

export type QuoteResult =
  | { status: 'ok'; priceUsd: number; priceTry: number | null }
  | { status: 'not_served' };

export async function quoteTransfer(airport: Airport, direction: Direction, districtId: string): Promise<QuoteResult> {
  const { data, error } = await createPublicClient().rpc('transfer_quote', {
    p_airport: airport, p_direction: direction, p_district_id: districtId,
  });
  if (error) {
    console.error('[transfers] transfer_quote failed', { code: error.code, message: error.message });
    return { status: 'not_served' };
  }
  const d = one(data);
  const usd = num(d.price_usd);
  return d.status === 'ok' && usd !== null ? { status: 'ok', priceUsd: usd, priceTry: num(d.price_try) } : { status: 'not_served' };
}

export interface CreateInput {
  direction: Direction;
  airport: Airport;
  district_id: string;
  address?: string;
  pickup_at: string;
  flight_number?: string;
  passengers: number;
  luggage: number;
  child_seats: number;
  notes?: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  lang: string;
  stay_booking_id?: string;
}

export type CreateResult =
  | { status: 'ok'; transferId: string; reference: string | null }
  | { status: 'auth_required' | 'not_served' | 'rate_limited' | 'error' }
  | { status: 'too_soon'; minLeadHours: number | null }
  | { status: 'invalid'; field: string | null };

export async function createTransfer(asUser: SupabaseClient, p: CreateInput): Promise<CreateResult> {
  const { data, error } = await asUser.rpc('transfer_create', { p });
  if (error) {
    if (error.code === '42501') return { status: 'auth_required' };
    console.error('[transfers] transfer_create failed', { code: error.code, message: error.message });
    return { status: 'error' };
  }
  const d = one(data);
  switch (d.status) {
    case 'ok': {
      const id = str(d.transfer_id);
      return id ? { status: 'ok', transferId: id, reference: str(d.reference) } : { status: 'error' };
    }
    case 'too_soon': return { status: 'too_soon', minLeadHours: num(d.min_lead_hours) };
    case 'invalid': return { status: 'invalid', field: str(d.field) };
    case 'auth_required':
    case 'not_served':
    case 'rate_limited':
      return { status: d.status };
    default:
      console.error('[transfers] transfer_create unexpected answer', { status: d.status });
      return { status: 'error' };
  }
}

/** One transfer, as its owner sees it — null when not found / not theirs. */
export async function getTransfer(client: SupabaseClient, transferId: string): Promise<TransferView | null> {
  const { data, error } = await client.rpc('transfer_get', { p_transfer_id: transferId });
  if (error) {
    if (error.code !== '42501') console.error('[transfers] transfer_get failed', { code: error.code, message: error.message });
    return null;
  }
  const d = one(data);
  if (typeof d.status === 'string' && d.status !== 'ok' && !d.id && !d.transfer) return null;
  return parseTransfer(data);
}

export async function listMyTransfers(asUser: SupabaseClient): Promise<TransferView[] | null> {
  const { data, error } = await asUser.rpc('my_transfers');
  if (error) {
    console.error('[transfers] my_transfers failed', { code: error.code, message: error.message });
    return null;
  }
  return parseTransferList(data);
}

export type CancelResult =
  | { status: 'ok'; refund: boolean }
  | { status: 'too_late'; freeCancelHours: number | null }
  | { status: 'not_cancellable' | 'error' };

export async function cancelTransfer(asUser: SupabaseClient, transferId: string, reason: string | null): Promise<CancelResult> {
  const { data, error } = await asUser.rpc('transfer_cancel', { p_transfer_id: transferId, p_reason: reason });
  if (error) {
    console.error('[transfers] transfer_cancel failed', { code: error.code, message: error.message });
    return { status: 'error' };
  }
  const d = one(data);
  if (d.status === 'ok') return { status: 'ok', refund: d.refund === true };
  if (d.status === 'too_late') return { status: 'too_late', freeCancelHours: num(d.free_cancel_hours) };
  if (d.status === 'not_cancellable') return { status: 'not_cancellable' };
  return { status: 'error' };
}

export type PaymentInit =
  | { status: 'ok'; merchantOrderId: string; amountTry: number; amountUsd: number | null; reference: string | null }
  | { status: 'not_payable'; transferStatus: string | null }
  | { status: 'expired' | 'not_found' | 'forbidden' | 'error' };

/**
 * A new payment attempt (service role, AFTER the caller's ownership has been
 * checked). The amount is the database's — this is the only source of the
 * TRY figure sent to the bank.
 */
export async function initTransferPayment(admin: SupabaseClient, transferId: string): Promise<PaymentInit> {
  const { data, error } = await admin.rpc('transfer_payment_init', { p_transfer_id: transferId, p_gateway: 'kuveyt' });
  if (error) {
    console.error('[transfers] transfer_payment_init failed', { code: error.code, message: error.message });
    return { status: 'error' };
  }
  const d = one(data);
  switch (d.status) {
    case 'ok': {
      const moid = str(d.merchant_order_id);
      const amountTry = num(d.amount_try);
      if (!moid || amountTry === null || amountTry <= 0) {
        console.error('[transfers] transfer_payment_init ok without order id / amount', { transferId });
        return { status: 'error' };
      }
      return { status: 'ok', merchantOrderId: moid, amountTry, amountUsd: num(d.amount_usd), reference: str(d.reference) };
    }
    case 'not_payable': return { status: 'not_payable', transferStatus: str(d.transfer_status) };
    case 'expired':
    case 'not_found':
    case 'forbidden':
      return { status: d.status };
    default:
      console.error('[transfers] transfer_payment_init unexpected answer', { status: d.status });
      return { status: 'error' };
  }
}
