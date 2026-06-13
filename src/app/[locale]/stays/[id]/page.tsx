import { getTranslations } from 'next-intl/server';
import { ChevronLeft } from 'lucide-react';
import { Header } from '@/components/home/Header';
import { UnitGallery } from '@/components/unit/UnitGallery';
import { BookingCard } from '@/components/unit/BookingCard';
import { UnitSpecsSection } from '@/components/unit/UnitSpecsSection';
import { UnitAmenitiesSection } from '@/components/unit/UnitAmenitiesSection';
import { UnitRulesSection } from '@/components/unit/UnitRulesSection';
import { UnitCancellationSection } from '@/components/unit/UnitCancellationSection';
import { UnitLocationSection } from '@/components/unit/UnitLocationSection';
import { BrandMark } from '@/components/brand/BrandMark';
import { SampleBadge } from '@/components/shared/SampleBadge';
import { SampleBar } from '@/components/shared/SampleBar';
import { Link } from '@/i18n/navigation';
import { ALL_UNITS } from '@/lib/mock/units';
import { FadeUp } from '@/components/motion/FadeUp';
import type { UnitTypeEnum } from '@/lib/types/unit';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const unit = ALL_UNITS.find((u) => u.id === id);
  if (!unit) return { title: 'Not found — Homesta Stay' };
  const t = await getTranslations({ locale, namespace: 'unit' });
  return {
    title: `${unit.ad_title ?? unit.unit_name} — Homesta Stay`,
    description: unit.ad_description ?? t('notFoundSub'),
  };
}

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'unit' });
  const tSample = await getTranslations({ locale, namespace: 'sample' });

  const unit = ALL_UNITS.find((u) => u.id === id);

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!unit) {
    return (
      <div className="min-h-screen bg-paper">
        <Header />
        <main className="max-w-screen-xl mx-auto px-4 pt-24 pb-24 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute mb-4">404</p>
          <h1 className="text-[clamp(1.5rem,4vw,2.25rem)] font-medium tracking-[-0.035em] text-ink mb-3">
            {t('notFound')}
          </h1>
          <p className="text-ink-soft mb-8 max-w-xs mx-auto leading-relaxed">
            {t('notFoundSub')}
          </p>
          <Link
            href="/stays"
            className="inline-flex items-center gap-1.5 bg-ink text-white rounded-[999px] px-6 py-2.5 text-sm font-medium transition-opacity duration-[240ms] hover:opacity-80"
          >
            {t('backToStays')}
          </Link>
        </main>
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const title = unit.ad_title ?? unit.unit_name ?? '—';

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

  // Location breadcrumb for the header (district · city)
  const locationParts = [
    unit.region ?? unit.municipality,
    unit.city,
  ].filter(Boolean);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-paper">
      <Header />

      {/* pb-32 on mobile leaves room above the fixed bottom booking bar */}
      <main className="max-w-screen-xl mx-auto px-4 pt-6 pb-32 lg:pb-16">

        {/* Back link */}
        <nav className="mb-6">
          <Link
            href="/stays"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-mute hover:text-ink transition-colors duration-[240ms]"
          >
            <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            {t('backToStays')}
          </Link>
        </nav>

        {/* Pre-launch sample notice */}
        {unit.is_sample && (
          <SampleBar messageKey="detailNotice" dismissible className="mb-5" />
        )}

        {/* Gallery */}
        <UnitGallery media={unit.media} title={title} unitId={unit.id} />

        {/* 2-column layout: content left + sticky booking card right (desktop) */}
        <div className="mt-8 lg:grid lg:grid-cols-[1fr_360px] lg:gap-16 lg:items-start">

          {/* ── Main content ──────────────────────────────────────────────── */}
          <div>

            {/* Title + location + rating */}
            <FadeUp>
            <header className="mb-6">
              {unit.is_sample && <SampleBadge className="mb-3" />}
              <h1 className="text-[clamp(1.5rem,4vw,2.25rem)] font-medium tracking-[-0.035em] text-ink mb-2 leading-tight">
                {title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {locationParts.length > 0 && (
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
                    {locationParts.join(' · ')}
                  </p>
                )}
                {unit.is_sample ? (
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
                    {tSample('new')}
                  </span>
                ) : (
                  unit.rating !== null && (
                    <div className="flex items-center gap-1 text-ink-soft text-sm">
                      <BrandMark className="w-[12px] h-[12px]" />
                      <span className="font-semibold tabular-nums">{unit.rating.toFixed(2)}</span>
                      {unit.review_count !== null && (
                        <span className="text-mute">
                          · {unit.review_count} {t('reviews')}
                        </span>
                      )}
                    </div>
                  )
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
                  <p className="text-ink-soft leading-relaxed">
                    {unit.ad_description}
                  </p>
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
              full_address={unit.full_address}
              google_maps_url={unit.google_maps_url}
              labels={{
                locationTitle: t('locationTitle'),
                address:       t('address'),
                viewOnMaps:    t('viewOnMaps'),
              }}
            />
            </FadeUp>
          </div>

          {/* ── Booking card (desktop side / mobile bottom bar) ──────────── */}
          <BookingCard
            price={unit.base_nightly_price}
            minNights={unit.min_nights}
            rating={unit.is_sample ? null : unit.rating}
            reviewCount={unit.is_sample ? null : unit.review_count}
            unitId={unit.id}
            unitTitle={title}
          />
        </div>
      </main>
    </div>
  );
}
