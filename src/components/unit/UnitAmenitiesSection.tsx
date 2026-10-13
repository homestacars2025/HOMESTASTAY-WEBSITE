import {
  Tv,
  Wifi,
  Wind,
  Flame,
  ChefHat,
  Droplets,
  WashingMachine,
  Thermometer,
  Zap,
  Shirt,
  BedDouble,
  Car,
  ArrowUpDown,
  Waves,
  Dumbbell,
  KeyRound,
} from 'lucide-react';
import { HOTEL_SERVICE_KEYS, type UnitAmenities } from '@/lib/types/unit';
import { HOTEL_SERVICE_ICONS } from './hotel-service-icons';

interface AmenityGroupDef {
  key: 'hotelServices' | 'connectivity' | 'climate' | 'kitchenLaundry' | 'bathroomComfort' | 'buildingAccess';
  items: Array<{
    field: keyof UnitAmenities;
    Icon: React.ElementType;
  }>;
}

const AMENITY_GROUPS: AmenityGroupDef[] = [
  // A hotel's services (property_amenities, inherited through
  // unit_amenities_effective) — first, because they are what a hotel is.
  {
    key:   'hotelServices',
    items: HOTEL_SERVICE_KEYS.map((field) => ({ field, Icon: HOTEL_SERVICE_ICONS[field] })),
  },
  {
    key:   'connectivity',
    items: [
      { field: 'tv',   Icon: Tv },
      { field: 'wifi', Icon: Wifi },
    ],
  },
  {
    key:   'climate',
    items: [
      { field: 'air_conditioning', Icon: Wind },
      { field: 'heating',          Icon: Flame },
    ],
  },
  {
    key:   'kitchenLaundry',
    items: [
      { field: 'kitchen',         Icon: ChefHat },
      { field: 'dishwasher',      Icon: Droplets },
      { field: 'washing_machine', Icon: WashingMachine },
    ],
  },
  {
    key:   'bathroomComfort',
    items: [
      { field: 'hot_water',  Icon: Thermometer },
      { field: 'hair_dryer', Icon: Zap },
      { field: 'iron',       Icon: Shirt },
      { field: 'extra_bed',  Icon: BedDouble },
    ],
  },
  {
    key:   'buildingAccess',
    items: [
      { field: 'parking',       Icon: Car },
      { field: 'elevator',      Icon: ArrowUpDown },
      { field: 'pool',          Icon: Waves },
      { field: 'gym',           Icon: Dumbbell },
      { field: 'self_check_in', Icon: KeyRound },
    ],
  },
];

interface UnitAmenitiesSectionProps {
  amenities: UnitAmenities;
  labels: {
    amenitiesTitle: string;
    groups: Record<AmenityGroupDef['key'], string>;
    items: Record<keyof UnitAmenities, string>;
  };
}

export function UnitAmenitiesSection({ amenities, labels }: UnitAmenitiesSectionProps) {
  // Filter to groups that have at least one enabled amenity
  const activeGroups = AMENITY_GROUPS.filter((group) =>
    group.items.some(({ field }) => amenities[field])
  );

  if (activeGroups.length === 0) return null;

  return (
    <section>
      <h2 className="text-base font-medium text-ink mb-5 tracking-[-0.015em]">
        {labels.amenitiesTitle}
      </h2>

      <div className="space-y-6">
        {activeGroups.map((group) => {
          const enabledItems = group.items.filter(({ field }) => amenities[field]);
          return (
            <div key={group.key}>
              {/* Group header */}
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-3">
                {labels.groups[group.key]}
              </p>

              {/* Amenity items */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                {enabledItems.map(({ field, Icon }) => (
                  <div key={field} className="flex items-center gap-2.5 text-sm text-ink-soft">
                    <Icon className="w-[18px] h-[18px] text-mute shrink-0" />
                    <span>{labels.items[field]}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
