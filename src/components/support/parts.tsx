import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ticketState, type SupportTicket, type TicketState } from '@/lib/support/model';

/** Pill CTAs, in the site's two weights: red for the one primary action, outline for the rest. */
export const PRIMARY_PILL =
  'inline-flex items-center justify-center gap-2 min-h-[44px] rounded-[999px] bg-stay text-white px-6 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
export const OUTLINE_PILL =
  'inline-flex items-center justify-center gap-2 min-h-[44px] rounded-[999px] border border-rule bg-white text-ink px-5 text-sm font-medium transition-colors duration-[240ms] hover:bg-paper-warm disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

const CHIP: Record<TicketState, string> = {
  waiting: 'border-rule text-ink-soft bg-white',
  in_progress: 'border-transparent bg-paper-warm text-ink',
  // The one state that asks something of the guest: black, the site's second
  // colour — red stays reserved for CTAs and the unread count.
  replied: 'border-transparent bg-ink text-white',
  solved: 'border-rule text-mute bg-white',
  closed: 'border-rule text-mute bg-white',
};

/** Waiting for support / In progress / Support replied / Solved / Closed. Server- and client-safe. */
export function StatusChip({ ticket, className }: { ticket: Pick<SupportTicket, 'status' | 'closedAt'>; className?: string }) {
  const t = useTranslations('support.state');
  const st = ticketState(ticket);
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5', CHIP[st], className)}>
      {st === 'solved' && <Check className="w-3 h-3" strokeWidth={2.5} aria-hidden="true" />}
      {t(st)}
    </span>
  );
}

/** List time: today → 14:05, this week → Tue, older → 3 Nov. */
export function listTime(iso: string | null, locale: string, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(d);
}

/** The Homesta support mark in the chat: the brand's black disc with a lowercase h. */
export function SupportAvatar({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-ink text-white font-medium select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45), letterSpacing: '-0.04em' }}
    >
      h
    </span>
  );
}
