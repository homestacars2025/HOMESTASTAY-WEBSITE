import {
  Bed,
  BedDouble,
  Bath,
  Users,
  Layers,
  ChefHat,
  ShoppingBag,
  Bus,
  Ruler,
  Sun,
  Home,
  Moon,
} from 'lucide-react';
import type { UnitSpecifications, UnitTypeEnum } from '@/lib/types/unit';

interface UnitSpecsSectionProps {
  specs: UnitSpecifications;
  unitType: UnitTypeEnum;
  minNights: number;
  labels: {
    specsTitle: string;
    bedroomsZero: string;
    bedroom: string;
    bedrooms: string;
    bed: string;
    beds: string;
    bathroom: string;
    bathrooms: string;
    guests: string;
    sqm: string;
    nightMin: string;
    nightsMin: string;
    floor: string;
    balcony: string;
    balconies: string;
    kitchen: string;
    kitchens: string;
    size: string;
    distanceMall: string;
    distanceTransport: string;
    type: string;
    minStay: string;
    unitTypeLabel: string;
  };
}

export function UnitSpecsSection({ specs, unitType, minNights, labels }: UnitSpecsSectionProps) {
  // ── Primary key stats ────────────────────────────────────────────────────
  type StatItem = { value: string; label: string; Icon: React.ElementType };
  const primaryStats: StatItem[] = [];

  if (specs.bedrooms !== null) {
    primaryStats.push({
      Icon:  Bed,
      value: specs.bedrooms === 0 ? labels.bedroomsZero : String(specs.bedrooms),
      label: specs.bedrooms === 0
        ? ''
        : specs.bedrooms === 1 ? labels.bedroom : labels.bedrooms,
    });
  }

  if (specs.beds !== null) {
    primaryStats.push({
      Icon:  BedDouble,
      value: String(specs.beds),
      label: specs.beds === 1 ? labels.bed : labels.beds,
    });
  }

  if (specs.bathrooms !== null) {
    primaryStats.push({
      Icon:  Bath,
      value: String(specs.bathrooms),
      label: Number(specs.bathrooms) === 1 ? labels.bathroom : labels.bathrooms,
    });
  }

  if (specs.max_guests !== null) {
    primaryStats.push({
      Icon:  Users,
      value: String(specs.max_guests),
      label: labels.guests,
    });
  }

  // ── Secondary detail rows ────────────────────────────────────────────────
  type DetailRow = { Icon: React.ElementType; label: string; value: string };
  const secondaryDetails: DetailRow[] = [];

  secondaryDetails.push({
    Icon:  Home,
    label: labels.type,
    value: labels.unitTypeLabel,
  });

  secondaryDetails.push({
    Icon:  Moon,
    label: labels.minStay,
    value: `${minNights} ${minNights === 1 ? labels.nightMin : labels.nightsMin}`,
  });

  if (specs.size_sqm !== null) {
    secondaryDetails.push({
      Icon:  Ruler,
      label: labels.size,
      value: `${specs.size_sqm} ${labels.sqm}`,
    });
  }

  if (specs.floor !== null) {
    secondaryDetails.push({
      Icon:  Layers,
      label: labels.floor,
      value: String(specs.floor),
    });
  }

  if (specs.balconies !== null && specs.balconies > 0) {
    secondaryDetails.push({
      Icon:  Sun,
      label: specs.balconies === 1 ? labels.balcony : labels.balconies,
      value: String(specs.balconies),
    });
  }

  if (specs.kitchens !== null && specs.kitchens > 0) {
    secondaryDetails.push({
      Icon:  ChefHat,
      label: specs.kitchens === 1 ? labels.kitchen : labels.kitchens,
      value: String(specs.kitchens),
    });
  }

  if (specs.distance_to_mall) {
    secondaryDetails.push({
      Icon:  ShoppingBag,
      label: labels.distanceMall,
      value: specs.distance_to_mall,
    });
  }

  if (specs.distance_to_transport) {
    secondaryDetails.push({
      Icon:  Bus,
      label: labels.distanceTransport,
      value: specs.distance_to_transport,
    });
  }

  if (primaryStats.length === 0 && secondaryDetails.length === 0) return null;

  return (
    <section>
      <h2 className="text-base font-medium text-ink mb-5 tracking-[-0.015em]">
        {labels.specsTitle}
      </h2>

      {/* Primary: big-number grid (bedrooms / beds / baths / guests) */}
      {primaryStats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {primaryStats.map(({ Icon, value, label }, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Icon className="w-4 h-4 text-mute shrink-0" />
                <span className="text-2xl font-semibold text-ink leading-none tabular-nums">
                  {value}
                </span>
              </div>
              {label && (
                <span className="text-[13px] text-mute ps-[22px]">{label}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Secondary: icon + label: value rows in a 2-col grid */}
      {secondaryDetails.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {secondaryDetails.map(({ Icon, label, value }, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <Icon className="w-[18px] h-[18px] text-mute shrink-0" />
              <span className="text-mute">{label}</span>
              <span className="text-ink-soft ms-auto">{value}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
