import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { TicketChat } from '@/components/support/TicketChat';
import { requireConfirmedUser } from '@/lib/auth/require-user';
import { createClient } from '@/lib/supabase/server';
import { categoryLabel, isUuid } from '@/lib/support/model';
import { loadGuestCategories, loadTicketWithMessages } from '@/lib/support/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'support' });
  return {
    title: `${t('title')} — Homesta Stay`,
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

type Props = {
  params: Promise<{ locale: string; ticketId: string }>;
  searchParams: Promise<{ sent?: string; files?: string }>;
};

/**
 * One request, as a chat. The page is the full viewport under the header —
 * the conversation scrolls inside it and the composer stays at the bottom,
 * like any messaging app.
 */
export default async function SupportTicketPage({ params, searchParams }: Props) {
  const { locale, ticketId } = await params;
  const { sent, files } = await searchParams;
  await requireConfirmedUser(locale, `/account/support/${encodeURIComponent(ticketId)}`);
  if (!isUuid(ticketId)) notFound();

  const [t, categories, loaded] = await Promise.all([
    getTranslations({ locale, namespace: 'support' }),
    loadGuestCategories(),
    loadTicketWithMessages(ticketId),
  ]);
  // Missing and not-yours are the same answer (RLS), on purpose.
  if (!loaded) notFound();
  const { ticket, messages } = loaded;

  // The booking's reference, for the "Booking HP-…" line — read through
  // get_my_bookings, so it resolves only for the guest's own booking.
  let bookingReference: string | null = null;
  if (ticket.bookingId) {
    const supabase = await createClient();
    const { data } = await supabase.rpc('get_my_bookings', { p_booking_id: ticket.bookingId });
    const row = Array.isArray(data) ? (data[0] as { booking_reference?: unknown } | undefined) : undefined;
    bookingReference = typeof row?.booking_reference === 'string' ? row.booking_reference : null;
  }

  return (
    <div className="bg-paper">
      <Header />
      <main className="mx-auto flex h-[calc(100dvh-4rem)] max-w-[760px] flex-col sm:border-x sm:border-rule">
        <TicketChat
          initialTicket={ticket}
          initialMessages={messages}
          categoryName={categoryLabel(categories, ticket.categoryKey, locale) ?? t('untitled')}
          bookingReference={bookingReference}
          justSent={sent === '1'}
          filesFailed={files === 'failed'}
        />
      </main>
    </div>
  );
}
