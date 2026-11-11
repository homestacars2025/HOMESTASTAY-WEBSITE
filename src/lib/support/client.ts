'use client';

/**
 * The support center from the browser, with the guest's own session.
 *
 * SECURITY: reads go to support_tickets / support_messages, which RLS limits
 * to the caller's rows (internal notes never come back, and are filtered out
 * again in the model); every write goes through a support_* RPC, which
 * resolves the caller from auth.uid(). No service role anywhere near this.
 * Files live in the private bucket support-attachments and are only ever shown
 * through signed URLs.
 */

import { createClient } from '@/lib/supabase/client';
import { prepareImage } from '@/lib/media/compress';
import {
  MESSAGE_COLUMNS,
  SUPPORT_AUDIENCE,
  SUPPORT_BUCKET,
  SUPPORT_CHANNEL,
  TICKET_COLUMNS,
  attachmentPath,
  fileType,
  normalizeMessages,
  normalizeTicket,
  normalizeTickets,
  supportError,
  type SupportAttachment,
  type SupportError,
  type SupportMessage,
  type SupportTicket,
} from './model';

export type Result<T> = { ok: true; value: T } | { ok: false; error: SupportError };

function fail(scope: string, error: unknown): { ok: false; error: SupportError } {
  const code = supportError(error);
  // The code only — never the payload, which may carry the guest's message.
  console.error(`[support] ${scope} failed:`, code === 'generic' ? ((error as { code?: string } | null)?.code ?? 'unknown') : code);
  return { ok: false, error: code };
}

/** The guest's requests (guest audience: a host's own host-side requests live in the host portal). */
export async function fetchTickets(): Promise<SupportTicket[] | null> {
  const { data, error } = await createClient()
    .from('support_tickets')
    .select(TICKET_COLUMNS)
    .eq('audience', SUPPORT_AUDIENCE)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) {
    fail('list', error);
    return null;
  }
  return normalizeTickets(data);
}

export async function fetchTicket(ticketId: string): Promise<SupportTicket | null | 'missing'> {
  const { data, error } = await createClient().from('support_tickets').select(TICKET_COLUMNS).eq('id', ticketId).maybeSingle();
  if (error) {
    fail('ticket', error);
    return null;
  }
  return normalizeTicket(data) ?? 'missing';
}

export async function fetchMessages(ticketId: string): Promise<SupportMessage[] | null> {
  const { data, error } = await createClient()
    .from('support_messages')
    .select(MESSAGE_COLUMNS)
    .eq('ticket_id', ticketId)
    .eq('is_internal', false)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) {
    fail('messages', error);
    return null;
  }
  return normalizeMessages(data);
}

/** Sum of requester_unread over the guest's requests — the header badge. */
export async function fetchUnreadTotal(): Promise<number | null> {
  const { data, error } = await createClient()
    .from('support_tickets')
    .select('requester_unread')
    .eq('audience', SUPPORT_AUDIENCE)
    .gt('requester_unread', 0)
    .limit(100);
  if (error) return null;
  return (data ?? []).reduce((s, r) => s + Math.max(0, Number((r as { requester_unread: unknown }).requester_unread) || 0), 0);
}

export type OpenTicketInput = { category: string; body: string; bookingId: string | null; language: string };
export type OpenedTicket = { id: string; reference: string | null; firstResponseDueAt: string | null };

/**
 * support_open_ticket — TEXT ONLY. Files need the ticket id for their storage
 * path, so they follow as the next message (sendWithFiles).
 */
export async function openTicket(input: OpenTicketInput): Promise<Result<OpenedTicket>> {
  const { data, error } = await createClient().rpc('support_open_ticket', {
    p_category: input.category,
    p_body: input.body,
    p_booking_id: input.bookingId,
    p_channel: SUPPORT_CHANNEL,
    p_language: input.language,
    p_attachments: [],
  });
  if (error) return fail('open', error);
  const d = (typeof data === 'string' ? { id: data } : (data ?? {})) as Record<string, unknown>;
  const id = typeof d.id === 'string' ? d.id : null;
  if (!id) return fail('open', { message: 'no id returned' });
  return {
    ok: true,
    value: {
      id,
      reference: typeof d.reference === 'string' ? d.reference : null,
      firstResponseDueAt: typeof d.first_response_due_at === 'string' ? d.first_response_due_at : null,
    },
  };
}

/**
 * Uploads files to <ticket_id>/<uuid>.<ext>, photos shrunk first. All or
 * nothing: if one fails, the ones already up are removed and nothing is sent,
 * so a message never arrives with half its photos.
 */
export async function uploadAttachments(ticketId: string, files: File[]): Promise<Result<SupportAttachment[]>> {
  const storage = createClient().storage.from(SUPPORT_BUCKET);
  const done: SupportAttachment[] = [];
  for (const original of files) {
    const { file, width, height } = await prepareImage(original);
    const type = fileType(file);
    const path = attachmentPath(ticketId, crypto.randomUUID(), { name: file.name, type });
    const { error } = await storage.upload(path, file, { contentType: type, upsert: false, cacheControl: '3600' });
    if (error) {
      if (done.length) void storage.remove(done.map((a) => a.path));
      fail('upload', error);
      return { ok: false, error: 'upload_failed' };
    }
    done.push({ path, name: original.name, mime: type, size: file.size, ...(width && height ? { width, height } : {}) });
  }
  return { ok: true, value: done };
}

export async function sendSupportMessage(ticketId: string, body: string, attachments: SupportAttachment[]): Promise<Result<null>> {
  const { error } = await createClient().rpc('support_send_message', {
    p_ticket: ticketId,
    p_body: body,
    p_attachments: attachments,
  });
  if (error) return fail('send', error);
  return { ok: true, value: null };
}

/** Upload (if any), then send — the one path for every message after the first. Photo-only is fine. */
export async function sendWithFiles(ticketId: string, body: string, files: File[]): Promise<Result<null>> {
  let attachments: SupportAttachment[] = [];
  if (files.length) {
    const up = await uploadAttachments(ticketId, files);
    if (!up.ok) return up;
    attachments = up.value;
  }
  return sendSupportMessage(ticketId, body, attachments);
}

export async function markSupportRead(ticketId: string): Promise<void> {
  const { error } = await createClient().rpc('support_mark_read', { p_ticket: ticketId });
  if (error) fail('mark read', error);
}

/** "My problem is solved". */
export async function markSolved(ticketId: string): Promise<Result<null>> {
  const { error } = await createClient().rpc('support_set_status', { p_ticket: ticketId, p_status: 'resolved' });
  if (error) return fail('resolve', error);
  return { ok: true, value: null };
}

export async function rateTicket(ticketId: string, rating: 1 | -1, comment: string | null): Promise<Result<null>> {
  const { error } = await createClient().rpc('support_rate', { p_ticket: ticketId, p_rating: rating, p_comment: comment });
  if (error) return fail('rate', error);
  return { ok: true, value: null };
}

/** Signed URLs (1 h) for showing files from the private bucket. */
export async function signAttachments(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await createClient().storage.from(SUPPORT_BUCKET).createSignedUrls(paths, 3600);
  if (error) {
    fail('sign', error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}
