// Re-exports for home page horizontal scroll sections.
// All data lives in src/lib/mock/units.ts — shape matches the real DB schema.
import { ALL_UNITS, FEATURED_UNIT_IDS, TOP_RATED_UNIT_IDS } from '@/lib/mock/units';
import type { UnitListing } from '@/lib/types/unit';

// Keep SampleUnit export so any future references resolve cleanly
export type { UnitListing as SampleUnit } from '@/lib/types/unit';

const byId = (id: string) => ALL_UNITS.find((u) => u.id === id)!;

export const FEATURED_UNITS: UnitListing[] = FEATURED_UNIT_IDS.map(byId);
export const TOP_RATED_UNITS: UnitListing[] = TOP_RATED_UNIT_IDS.map(byId);
