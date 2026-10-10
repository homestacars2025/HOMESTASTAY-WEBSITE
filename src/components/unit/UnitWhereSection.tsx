import { getTranslations } from 'next-intl/server';
import { MapPin } from 'lucide-react';
import { UnitMapSection } from './UnitMapSection';

/**
 * "Where you'll be" — ONE section: the area line ("Şişli · Istanbul ·
 * Türkiye", localised upstream), "What's nearby" chips and the map (Google).
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
        unitId={unitId}
        latitude={latitude}
        longitude={longitude}
        locale={locale}
      />
    </section>
  );
}
