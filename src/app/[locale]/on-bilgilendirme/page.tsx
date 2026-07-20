import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocumentPage } from '@/components/legal/LegalDocumentPage';
import { getLegalDoc } from '@/content/legal';
import { DOCUMENT_VERSION } from '@/lib/booking/documents';
import { createAdminClient } from '@/lib/supabase/admin';
import { readBookingCookie } from '@/lib/booking/cookie';
import { canonical, hreflangAlternates } from '@/lib/config/urls';

/**
 * Ön Bilgilendirme Formu — the pre-information form.
 *
 * The route keeps its Turkish name in every locale: it is a named Turkish
 * legal instrument, and a guest, a lawyer or a regulator looking for it will
 * look for this name.
 *
 * Indexable — unlike the checkout pages, this is public consumer information
 * and there is a legitimate reason for it to be findable.
 */

export const dynamic = 'force-dynamic';


export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { content } = getLegalDoc('on-bilgilendirme', locale);
  const canonicalUrl = canonical(locale, '/on-bilgilendirme');

  return {
    title: `${content.heading} — Homesta Stay`,
    description: content.intro.slice(0, 155),
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates('/on-bilgilendirme', 'tr'),
    },
  };
}

export default async function OnBilgilendirmePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booking.legal' });
  const { content, isFallback, shownLocale } = getLegalDoc('on-bilgilendirme', locale);

  // The booking summary is legally an annex to this form, so it renders
  // inside the document rather than beside it. Authorised by the same signed
  // cookie as the result page — a reference alone is never enough.
  const bookingId = await readBookingCookie();
  let annex: React.ReactNode = null;

  if (bookingId) {
    const supabase = createAdminClient();
    const { data: booking } = await supabase
      .from('bookings')
      .select('booking_reference, check_in, check_out, guests_count, total_amount_usd')
      .eq('id', bookingId)
      .maybeSingle();

    if (booking) {
      const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
        day: 'numeric', month: 'short', year: 'numeric',
      });
      const usd = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : locale, {
        style: 'currency', currency: 'USD', maximumFractionDigits: 2,
      });
      const total = Number(booking.total_amount_usd);

      annex = (
        <dl className="border border-rule rounded-[14px] p-5 flex flex-col gap-3 text-[13px]">
          <AnnexRow label={t('annex.reference')} value={booking.booking_reference} />
          <AnnexRow label={t('annex.checkIn')}  value={dateFmt.format(new Date(`${booking.check_in}T00:00:00`))} />
          <AnnexRow label={t('annex.checkOut')} value={dateFmt.format(new Date(`${booking.check_out}T00:00:00`))} />
          <AnnexRow label={t('annex.guests')}   value={String(booking.guests_count)} />
          {Number.isFinite(total) && (
            <AnnexRow label={t('annex.total')} value={usd.format(total)} />
          )}
        </dl>
      );
    }
  }

  if (!annex) {
    annex = (
      <p className="text-[13px] text-mute leading-relaxed">{content.annexEmpty}</p>
    );
  }

  return (
    <LegalDocumentPage
      content={content}
      version={DOCUMENT_VERSION}
      versionLabel={t('versionLabel')}
      fallbackNotice={isFallback ? t('fallbackNotice', { shown: shownLocale }) : undefined}
      annex={annex}
    />
  );
}

function AnnexRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-mute">{label}</dt>
      <dd className="text-ink text-end">{value}</dd>
    </div>
  );
}
