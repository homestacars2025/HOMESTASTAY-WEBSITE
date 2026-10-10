import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { MapPin, TrainFront } from 'lucide-react';
import { UnitMapSection } from './UnitMapSection';
import { getNearbyStation } from '@/lib/geo/nearby';

/**
 * "Where you'll be" — ONE section: the area line ("Şişli · Istanbul ·
 * Türkiye", localised upstream), the map, and the nearest station.
 *
 * Area-level only. The street address and a maps link are withheld until a
 * booking is confirmed and are not even fetched (see LISTING_SELECT); the
 * coordinates here are the blurred point from approximateCoords.
 */
export async function UnitWhereSection({
  unitId,
  locale,
  area,
  latitude,
  longitude,
}: {
  unitId: string;
  locale: string;
  area: (string | null)[];
  latitude: number | null;
  longitude: number | null;
}) {
  const t = await getTranslations({ locale, namespace: 'unit' });
  const line = area.filter(Boolean).join(' · ');
  if (!line && (latitude == null || longitude == null)) return null;

  return (
    <section aria-labelledby="where-heading">
      <h2 id="where-heading" className="text-base font-medium text-ink mb-1 tracking-[-0.015em]">
        {t('whereYoullBe')}
      </h2>
      {line && (
        <p className="flex items-center gap-2 text-sm text-ink-soft mb-4">
          <MapPin className="w-[18px] h-[18px] text-mute shrink-0" aria-hidden="true" />
          {line}
        </p>
      )}

      <UnitMapSection
        latitude={latitude}
        longitude={longitude}
        locale={locale}
        labels={{
          street: t('mapStreet'),
          satellite: t('mapSatellite'),
          zoomIn: t('map.zoomIn'),
          zoomOut: t('map.zoomOut'),
          attribution: t('map.attribution'),
          improve: t('map.improve'),
          map: t('map.title'),
          scrollHint: t('map.scrollHint'),
        }}
      />

      {latitude != null && longitude != null && (
        // Streams after the page; reserves its line so nothing jumps.
        <Suspense fallback={<div className="mt-3 h-5" />}>
          <NearbyLine unitId={unitId} locale={locale} latitude={latitude} longitude={longitude} />
        </Suspense>
      )}
    </section>
  );
}

async function NearbyLine({ unitId, locale, latitude, longitude }: { unitId: string; locale: string; latitude: number; longitude: number }) {
  const [t, nearby] = await Promise.all([
    getTranslations({ locale, namespace: 'unit.map' }),
    getNearbyStation(unitId, latitude, longitude, locale),
  ]);
  if (!nearby) return <div className="mt-3 h-5" />;
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft min-h-5">
      <TrainFront className="w-[18px] h-[18px] text-mute shrink-0" aria-hidden="true" />
      <span>
        {t('nearestStation')} <span className="text-ink">{nearby.name}</span>
        {' · '}
        {t(nearby.mode === 'walk' ? 'walk' : 'drive', { minutes: nearby.minutes })}
      </span>
    </p>
  );
}
