import { icons, Sparkles, type LucideIcon } from 'lucide-react';
import { formatServiceUsd } from '@/lib/services/format';
import type { ServicePricingUnit, UnitService } from '@/lib/services/types';

/** "utensils-crossed" → icons.UtensilsCrossed; unknown names get a neutral mark. */
function iconFor(key: string | null): LucideIcon {
  if (!key) return Sparkles;
  const pascal = key
    .trim()
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
  return (icons as Record<string, LucideIcon>)[pascal] ?? Sparkles;
}

interface UnitServicesSectionProps {
  services: UnitService[];
  labels: {
    title:    string;
    required: string;
    /** "{price} / guest / night" — one template per pricing unit. */
    price:    (unit: ServicePricingUnit, price: string) => string;
  };
}

/**
 * The unit's extra services, under the amenities.
 *
 * A Server Component: the list is plain server-rendered HTML — crawlable, no
 * client JavaScript, no layout shift — and the icon lookup over the whole
 * lucide set happens here, so none of it ships to the browser. The section is
 * omitted entirely when the unit has no services.
 */
export function UnitServicesSection({ services, labels }: UnitServicesSectionProps) {
  if (services.length === 0) return null;

  return (
    <section aria-labelledby="unit-services-title">
      <h2 id="unit-services-title" className="text-base font-medium text-ink mb-5 tracking-[-0.015em]">
        {labels.title}
      </h2>

      <ul className="flex flex-col gap-4">
        {services.map((s) => {
          const Icon = iconFor(s.icon_key);
          return (
            <li key={s.id} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-warm">
                <Icon className="h-[18px] w-[18px] text-ink-soft" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-ink">
                    {s.name}
                    {s.is_required && (
                      <span className="ms-2 inline-block rounded-full bg-paper-warm px-2 py-0.5 align-middle font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
                        {labels.required}
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-semibold text-stay tabular-nums whitespace-nowrap">
                    {labels.price(s.pricing_unit, formatServiceUsd(s.price_usd))}
                  </p>
                </div>
                {s.description && (
                  <p className="mt-1 text-sm text-ink-soft leading-relaxed">{s.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
