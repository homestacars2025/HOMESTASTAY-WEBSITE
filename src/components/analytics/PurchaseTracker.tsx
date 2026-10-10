'use client';

import { useEffect } from 'react';
import { trackPurchase } from '@/lib/analytics/meta-pixel';

/**
 * Meta Purchase, on the booking page once the booking is PAID. The booking
 * reference is the eventID, so Meta collapses a refresh (and any future
 * server-side send) into one purchase; a per-tab marker stops the refresh
 * from even sending a second one.
 */
export function PurchaseTracker({ reference, unitId, valueUsd }: { reference: string; unitId: string; valueUsd: number }) {
  useEffect(() => {
    const key = `hs_purchase_${reference}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
    } catch { /* storage blocked — eventID dedup still applies */ }
    trackPurchase({ contentId: unitId, value: valueUsd, currency: 'USD', eventId: reference });
  }, [reference, unitId, valueUsd]);
  return null;
}
