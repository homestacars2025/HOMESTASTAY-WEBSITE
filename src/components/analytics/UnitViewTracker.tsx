'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics/events';
import { trackViewContent } from '@/lib/analytics/meta-pixel';

/** A unit page was opened: unit_view + Meta ViewContent (content_ids = unit id). */
export function UnitViewTracker({
  unitId,
  title,
  nightlyUsd,
  city,
}: {
  unitId: string;
  title: string | null;
  nightlyUsd: number | null;
  city: string | null;
}) {
  useEffect(() => {
    track({ event: 'unit_view', unit_id: unitId, city: city ?? undefined });
    trackViewContent({
      contentId: unitId,
      contentName: title ?? undefined,
      value: nightlyUsd ?? undefined,
      currency: 'USD',
      city: city ?? undefined,
    });
  }, [unitId, title, nightlyUsd, city]);
  return null;
}
