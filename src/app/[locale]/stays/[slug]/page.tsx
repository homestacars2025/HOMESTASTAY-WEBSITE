import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { canonical, hreflangAlternates } from '@/lib/config/urls';
import { JsonLd } from '@/components/seo/JsonLd';
import { graph, vacationRentalSchema, breadcrumbSchema } from '@/lib/seo/schema';
import {
  SITE_NAME, ogLocale, ogAlternateLocales,
  OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT,
} from '@/lib/config/seo';
import {
  socialCardDescription, socialCardTitle, formatCardPrice, cardPlace, unitTypeLabelFor,
  unitOgImage,
} from '@/lib/seo/social-card';
import { ChevronLeft, Languages } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { UnitGallery } from '@/components/unit/UnitGallery';
import { BookingCard } from '@/components/unit/BookingCard';
import { UnitSpecsSection } from '@/components/unit/UnitSpecsSection';
import { UnitAmenitiesSection } from '@/components/unit/UnitAmenitiesSection';
import { UnitRulesSection } from '@/components/unit/UnitRulesSection';
import { UnitCancellationSection } from '@/components/unit/UnitCancellationSection';
import { UnitLocationSection } from '@/components/unit/UnitLocationSection';
import { UnitMapSection } from '@/components/unit/UnitMapSection';
import { BrandMark } from '@/components/brand/BrandMark';
import { Link } from '@/i18n/navigation';
import { getPublicUnitBySlug } from '@/lib/queries/stays';
import {
  parseStaysSearchParams,
  parseStaysPage,
  buildStaysQueryWithPage,
} from '@/lib/stays/search-params';
import { quoteStay } from '@/app/[locale]/stays/[slug]/actions';
import { FadeUp } from '@/components/motion/FadeUp';
import type { UnitTypeEnum } from '@/lib/types/unit';
import { cardVersion } from '@/lib/seo/card-store';
import { formatPlace } from '@/lib/geo/localize';

export const dynamic = 'force-dynamic';

