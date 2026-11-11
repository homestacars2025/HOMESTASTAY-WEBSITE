/**
 * Support center (guest ↔ Homesta support) — types and pure helpers.
 *
 * Pure on purpose: no Supabase, no React, no `@/` imports, so the same rules
 * run on the server (first paint) and in the browser (realtime refetches) and
 * can never disagree about what a status means.
 *
 * CONTRACT (live STAY DB, 2026-11-11) — the same one the app and the host
 * portal (HS-HOST) use:
 *   tables  support_tickets / support_messages / support_categories
 *           RLS: the requester's own rows; internal staff notes are never
 *           returned (and are filtered out again here, belt and braces).
 *   RPCs    support_open_ticket, support_send_message, support_mark_read,
 *           support_set_status, support_rate — they resolve the caller from
 *           auth.uid(), so nothing here ever names a profile id.
 *   bucket  support-attachments (private, 15 MB, the types in ACCEPTED_TYPES),
 *           path <ticket_id>/<uuid>.<ext>, read through signed URLs.
 */

export const SUPPORT_CHANNEL = 'web';
export const SUPPORT_BUCKET = 'support-attachments';
export const SUPPORT_AUDIENCE = 'guest';

/** The site's locales — the category labels exist in exactly these. */
type Lang = 'en' | 'ar' | 'tr' | 'ru';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);
const int = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : 0;
};

// ── Categories ───────────────────────────────────────────────────────────────

export type SupportCategory = { key: string; labels: Record<Lang, string | null> };

/** Columns read from support_categories (audience 'guest', active, by sort_order). */
export const CATEGORY_COLUMNS = 'key, label_en, label_ar, label_tr, label_ru, sort_order';

export function normalizeCategories(raw: unknown): SupportCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => (r ?? {}) as Record<string, unknown>)
    .filter((r) => str(r.key))
    .map((r) => ({
      key: String(r.key),
      labels: { en: str(r.label_en), ar: str(r.label_ar), tr: str(r.label_tr), ru: str(r.label_ru) },
    }));
}

/** The category in the reader's language → English → null (the caller says "Support request"). */
export function categoryLabel(categories: SupportCategory[], key: string | null, locale: string): string | null {
  if (!key) return null;
  const c = categories.find((x) => x.key === key);
  if (!c) return null;
  return c.labels[locale as Lang] ?? c.labels.en ?? null;
}

/** Categories that are usually about one stay — the booking picker opens on these. */
const BOOKING_CATEGORIES = new Set([
  'guest_booking_question',
  'guest_change_dates',
  'guest_cancel_refund',
  'guest_payment',
  'guest_check_in',
  'guest_during_stay',
  'guest_after_stay',
]);
export const isBookingCategory = (key: string | null) => !!key && BOOKING_CATEGORIES.has(key);

// ── Tickets ──────────────────────────────────────────────────────────────────

/**
 * The columns the website reads. Never the staff-side fields (assignee,
 * priority, AI summary, staff_unread, SLA flags): the guest has no use for
 * them, and a column not selected is a column that cannot leak.
 */
export const TICKET_COLUMNS =
  'id, reference, category_key, subject, status, booking_id, first_response_due_at, first_responded_at, resolved_at, closed_at, csat_rating, csat_comment, last_message_at, last_message_preview, requester_unread, created_at';

export type SupportTicket = {
  id: string;
  reference: string | null;
  categoryKey: string | null;
  status: string;
  bookingId: string | null;
  firstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  rating: 1 | -1 | null;
  ratingComment: string | null;
  lastMessageAt: string | null;
  preview: string | null;
  unread: number;
  createdAt: string | null;
};

export function normalizeTicket(raw: unknown): SupportTicket | null {
  const r = (raw ?? null) as Record<string, unknown> | null;
  if (!r || !str(r.id)) return null;
  const rating = int(r.csat_rating);
  return {
    id: String(r.id),
    reference: str(r.reference),
    categoryKey: str(r.category_key),
    status: str(r.status) ?? 'open',
    bookingId: str(r.booking_id),
    firstResponseDueAt: str(r.first_response_due_at),
    firstRespondedAt: str(r.first_responded_at),
    resolvedAt: str(r.resolved_at),
    closedAt: str(r.closed_at),
    rating: rating > 0 ? 1 : rating < 0 ? -1 : null,
    ratingComment: str(r.csat_comment),
    lastMessageAt: str(r.last_message_at),
    preview: str(r.last_message_preview),
    unread: Math.max(0, int(r.requester_unread)),
    createdAt: str(r.created_at),
  };
}

export function normalizeTickets(raw: unknown): SupportTicket[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeTicket)
    .filter((t): t is SupportTicket => t != null)
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt ?? '').localeCompare(a.lastMessageAt ?? a.createdAt ?? ''));
}

