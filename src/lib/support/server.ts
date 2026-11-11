import 'server-only';

/**
 * Support reads for the FIRST PAINT of the support pages, with the guest's own
 * cookie session (RLS applies — never the admin client). The client takes over
 * from here for realtime updates.
 */

import { createClient } from '@/lib/supabase/server';
import {
  CATEGORY_COLUMNS,
  MESSAGE_COLUMNS,
  SUPPORT_AUDIENCE,
  TICKET_COLUMNS,
  normalizeCategories,
  normalizeMessages,
  normalizeTicket,
  normalizeTickets,
  type SupportCategory,
  type SupportMessage,
  type SupportTicket,
} from './model';

export async function loadGuestCategories(): Promise<SupportCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('support_categories')
    .select(CATEGORY_COLUMNS)
    .eq('audience', SUPPORT_AUDIENCE)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) console.error('[support] categories failed:', error.code);
  return normalizeCategories(data);
}

export async function loadTickets(): Promise<SupportTicket[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('audience', SUPPORT_AUDIENCE)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) {
    console.error('[support] tickets failed:', error.code);
    return null;
  }
  return normalizeTickets(data);
}

/** null = not found (or not this guest's — RLS makes the two indistinguishable, on purpose). */
export async function loadTicketWithMessages(
  ticketId: string,
): Promise<{ ticket: SupportTicket; messages: SupportMessage[] } | null> {
  const supabase = await createClient();
  const [t, m] = await Promise.all([
    supabase.from('support_tickets').select(TICKET_COLUMNS).eq('id', ticketId).maybeSingle(),
    supabase
      .from('support_messages')
      .select(MESSAGE_COLUMNS)
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true })
      .limit(500),
  ]);
  const ticket = normalizeTicket(t.data);
  if (!ticket) return null;
  return { ticket, messages: normalizeMessages(m.data) };
}

/** One of the guest's bookings, for the "Which booking?" picker. */
export type BookingOption = {
  id: string;
  reference: string | null;
  unitName: string | null;
  checkIn: string | null;
  checkOut: string | null;
};

/** The guest's bookings via get_my_bookings (resolves the caller from auth.uid()). Newest stay first. */
export async function loadMyBookings(): Promise<BookingOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_my_bookings', {});
  if (error) {
    console.error('[support] bookings failed:', error.code);
    return [];
  }
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return rows
    .filter((r) => s(r.booking_id))
    .map((r) => ({
      id: String(r.booking_id),
      reference: s(r.booking_reference),
      unitName: s(r.property_name) && s(r.unit_name) && r.property_name !== r.unit_name
        ? `${r.property_name} · ${r.unit_name}`
        : s(r.unit_name) ?? s(r.property_name),
      checkIn: s(r.check_in),
      checkOut: s(r.check_out),
    }))
    .sort((a, b) => (b.checkIn ?? '').localeCompare(a.checkIn ?? ''))
    .slice(0, 50);
}
