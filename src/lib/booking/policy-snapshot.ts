import type { UnitCancellationPolicy } from '@/lib/types/unit';

/**
 * The cancellation policy a guest ACCEPTED, from
 * bookings.cancellation_policy_snapshot — written by the database on insert
 * (older bookings backfilled), so it never changes when the unit's policy, or
 * the policy row itself, is edited later. Booking details and the
 * confirmation email read this, never the unit's current policy.
 *
 * Shape: { id, name: {en,tr,ar,ru}, description: {en,tr,ar,ru},
 * full_refund_days, partial_refund_days, partial_refund_percent, is_custom,
 * captured_at, backfilled? }. Custom policies are ordinary snapshots.
 *
 * Text is the visitor's language, else English. Null when the snapshot is
 * missing or has no name in either — the caller then leaves the block out
 * rather than showing a policy the guest did not accept.
 */
export function policyFromSnapshot(snapshot: unknown, locale: string): UnitCancellationPolicy | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as Record<string, unknown>;
  const pick = (field: unknown): string => {
    if (!field || typeof field !== 'object') return '';
    const byLang = field as Record<string, unknown>;
    const text = (lang: string) => (typeof byLang[lang] === 'string' ? (byLang[lang] as string).trim() : '');
    return text(locale) || text('en');
  };
  const name = pick(s.name);
  if (!name) return null;
  return {
    id: typeof s.id === 'string' ? s.id : '',
    name,
    description: pick(s.description),
  };
}