/**
 * The ticket's state as the GUEST reads it (the five labels of the brief):
 *
 *   waiting      open / ai / waiting_agent → "Waiting for support"
 *   in_progress  in_progress               → "In progress"
 *   replied      waiting_requester         → "Support replied"
 *   solved       resolved                  → "Solved" (can still reply for 3 days)
 *   closed       closed                    → "Closed" (read-only)
 *
 * An unknown status (one added on the staff side later) reads as "waiting":
 * the honest default for "something is open and it is with support".
 */
export type TicketState = 'waiting' | 'in_progress' | 'replied' | 'solved' | 'closed';

export function ticketState(t: Pick<SupportTicket, 'status' | 'closedAt'>): TicketState {
  switch (t.status) {
    case 'closed':
      return 'closed';
    case 'resolved':
      return 'solved';
    case 'waiting_requester':
      return 'replied';
    case 'in_progress':
      return 'in_progress';
    default:
      return t.closedAt ? 'closed' : 'waiting';
  }
}

/** How long a solved request still takes replies (replying reopens it). */
export const REOPEN_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Whether the guest may still write. Closed: never. Solved: for three days
 * after it was solved. The database is the authority either way — a refusal
 * comes back as `ticket_closed` and the view reloads the ticket.
 */
export function canWrite(t: Pick<SupportTicket, 'status' | 'closedAt' | 'resolvedAt'>, now = Date.now()): boolean {
  const st = ticketState(t);
  if (st === 'closed') return false;
  if (st === 'solved' && t.resolvedAt) {
    const at = Date.parse(t.resolvedAt);
    if (Number.isFinite(at) && now - at > REOPEN_WINDOW_MS) return false;
  }
  return true;
}

/** "My problem is solved" — offered while the request is still open. */
export const canSolve = (t: Pick<SupportTicket, 'status' | 'closedAt'>) => {
  const st = ticketState(t);
  return st !== 'solved' && st !== 'closed';
};

/** The 👍/👎 card: once solved (or closed), until the guest has rated. */
export const canRate = (t: Pick<SupportTicket, 'status' | 'closedAt' | 'rating'>) => {
  const st = ticketState(t);
  return t.rating == null && (st === 'solved' || st === 'closed');
};

/**
 * "We'll reply within ~X": from first_response_due_at, the SLA the database
 * set from the category's priority — the site never invents a number. Only
 * while it is still true: nobody has answered yet and the request is open. A
 * target already passed reads "as soon as we can", never "~0 min".
 */
export type ReplyEta = { unit: 'minute' | 'hour' | 'day'; value: number } | { unit: 'soon' };

export function replyEta(
  t: Pick<SupportTicket, 'status' | 'closedAt' | 'firstResponseDueAt' | 'firstRespondedAt'>,
  now = Date.now(),
): ReplyEta | null {
  if (t.firstRespondedAt || !t.firstResponseDueAt) return null;
  const st = ticketState(t);
  if (st === 'solved' || st === 'closed') return null;
  const due = Date.parse(t.firstResponseDueAt);
  if (!Number.isFinite(due)) return null;
  const min = Math.ceil((due - now) / 60_000);
  if (min <= 0) return { unit: 'soon' };
  if (min < 90) return { unit: 'minute', value: min <= 5 ? min : Math.ceil(min / 5) * 5 };
  if (min < 36 * 60) return { unit: 'hour', value: Math.ceil(min / 60) };
  return { unit: 'day', value: Math.ceil(min / 1440) };
}

// ── Messages ─────────────────────────────────────────────────────────────────

export const MESSAGE_COLUMNS = 'id, ticket_id, sender_kind, body, attachments, created_at';

export type SupportAttachment = {
  path: string;
  name: string;
  mime: string | null;
  size: number | null;
  width?: number;
  height?: number;
};

/** me = the guest; staff = "Homesta support" (people AND the AI); system = centred notes. */
export type MessageSide = 'me' | 'staff' | 'system';

export type SupportMessage = {
  id: string;
  side: MessageSide;
  body: string;
  attachments: SupportAttachment[];
  createdAt: string;
  /** Local only: an optimistic message in flight, or one that failed. */
  local?: 'sending' | 'failed';
  /** Local only: the files of an optimistic message, kept for Retry. */
  files?: File[];
};

export function messageSide(kind: string | null): MessageSide {
  switch (kind) {
    case 'requester':
      return 'me';
    case 'system':
      return 'system';
    default:
      // 'staff' and 'ai' — and anything new on that side — are Homesta support.
      return 'staff';
  }
}

/** Attachments as stored ({ path, name, mime, size, width?, height? }); other spellings tolerated. */
export function parseAttachments(raw: unknown): SupportAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: SupportAttachment[] = [];
  for (const a of raw) {
    if (typeof a === 'string') {
      if (a) out.push({ path: a, name: baseName(a), mime: null, size: null });
      continue;
    }
    const o = (a ?? {}) as Record<string, unknown>;
    const path = str(o.path) ?? str(o.storage_path);
    if (!path) continue;
    const size = int(o.size);
    const width = int(o.width);
    const height = int(o.height);
    out.push({
      path,
      name: str(o.name) ?? baseName(path),
      mime: str(o.mime) ?? str(o.mime_type) ?? str(o.content_type),
      size: size > 0 ? size : null,
      ...(width > 0 && height > 0 ? { width, height } : {}),
    });
  }
  return out;
}

