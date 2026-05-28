import { MapPin, ExternalLink } from 'lucide-react';

interface UnitLocationSectionProps {
  region: string | null;
  municipality: string | null;
  city: string | null;
  country: string | null;
  full_address: string | null;
  google_maps_url: string | null;
  labels: {
    locationTitle: string;
    address: string;
    viewOnMaps: string;
  };
}

export function UnitLocationSection({
  region,
  municipality,
  city,
  country,
  full_address,
  google_maps_url,
  labels,
}: UnitLocationSectionProps) {
  // Build the location breadcrumb: region / municipality · city · country
  const breadcrumbParts = [
    region ?? municipality,
    city,
    country,
  ].filter(Boolean);

  if (breadcrumbParts.length === 0 && !full_address && !google_maps_url) return null;

  return (
    <section>
      <h2 className="text-base font-medium text-ink mb-4 tracking-[-0.015em]">
        {labels.locationTitle}
      </h2>

      <div className="space-y-3">
        {/* Breadcrumb */}
        {breadcrumbParts.length > 0 && (
          <div className="flex items-center gap-2">
            <MapPin className="w-[18px] h-[18px] text-mute shrink-0" />
            <span className="text-sm text-ink-soft">
              {breadcrumbParts.join(' · ')}
            </span>
          </div>
        )}

        {/* Full address */}
        {full_address && (
          <div className="ps-[26px]">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-1">
              {labels.address}
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">{full_address}</p>
          </div>
        )}

        {/* Google Maps link */}
        {google_maps_url && (
          <div className="ps-[26px]">
            <a
              href={google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-ink font-medium underline underline-offset-2 transition-opacity duration-[240ms] hover:opacity-70"
            >
              {labels.viewOnMaps}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
