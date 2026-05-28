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
      <div className="flex flex-col gap-1.5">
        <span className="inline-flex">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-stay bg-stay/8 px-2.5 py-1 rounded-[999px]">
            {policy.name}
          </span>
        </span>
        <p className="text-sm text-ink-soft leading-relaxed mt-1">
          {policy.description}
        </p>
      </div>
    </section>
  );
}