const baseName = (path: string) => path.split('/').pop() || path;

export function normalizeMessages(raw: unknown): SupportMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((r) => str(r.id) && r.is_internal !== true)
    .map((r) => ({
      id: String(r.id),
      side: messageSide(str(r.sender_kind)),
      body: typeof r.body === 'string' ? r.body : '',
      attachments: parseAttachments(r.attachments),
      createdAt: str(r.created_at) ?? new Date(0).toISOString(),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

/**
 * How to show a file. HEIC counts as a FILE, not an image: only Safari can
 * draw it, and a broken thumbnail is worse than a labelled link.
 */
export function attachmentKind(a: Pick<SupportAttachment, 'mime' | 'name'>): AttachmentKind {
  const m = (a.mime ?? '').toLowerCase();
  if (m === 'image/heic' || /\.heic$/i.test(a.name)) return 'file';
  if (m.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(a.name)) return 'image';
  if (m.startsWith('video/') || /\.mp4$/i.test(a.name)) return 'video';
  if (m.startsWith('audio/') || /\.(mp3|m4a|webm)$/i.test(a.name)) return 'audio';
  return 'file';
}

// ── Files ────────────────────────────────────────────────────────────────────

/** What the bucket accepts (support-attachments: 15 MB, these types). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES = 5;
export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
] as const;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
};

/** The file's type as the bucket sees it (some browsers leave HEIC untyped). */
export function fileType(f: { name: string; type: string }): string {
  if (f.type) return f.type === 'image/jpg' ? 'image/jpeg' : f.type;
  if (/\.heic$/i.test(f.name)) return 'image/heic';
  return '';
}

export type FileProblem = 'type' | 'size';
export function fileProblem(f: { name: string; type: string; size: number }): FileProblem | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(fileType(f))) return 'type';
  if (f.size > MAX_FILE_BYTES) return 'size';
  return null;
}

/** Storage path <ticket_id>/<uuid>.<ext> — the extension from the TYPE, never from the user's file name. */
export function attachmentPath(ticketId: string, uuid: string, f: { name: string; type: string }): string {
  return `${ticketId}/${uuid}.${EXT_BY_TYPE[fileType(f)] ?? 'bin'}`;
}

/** "2.1 MB" / "412 KB". */
export function formatBytes(bytes: number, locale: string): string {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes >= 1_000_000) return `${nf.format(bytes / 1_048_576)} MB`;
  return `${nf.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

// ── Errors ───────────────────────────────────────────────────────────────────

/**
 * The reasons the RPCs raise, as the error MESSAGE (verified against the live
 * DB: booking_not_yours → 42501, message_required / invalid_category → 22023).
 * Matched with `includes`, so a wrapped raise still maps.
 */
export const SUPPORT_ERRORS = [
  'too_many_open_tickets',
  'ticket_closed',
  'booking_not_yours',
  'message_required',
  'not_signed_in',
  'invalid_category',
] as const;
export type SupportError = (typeof SUPPORT_ERRORS)[number] | 'upload_failed' | 'generic';

export function supportError(error: unknown): SupportError {
  if (!error || typeof error !== 'object') return 'generic';
  const e = error as Record<string, unknown>;
  const text = ['message', 'details', 'hint']
    .map((k) => (typeof e[k] === 'string' ? (e[k] as string) : ''))
    .join(' ')
    .toLowerCase();
  const hit = SUPPORT_ERRORS.find((c) => text.includes(c));
  if (hit) return hit;
  // A signed-out caller has no EXECUTE: "permission denied for function", 42501.
  if (e.code === '42501' && text.includes('permission denied')) return 'not_signed_in';
  if (text.includes('jwt')) return 'not_signed_in';
  return 'generic';
}

// ── Entry points ("Get help" links) ──────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export type SupportPrefill = { category: string | null; bookingId: string | null };

/** `?category=&booking=` → a safe prefill (unknown categories and malformed ids dropped). */
export function parsePrefill(
  q: Record<string, string | string[] | undefined>,
  categoryKeys: string[],
): SupportPrefill {
  const one = (k: string) => {
    const v = q[k];
    return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? null) : null;
  };
  const category = one('category');
  const booking = one('booking');
  return {
    category: category && categoryKeys.includes(category) ? category : null,
    bookingId: isUuid(booking) ? booking : null,
  };
}

/** The path (without locale) of a new request, prefilled. */
export function newRequestHref(p: { category?: string | null; booking?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (p.category) q.set('category', p.category);
  if (p.booking) q.set('booking', p.booking);
  const s = q.toString();
  return s ? `/account/support/new?${s}` : '/account/support/new';
}
