import { MapPin } from 'lucide-react';

interface UnitLocationSectionProps {
  region: string | null;
  municipality: string | null;
  city: string | null;
  country: string | null;
  labels: {
    locationTitle: string;
  };
}

/**
 * Area-level location only — region / city / country.
 *
 * The full street address and the Google Maps link used to sit here, and both
 * gave away the exact property while the map beside them showed a deliberately
 * approximate circle. They are withheld until a booking is confirmed, and are no
 * longer fetched at all (see LISTING_SELECT in queries/stays.ts).
 */
export function UnitLocationSection({
  region,
  municipality,
  city,
  country,
  labels,
}: UnitLocationSectionProps) {
  // Build the location breadcrumb: region / municipality · city · country
  const breadcrumbParts = [
    region ?? municipality,
    city,
    country,
  ].filter(Boolean);

  if (breadcrumbParts.length === 0) return null;

  return (
    <section>
      <h2 className="text-base font-medium text-ink mb-4 tracking-[-0.015em]">
        {labels.locationTitle}
      </h2>

      <div className="flex items-center gap-2">
        <MapPin className="w-[18px] h-[18px] text-mute shrink-0" />
        <span className="text-sm text-ink-soft">{breadcrumbParts.join(' · ')}</span>
      </div>
    </section>
  );
}