/**
 * Unit pages carried a title and a description and nothing else — no canonical,
 * no hreflang, no social card. They are 159 of the ~180 indexable URLs on the
 * site, so that gap was most of the site's SEO surface.
 *
 * The full four-locale hreflang set is correct here (unlike on a destination
 * page): a unit page renders in every locale, with unit_translations resolving
 * title and description per language and falling back to the Turkish source.
 * That matches what sitemap.xml already advertises for these URLs, so the two
 * signals agree.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const unit = await getPublicUnitBySlug(slug, locale);

  // A missing unit renders notFound() below. Emitting no canonical here keeps
  // us from declaring a 404 page canonical — Next serves the 404 with its own
  // noindex regardless, but a self-canonical on it is still a wrong signal.
  if (!unit) return { title: 'Not found — Homesta Stay' };

  const t = await getTranslations({ locale, namespace: 'unit' });

  const path = `/stays/${slug}`;
  const canonicalUrl = canonical(locale, path);
  const title = `${unit.ad_title ?? unit.unit_name} — Homesta Stay`;

  // ad_description is the full listing copy and runs to several paragraphs.
  // Search engines truncate a meta description near 160 characters, so it is
  // clipped on a word boundary rather than mid-syllable.
  const description = truncate(unit.ad_description ?? t('notFoundSub'), 160);

  // ── The social card ───────────────────────────────────────────────────────
  // og:description is NOT the meta description above. In a chat thread the card
  // is read in half a second, so it carries the three facts that decide a tap —
  // where, how much, what kind of place — while the owner's prose stays in
  // <meta description> where search engines want it.
  //
  // The price is the same unit.pricing.nightly_usd the booking card renders,
  // formatted the same way, so the WhatsApp preview can never quote a figure
  // the page then contradicts.
  const nightly = formatCardPrice(unit.pricing.nightly_usd);
  const cardDescription = socialCardDescription({
    place: cardPlace(unit.region ?? unit.municipality, unit.city, locale),
    price: nightly ? t('social.perNight', { price: nightly }) : null,
    unitTypeLabel: unitTypeLabelFor(t, unit.unit_type),
  });

  // og:title, unlike <title>, isolates the unit's own name from the brand
  // suffix so an Arabic name and the Latin "Homesta Stay" cannot interleave.
  const socialTitle = socialCardTitle(unit.ad_title ?? unit.unit_name ?? '', SITE_NAME);

  // The composited card (cover photo + title + place + price + mark), not the
  // bare photograph: see the route for why. It renders a branded card even for
  // a unit with no photo, so unlike before there is always an og:image and the
  // Twitter card is always the large one.
  //
  // Prefers the copy in Storage, which is not subject to the LRU eviction that
  // was taking the route's cached bytes overnight, and falls back to the route
  // whenever that copy is not there yet. The version is derived from the three
  // facts the card draws that actually move — see cardVersion.
  const cover = unit.media.find((m) => m.is_cover) ?? unit.media[0];
  const image = await unitOgImage(
    slug,
    locale,
    cardVersion({
      price: nightly,
      title: unit.ad_title ?? unit.unit_name ?? null,
      cover: cover?.public_url ?? null,
    }),
  );

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates(path, 'en'),
    },
    openGraph: {
      title: socialTitle,
      description: cardDescription || description,
      url: canonicalUrl,
      // 'website', not 'product': og:type=product commits to price/availability
      // properties that a nightly rate resolved per stay length cannot honestly
      // fill. The structured pricing goes in JSON-LD instead (phase 4).
      type: 'website',
      siteName: SITE_NAME,
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
      images: [
        {
          url: image,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: title,
          // JPEG, not PNG: the route re-encodes next/og's PNG so the card stays
          // under WhatsApp's ~600 KB preview ceiling. See the route.
          type: 'image/jpeg',
        },
      ],
    },
    twitter: {
      // A listing is a photograph first, and the card always has one now.
      card: 'summary_large_image',
      title: socialTitle,
      description: cardDescription || description,
      images: [image],
    },
  };
}

/** Clip to `max` characters on a word boundary, with an ellipsis. */
function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export default async function UnitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  const [t, tDest] = await Promise.all([
    getTranslations({ locale, namespace: 'unit' }),
    // Breadcrumb labels ("Home", "Stays") already exist in the destinations
    // namespace, translated in all four locales. Duplicating them would be two
    // sets of strings to keep in step.
    getTranslations({ locale, namespace: 'pages.destinations' }),
  ]);

  // Applies the same strict public-visibility filter as the index; a link to a
  // non-public or non-existent unit resolves to a real 404 (correct for SEO).
  // Title/description are resolved for the visitor's locale (unit_translations).
  const unit = await getPublicUnitBySlug(slug, locale);
  if (!unit) notFound();

  // Dates/guests carried from the search (UnitCard link) so the guest doesn't
  // re-pick. Reuses the listing parser — a lone/invalid date pair degrades to
  // none. When a valid pair is present, quote it server-side so the booking
  // card shows the right total on first paint (no client round-trip).
  const rawSearch = await searchParams;
  const search = parseStaysSearchParams(rawSearch);
  const initialQuote =
    search.checkIn && search.checkOut
      ? await quoteStay(unit.id, search.checkIn, search.checkOut)
      : null;

  // ── Derived values ─────────────────────────────────────────────────────────
  const title = unit.ad_title ?? unit.unit_name ?? '—';

  // The results the guest came from, rebuilt from the params the card link
  // carried in. Empty when they arrived cold, which lands them on the index.
  const backToStaysHref = `/stays${buildStaysQueryWithPage(search, parseStaysPage(rawSearch))}`;

  const unitTypeLabel: Record<UnitTypeEnum, string> = {
    apartment: t('unitTypes.apartment'),
    room:      t('unitTypes.room'),
    suite:     t('unitTypes.suite'),
    studio:    t('unitTypes.studio'),
    villa:     t('unitTypes.villa'),
    cabin:     t('unitTypes.cabin'),
    farm:      t('unitTypes.farm'),
    bed:       t('unitTypes.bed'),
    other:     t('unitTypes.other'),
  };

  // Location line for the header. formatPlace, not a hand-rolled join, so it
  // punctuates the way the share text and the card do — and so the 126 units
  // with no district print the city alone rather than a leading separator.
  const locationLine = formatPlace(locale, unit.region ?? unit.municipality, unit.city);

  // ── Structured data ───────────────────────────────────────────────────────
  // The amenity labels are the SAME object UnitAmenitiesSection renders below,
  // so the amenityFeature list in the markup can never name something the page
  // does not show — which is the rule Google enforces on structured data.
  const amenityLabels = {
    tv:               t('amenities.tv'),
    wifi:             t('amenities.wifi'),
    air_conditioning: t('amenities.air_conditioning'),
    heating:          t('amenities.heating'),
    kitchen:          t('amenities.kitchen'),
    dishwasher:       t('amenities.dishwasher'),
    washing_machine:  t('amenities.washing_machine'),
    hot_water:        t('amenities.hot_water'),
    hair_dryer:       t('amenities.hair_dryer'),
    iron:             t('amenities.iron'),
    extra_bed:        t('amenities.extra_bed'),
    parking:          t('amenities.parking'),
    elevator:         t('amenities.elevator'),
    pool:             t('amenities.pool'),
    gym:              t('amenities.gym'),
    self_check_in:    t('amenities.self_check_in'),
  };

  const unitUrl = canonical(locale, `/stays/${slug}`);

  // The share sheet quotes the listing with the SAME line the social card and
  // og:description carry — one guest forwarding the link in WhatsApp and
  // another seeing the auto-preview should read the same sentence.
  const shareNightly = formatCardPrice(unit.pricing.nightly_usd);
  const shareText = socialCardDescription({
    place: cardPlace(unit.region ?? unit.municipality, unit.city, locale),
    price: shareNightly ? t('social.perNight', { price: shareNightly }) : null,
    unitTypeLabel: unitTypeLabel[unit.unit_type],
  });

  const jsonLd = graph(
    vacationRentalSchema({
      unit,
      url: unitUrl,
      locale,
      amenityLabels,
      unitTypeLabel: unitTypeLabel[unit.unit_type],
    }),
    breadcrumbSchema([
      { name: tDest('breadcrumbHome'), url: canonical(locale, '') },
      { name: tDest('breadcrumbStays'), url: canonical(locale, '/stays') },
      { name: title, url: unitUrl },
    ]),
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper">
      <JsonLd data={jsonLd} />
      <Header />

      {/* pb-32 on mobile leaves room above the fixed bottom booking bar */}
      <main className="max-w-screen-xl mx-auto px-4 pt-6 pb-32 lg:pb-16">

        {/* Back link.
            It used to be a bare '/stays', so pressing it wiped the search the
            guest arrived with — city, dates, category, page, all of it — and
            dropped them on the unfiltered index. The search lives entirely in
            the URL, so rebuilding it here returns them to the exact results
            they left. A visitor who landed on this page cold (shared link,
            search engine) carries no params and still gets the plain index,
            and the link stays a real crawlable anchor rather than a
            history-dependent router.back(). */}
        <nav className="mb-6">
          <Link
            href={backToStaysHref as '/stays'}
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-mute hover:text-ink transition-colors duration-[240ms]"
          >
            <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            {t('backToStays')}
          </Link>
        </nav>

        {/* Gallery */}
        <UnitGallery
          media={unit.media}
          title={title}
          unitId={unit.id}
          shareUrl={unitUrl}
          shareText={shareText}
        />

        {/* 2-column layout: content left + sticky booking card right (desktop) */}
        <div className="mt-8 lg:grid lg:grid-cols-[1fr_360px] lg:gap-16 lg:items-start">

          {/* ── Main content ──────────────────────────────────────────────── */}
          <div>

            {/* Title + location + rating */}
            <FadeUp>
            <header className="mb-6">
              <h1 className="text-[clamp(1.5rem,4vw,2.25rem)] font-medium tracking-[-0.035em] text-ink mb-2 leading-tight">
                {title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {locationLine && (
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
                    {locationLine}
                  </p>
                )}
                {unit.rating !== null && (
                  <div className="flex items-center gap-1 text-ink-soft text-sm">
                    <BrandMark className="w-[12px] h-[12px]" />
                    <span className="font-semibold tabular-nums">{unit.rating.toFixed(2)}</span>
                    {unit.review_count !== null && (
                      <span className="text-mute">
                        · {unit.review_count} {t('reviews')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </header>

            </FadeUp>

            <hr className="border-rule mb-6" />

            {/* ── 1. SPECIFICATIONS (key + secondary) ────────────────────── */}
            <FadeUp>
            <div className="mb-6">
              <UnitSpecsSection
                specs={unit.specifications}
                unitType={unit.unit_type}
                minNights={unit.min_nights}
                labels={{
                  specsTitle:        t('specsTitle'),
                  bedroomsZero:      t('specs.bedroomsZero'),
                  bedroom:           t('specs.bedroom'),
                  bedrooms:          t('specs.bedrooms'),
                  bed:               t('specs.bed'),
                  beds:              t('specs.beds'),
                  bathroom:          t('specs.bathroom'),
                  bathrooms:         t('specs.bathrooms'),
                  guests:            t('specs.guests'),
                  sqm:               t('specs.sqm'),
                  nightMin:          t('specs.nightMin'),
                  nightsMin:         t('specs.nightsMin'),
                  floor:             t('specs.floor'),
                  balcony:           t('specs.balcony'),
                  balconies:         t('specs.balconies'),
                  kitchen:           t('specs.kitchen'),
                  kitchens:          t('specs.kitchens'),
                  size:              t('specs.size'),
                  distanceMall:      t('specs.distanceMall'),
                  distanceTransport: t('specs.distanceTransport'),
                  type:              t('specs.type'),
                  minStay:           t('specs.minStay'),
                  unitTypeLabel:     unitTypeLabel[unit.unit_type],
                }}
              />
            </div>
            </FadeUp>

            <hr className="border-rule mb-6" />

            {/* ── 2. DESCRIPTION ──────────────────────────────────────────── */}
            {unit.ad_description && (
              <>
                <FadeUp>
                <section className="mb-6">
                  <h2 className="text-base font-medium text-ink mb-4 tracking-[-0.015em]">
                    {t('about')}
                  </h2>
                  {/* dir follows the language of the text itself (Arabic → rtl),
                      independent of the UI locale — matters when the description
                      falls back to Turkish under an Arabic UI. */}
                  <p
                    dir={unit.content_language === 'ar' ? 'rtl' : 'ltr'}
                    className="text-ink-soft leading-relaxed whitespace-pre-line"
                  >
                    {unit.ad_description}
                  </p>
                  {/* Machine-translation disclaimer — only for non-Turkish AI copy */}
                  {unit.is_machine_translated && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs italic text-mute">
                      <Languages className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      {t('aiTranslatedNotice')}
                    </p>
                  )}
                </section>
                </FadeUp>
                <hr className="border-rule mb-6" />
              </>
            )}

            {/* ── 3. AMENITIES (grouped) ───────────────────────────────────── */}
            <FadeUp>
            <div className="mb-6">
              <UnitAmenitiesSection
                amenities={unit.amenities}
                labels={{
                  amenitiesTitle: t('amenitiesTitle'),
                  groups: {
                    connectivity:    t('amenityGroups.connectivity'),
                    climate:         t('amenityGroups.climate'),
                    kitchenLaundry:  t('amenityGroups.kitchenLaundry'),
                    bathroomComfort: t('amenityGroups.bathroomComfort'),
                    buildingAccess:  t('amenityGroups.buildingAccess'),
                  },
                  items: {
                    tv:               t('amenities.tv'),
                    wifi:             t('amenities.wifi'),
                    air_conditioning: t('amenities.air_conditioning'),
                    heating:          t('amenities.heating'),
                    kitchen:          t('amenities.kitchen'),
                    dishwasher:       t('amenities.dishwasher'),
                    washing_machine:  t('amenities.washing_machine'),
                    hot_water:        t('amenities.hot_water'),
                    hair_dryer:       t('amenities.hair_dryer'),
                    iron:             t('amenities.iron'),
                    extra_bed:        t('amenities.extra_bed'),
                    parking:          t('amenities.parking'),
                    elevator:         t('amenities.elevator'),
                    pool:             t('amenities.pool'),
                    gym:              t('amenities.gym'),
                    self_check_in:    t('amenities.self_check_in'),
                  },
                }}
              />
            </div>
            </FadeUp>

            <hr className="border-rule mb-6" />

            {/* ── 4. HOUSE RULES ──────────────────────────────────────────── */}
            {unit.rules && (
              <>
                <FadeUp>
                <div className="mb-6">
                  <UnitRulesSection
                    rules={unit.rules}
                    labels={{
                      rulesTitle:                t('rulesTitle'),
                      allow_parties:             t('rules.allow_parties'),
                      allow_pets:                t('rules.allow_pets'),
                      allow_smoking:             t('rules.allow_smoking'),
                      allow_unregistered_guests: t('rules.allow_unregistered_guests'),
                      family_friendly:           t('rules.family_friendly'),
                      id_required:               t('rules.id_required'),
                      quiet_hours:               t('rules.quiet_hours'),
                      additional_rules:          t('rules.additional_rules'),
                      allowed:                   t('rules.allowed'),
                      not_allowed:               t('rules.not_allowed'),
                      yes:                       t('rules.yes'),
                      no:                        t('rules.no'),
                    }}
                  />
                </div>
                </FadeUp>
                <hr className="border-rule mb-6" />
              </>
            )}

            {/* ── 5. CANCELLATION POLICY ──────────────────────────────────── */}
            {unit.cancellation_policy && (
              <>
                <FadeUp>
                <div className="mb-6">
                  <UnitCancellationSection
                    policy={unit.cancellation_policy}
                    cancellationTitle={t('cancellationTitle')}
                  />
                </div>
                </FadeUp>
                <hr className="border-rule mb-6" />
              </>
            )}

            {/* ── 6. LOCATION ─────────────────────────────────────────────── */}
            <FadeUp>
            <UnitLocationSection
              region={unit.region}
              municipality={unit.municipality}
              city={unit.city}
              country={unit.country}
              labels={{ locationTitle: t('locationTitle') }}
            />
            </FadeUp>

            {/* ── 7. WHERE YOU'LL BE (interactive map) ─────────────────────── */}
            {/* Renders only when the unit has coordinates; hidden otherwise. */}
            <FadeUp>
            <div className="mt-6">
              <UnitMapSection
                latitude={unit.latitude}
                longitude={unit.longitude}
                city={unit.city}
                country={unit.country}
                labels={{
                  whereYoullBe: t('whereYoullBe'),
                  street:       t('mapStreet'),
                  satellite:    t('mapSatellite'),
                }}
              />
            </div>
            </FadeUp>
          </div>

          {/* ── Booking card (desktop side / mobile bottom bar) ──────────── */}
          <BookingCard
            pricing={unit.pricing}
            minNights={unit.min_nights}
            rating={unit.rating}
            reviewCount={unit.review_count}
            unitId={unit.id}
            unitTitle={title}
            slug={slug}
            initialCheckIn={search.checkIn}
            initialCheckOut={search.checkOut}
            initialGuests={search.guests}
            initialQuote={initialQuote}
          />
        </div>
      </main>
    </div>
  );
}
