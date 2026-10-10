'use client';

import { useEffect } from 'react';
import { captureLanding, track } from '@/lib/analytics/events';

/**
 * Mounted once in the root layout. Records where the session came from (UTM
 * tags, referrer — first page only) and listens for two kinds of click
 * anywhere on the site, by delegation, so server-rendered markup needs no
 * client code of its own:
 *
 *   a[data-unit]            a unit card → unit_click (position, source)
 *   a[href*="wa.me"] / whatsapp.com → whatsapp_click (+ the unit, on a unit page)
 *
 * Capture phase, so the event is queued before the navigation starts; the
 * beacon in lib/analytics/events survives the page change.
 */
export function EventTracker() {
  useEffect(() => {
    captureLanding();

    function onClick(e: MouseEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const card = target.closest<HTMLElement>('a[data-unit]');
      if (card && !target.closest('button')) {
        const position = Number(card.dataset.pos);
        track({
          event: 'unit_click',
          unit_id: card.dataset.unit,
          source: card.dataset.src || undefined,
          position: Number.isInteger(position) ? position : undefined,
        }, { now: true });
        return;
      }

      const wa = target.closest<HTMLAnchorElement>('a[href*="wa.me"], a[href*="whatsapp.com"]');
      if (wa) {
        const unit = document.querySelector<HTMLElement>('[data-unit-page]')?.dataset.unitPage;
        track({ event: 'whatsapp_click', unit_id: unit || undefined }, { now: true });
      }
    }

    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  return null;
}
