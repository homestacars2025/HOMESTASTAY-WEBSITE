import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BedDouble, ChevronLeft, LogIn, LogOut, Users } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { UnitGallery } from '@/components/unit/UnitGallery';
import { UnitWhereSection } from '@/components/unit/UnitWhereSection';
import { HOTEL_SERVICE_ICONS } from '@/components/unit/hotel-service-icons';
import { SmartImage } from '@/components/media/SmartImage';
import { JsonLd } from '@/components/seo/JsonLd';
import { Link } from '@/i18n/navigation';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { SITE_NAME, ogLocale, ogAlternateLocales, defaultOgImages } from '@/lib/config/seo';
import { graph, breadcrumbSchema, hotelSchema } from '@/lib/seo/schema';
import { getHotelPage, type HotelRoom } from '@/lib/queries/stays';
import { localizedCityName } from '@/lib/geo/city-name';
import { buildStaysQuery, parseStaysSearchParams } from '@/lib/stays/search-params';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const perNight = (r: HotelRoom) =>
  r.pricing.total_usd !== null && r.pricing.nights ? r.pricing.total_usd / r.pricing.nights : r.pricing.nightly_usd;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const [hotel, t] = await Promise.all([getHotelPage(slug, locale), getTranslations({ locale, namespace: 'pages.hotel' })]);
  if (!hotel) return {};
  const city = hotel.city ? await localizedCityName(hotel.city, locale) : '';
  const prices = hotel.rooms.map(perNight).filter((v): v is number => v !== null);
  const from = prices.length ? Math.round(Math.min(...prices)) : null;
  const title = t('metaTitle', { name: hotel.name, type: t(`type.${hotel.type}`), city });
  const description = (hotel.description?.replace(/\s+/g, ' ').slice(0, 155))
    || t('metaDescription', { name: hotel.name, city, rooms: hotel.rooms.length, price: from ?? '' });
  const url = canonical(locale, `/hotels/${slug}`);
  const image = hotel.media[0]?.public_url;
  return {
    title,
    description,
    alternates: { canonical: url, languages: hreflangAlternates(`/hotels/${slug}`, 'en') },
    openGraph: {
      title, description, url, type: 'website', siteName: SITE_NAME,
      locale: ogLocale(locale), alternateLocale: ogAlternateLocales(locale),
      images: image ? [{ url: image }] : defaultOgImages(),
    },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : defaultOgImages().map((i) => i.url) },
  };
}

/**
 * A hotel or resort (show_as_property: more than 2 live units) — one page for
 * the place and every room in it. Rooms are priced and checked for the dates
 * in the URL (the search's, or the small form below); "View & book" opens the
 * room's own page with them kept.
 */
