import type { UnitCancellationPolicy } from '@/lib/types/unit';

/**
 * A cancellation policy's name with its explanation under it, in full. One
 * component so every surface says it the same way.
 *
 * Spans, not a heading and a paragraph: it also has to be valid inside a
 * <label> and a <p>.
 */
export function PolicyText({ policy }: { policy: UnitCancellationPolicy }) {
  return (
    <span className="block">
      <span className="block text-sm font-normal text-ink">{policy.name}</span>
      {policy.description && (
        <span className="block mt-1 text-[13px] text-mute leading-relaxed">
          {policy.description}
        </span>
      )}
    </span>
  );
}
