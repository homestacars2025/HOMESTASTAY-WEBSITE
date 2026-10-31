import { PolicyText } from '@/components/unit/PolicyText';
import type { UnitCancellationPolicy } from '@/lib/types/unit';

interface UnitCancellationSectionProps {
  policy: UnitCancellationPolicy;
  cancellationTitle: string;
}

export function UnitCancellationSection({ policy, cancellationTitle }: UnitCancellationSectionProps) {
  return (
    <section>
      <h2 className="text-base font-medium text-ink mb-4 tracking-[-0.015em]">
        {cancellationTitle}
      </h2>
      <PolicyText policy={policy} />
    </section>
  );
}
