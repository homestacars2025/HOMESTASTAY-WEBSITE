import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/home/Header';
import { JsonLd } from '@/components/seo/JsonLd';
import { TransferBooking } from '@/components/transfers/TransferBooking';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';
import { ORG_ID, breadcrumbSchema, faqSchema, graph } from '@/lib/seo/schema';
import { createClient } from '@/lib/supabase/server';
import { getTransferOptions } from '@/lib/transfers/server';
import { UUID_RE, formatMoney } from '@/lib/transfers/model';

/**
 * /[locale]/transfers — airport transfers (IST, SAW ↔ Istanbul districts).
 *
 * Server-rendered for discovery (Law 3): the intro, the facts and the FAQ are
 * plain HTML in four languages, with Service + FAQPage + BreadcrumbList
 * JSON-LD; the booking steps are the one client island. Every figure in the
 * copy (lowest price, lead time, limits, free cancellation) is read from
 * transfer_options, never written into the text.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'transfers.page' });
  const url = canonical(locale, '/transfers');
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: { canonical: url, languages: hreflangAlternates('/transfers', 'en') },
    openGraph: {
      title, description, url, type: 'website', siteName: SITE_NAME,
      locale: ogLocale(locale), alternateLocale: ogAlternateLocales(locale), images: defaultOgImages(),
    },
    twitter: { card: 'summary_large_image', title, description, images: defaultOgImages().map((i) => i.url) },
  };
}

export default async function TransfersPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ stay?: string }>;
}) {
  const { locale } = await params;
  const { stay } = await searchParams;
  const [t, options] = await Promise.all([
    getTranslations({ locale, namespace: 'transfers.page' }),
    getTransferOptions().catch(() => null),
  ]);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let prefill = { name: '', phone: '' };
  if (user) {
    const { data: p } = await supabase.from('profiles').select('first_name, last_name, phone').eq('id', user.id).maybeSingle();
    prefill = {
      name: [p?.first_name, p?.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' '),
      phone: typeof p?.phone === 'string' ? p.phone : '',
    };
  }
  const signedIn = Boolean(user?.email && user.email_confirmed_at);

  const prices = options ? options.districts.flatMap((d) => Object.values(d.priceFrom)) : [];
  const lowest = prices.length ? Math.min(...prices) : null;
  const facts = options && {
    price: lowest !== null ? formatMoney(lowest, 'USD', locale) : '',
    hours: options.freeCancelHours,
    lead: options.minLeadHours,
    passengers: options.maxPassengers,
    luggage: options.maxLuggage,
    seats: options.maxChildSeats,
  };

  const faq = facts
    ? (['price', 'cancel', 'lead', 'capacity', 'flight'] as const).map((k) => ({ q: t(`faq.${k}.q`), a: t(`faq.${k}.a`, facts) }))
    : [];

  const url = canonical(locale, '/transfers');

  return (
    <div className="min-h-screen bg-paper">
      <Header />
      <main className="mx-auto max-w-xl px-4 pt-24 pb-20">
        <section className="mb-8">
          <span className="mb-5 inline-flex items-center rounded-[999px] border border-stay/30 bg-stay/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.09em] text-stay rtl:font-sans rtl:tracking-normal">
            {t('eyebrow')}
          </span>
          <h1 className="mb-4 text-[clamp(1.9rem,6vw,2.6rem)] font-medium leading-[1.0] tracking-[-0.04em] text-ink">{t('h1')}</h1>
          {facts && <p className="text-base leading-relaxed text-ink-soft">{t('intro', facts)}</p>}
        </section>

        {options ? (
          <TransferBooking options={options} signedIn={signedIn} prefill={prefill} stayBookingId={stay && UUID_RE.test(stay) ? stay : undefined} />
        ) : (
          <p role="alert" className="rounded-[14px] border border-rule bg-white p-5 text-ink-soft">{t('unavailable')}</p>
        )}

        {faq.length > 0 && (
          <section className="mt-16 border-t border-rule pt-10" aria-labelledby="transfer-faq">
            <h2 id="transfer-faq" className="mb-6 text-xl font-medium tracking-[-0.025em] text-ink">{t('faqTitle')}</h2>
            <dl className="flex flex-col gap-6">
              {faq.map((f) => (
                <div key={f.q}>
                  <dt className="mb-1.5 font-medium text-ink">{f.q}</dt>
                  <dd className="leading-relaxed text-ink-soft">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </main>

      <JsonLd
        data={graph(
          {
            '@type': 'TaxiService',
            name: t('h1'),
            description: t('metaDescription'),
            url,
            provider: { '@id': ORG_ID },
            areaServed: { '@type': 'City', name: 'Istanbul' },
            ...(lowest !== null
              ? { offers: { '@type': 'Offer', priceCurrency: 'USD', price: lowest, priceSpecification: { '@type': 'PriceSpecification', minPrice: lowest, priceCurrency: 'USD' } } }
              : {}),
          },
          faqSchema(faq),
          breadcrumbSchema([
            { name: SITE_NAME, url: canonical(locale, '/') },
            { name: t('eyebrow'), url },
          ]),
        )}
      />
    </div>
  );
}