export default async function HotelPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const raw = await searchParams;
  const search = parseStaysSearchParams(raw);
  const [hotel, t, tCard, tUnit, tDest] = await Promise.all([
    getHotelPage(slug, locale, { checkIn: search.checkIn, checkOut: search.checkOut, guests: search.guests }),
    getTranslations({ locale, namespace: 'pages.hotel' }),
    getTranslations({ locale, namespace: 'card' }),
    getTranslations({ locale, namespace: 'unit' }),
    getTranslations({ locale, namespace: 'pages.destinations' }),
  ]);
  if (!hotel) notFound();

  const city = hotel.city ? await localizedCityName(hotel.city, locale) : null;
  const url = canonical(locale, `/hotels/${slug}`);
  const dated = Boolean(search.checkIn && search.checkOut);
  const roomQuery = buildStaysQuery({ checkIn: search.checkIn, checkOut: search.checkOut, guests: search.guests });
  const prices = hotel.rooms.map(perNight).filter((v): v is number => v !== null);
  const from = prices.length ? Math.min(...prices) : null;
  const range = dated
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .formatRange(new Date(`${search.checkIn}T00:00:00Z`), new Date(`${search.checkOut}T00:00:00Z`))
    : null;

  const jsonLd = graph(
    hotelSchema({
      url, locale, type: hotel.type, name: hotel.name, description: hotel.description, city,
      images: hotel.media.map((m) => m.public_url), point: hotel.point,
      checkIn: hotel.checkIn, checkOut: hotel.checkOut,
      services: hotel.services.map((k) => tUnit(`amenities.${k}`)),
      fromUsd: from,
      rooms: hotel.rooms.map((r) => ({ name: r.title, url: canonical(locale, `/stays/${r.slug ?? r.id}`), maxGuests: r.maxGuests, beds: r.beds })),
    }),
    breadcrumbSchema([
      { name: tDest('breadcrumbHome'), url: canonical(locale, '') },
      { name: tDest('breadcrumbStays'), url: canonical(locale, '/stays') },
      { name: hotel.name, url },
    ]),
  );

  const input = 'w-full rounded-[8px] border border-rule bg-white px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-ink';

  // Dates & guests — a plain GET form (no JavaScript): the page re-renders
  // with every room priced and checked for them.
  const DatesForm = () => (
            <form method="get" className="flex flex-col gap-3">
      <p className="text-sm font-medium text-ink">{t('datesTitle')}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-mute">
          {tUnit('checkIn')}
          <input type="date" name="checkIn" defaultValue={search.checkIn} className={input} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-mute">
          {tUnit('checkOut')}
          <input type="date" name="checkOut" defaultValue={search.checkOut} className={input} required />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-mute">
        {tUnit('guestsLabel')}
        <input type="number" name="guests" min={1} max={16} defaultValue={search.guests ?? 1} className={input} />
      </label>
      <button type="submit" className="min-h-11 rounded-[999px] bg-ink text-sm font-medium text-white transition-opacity duration-[240ms] hover:opacity-90">
        {t('showPrices')}
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-paper">
      <JsonLd data={jsonLd} />
      <Header />
      <main className="max-w-screen-xl mx-auto px-4 pt-6 pb-24">
        <Link
          href={(hotel.city ? `/stays${buildStaysQuery({ ...search, city: hotel.city })}` : '/stays') as '/stays'}
          className="mb-4 inline-flex items-center gap-1 text-sm text-mute hover:text-ink transition-colors duration-[240ms]"
        >
          <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
          {tUnit('backToStays')}
        </Link>

        {hotel.media.length > 0 && (
          <UnitGallery media={hotel.media} title={hotel.name} shareUrl={url} shareText={[city, t(`type.${hotel.type}`)].filter(Boolean).join(' · ')} />
        )}

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <header className="mb-6">
              <span className="mb-2 inline-flex rounded-[999px] bg-paper-warm px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] rtl:tracking-normal rtl:font-sans text-ink">
                {t(`type.${hotel.type}`)}
              </span>
              <h1 className="text-[clamp(1.6rem,4vw,2.4rem)] font-medium tracking-[-0.035em] leading-tight text-ink">{hotel.name}</h1>
              {city && <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-mute">{city}</p>}
              {from !== null && (
                <p className="mt-3 text-sm">
                  {tCard.rich('fromPrice', { price: `$${Math.round(from * 100) / 100}`, p: (c) => <span className="font-semibold text-stay">{c}</span> })}
                  <span className="text-mute text-xs"> {tCard('perNight')}</span>
                  <span className="text-mute text-xs"> · {tCard('roomTypes', { count: hotel.rooms.length })}</span>
                </p>
              )}
            </header>

            {hotel.description && (
              <section className="mb-8">
                <p dir="auto" lang={hotel.descriptionLang ?? undefined} className="whitespace-pre-line text-[15px] leading-relaxed text-ink-soft">{hotel.description}</p>
              </section>
            )}

            {(hotel.checkIn || hotel.checkOut) && (
              <section className="mb-8 flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-soft">
                {hotel.checkIn && <p className="flex items-center gap-2"><LogIn className="w-[18px] h-[18px] text-mute rtl:rotate-180" aria-hidden="true" />{t('checkIn')} <bdi className="font-medium text-ink">{hotel.checkIn}</bdi></p>}
                {hotel.checkOut && <p className="flex items-center gap-2"><LogOut className="w-[18px] h-[18px] text-mute rtl:rotate-180" aria-hidden="true" />{t('checkOut')} <bdi className="font-medium text-ink">{hotel.checkOut}</bdi></p>}
              </section>
            )}

            {hotel.services.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-4 text-base font-medium tracking-[-0.015em] text-ink">{t('services')}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  {hotel.services.map((k) => {
                    const Icon = HOTEL_SERVICE_ICONS[k];
                    return (
                      <div key={k} className="flex items-center gap-2.5 text-sm text-ink-soft">
                        <Icon className="w-[18px] h-[18px] text-mute shrink-0" aria-hidden="true" />
                        {tUnit(`amenities.${k}`)}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* On a phone the dates come right before the rooms they price. */}
            <div className="mb-6 rounded-[14px] border border-rule bg-white p-4 lg:hidden">
              <DatesForm />
            </div>

            {/* ── Rooms ─────────────────────────────────────────────────── */}
            <section aria-labelledby="rooms-heading" className="mb-10">
              <h2 id="rooms-heading" className="mb-1 text-xl font-medium tracking-[-0.02em] text-ink">{t('rooms')}</h2>
              <p className="mb-4 text-sm text-mute">
                {range ? t('pricesFor', { range, guests: search.guests ?? 1 }) : t('addDates')}
              </p>

              <ul className="flex flex-col gap-3">
                {hotel.rooms.map((r) => {
                  const nightly = perNight(r);
                  const bookable = r.availability === null || r.availability === 'ok';
                  return (
                    <li key={r.id} className="flex gap-3 rounded-[14px] border border-rule bg-white p-3">
                      <div className="relative h-24 w-28 sm:h-28 sm:w-40 shrink-0 overflow-hidden rounded-[10px] bg-paper-warm">
                        {r.cover && <SmartImage src={r.cover} alt={r.title} fill sizes="160px" className="object-cover" />}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <h3 className="text-sm font-semibold leading-snug text-ink line-clamp-2">{r.title}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mute">
                          {r.maxGuests && <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" />{t('sleeps', { count: r.maxGuests })}</span>}
                          {r.beds ? <span className="inline-flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" aria-hidden="true" />{tCard('specs.beds', { count: r.beds })}</span> : null}
                        </p>
                        {r.availability && r.availability !== 'ok' && (
                          <p className="mt-1 text-xs font-medium text-ink-soft">
                            {t(`unavailable.${r.availability}`, { nights: r.minNights })}
                          </p>
                        )}
                        {dated && r.availability === 'ok' && <p className="mt-1 text-xs font-medium text-ink">{t('available')}</p>}
                        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
                          <div className="min-w-[8rem] flex-1 text-sm">
                            {nightly !== null && (
                              <>
                                <span className="font-semibold text-stay">${Math.round(nightly * 100) / 100}</span>
                                <span className="text-xs text-mute"> {tCard('perNight')}</span>
                                {dated && r.pricing.total_usd !== null && r.pricing.nights && (
                                  <span className="block text-xs text-mute">${r.pricing.total_usd} {tCard('total')} · {tCard('nights', { count: r.pricing.nights })}</span>
                                )}
                              </>
                            )}
                          </div>
                          <Link
                            href={`/stays/${r.slug ?? r.id}${roomQuery}` as '/stays'}
                            data-unit={r.id}
                            data-src="hotel"
                            className={`inline-flex min-h-11 shrink-0 items-center rounded-[999px] px-4 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-90 ${
                              bookable ? 'bg-stay text-white' : 'border border-rule text-ink'
                            }`}
                          >
                            {t('viewBook')}
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <UnitWhereSection
              unitId={hotel.id}
              locale={locale}
              area={[city]}
              latitude={hotel.point?.lat ?? null}
              longitude={hotel.point?.lng ?? null}
            />
          </div>

          {/* Dates & guests — a plain GET form: the page re-renders with
              every room priced and checked for them. */}
          <aside className="hidden lg:block lg:sticky lg:top-24 h-fit rounded-[14px] border border-rule bg-white p-5 shadow-[0_2px_20px_rgba(0,0,0,0.05)]">
            <DatesForm />
          </aside>
        </div>
      </main>
    </div>
  );
}
