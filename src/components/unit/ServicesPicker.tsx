'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Minus, Plus } from 'lucide-react';
import { formatServiceUsd } from '@/lib/services/format';
import { maxQuantityFor } from '@/lib/services/selection';
import type { ServiceSelection, UnitService } from '@/lib/services/types';

/** Services the guest ticked → quantity. */
export type ServicesSelectionMap = Record<string, number>;

/** The map → what quote_unit_services() takes. */
export function toSelections(selected: ServicesSelectionMap): ServiceSelection[] {
  return Object.entries(selected)
    .filter(([, qty]) => qty > 0)
    .map(([unit_service_id, quantity]) => ({ unit_service_id, quantity }));
}

interface ServicesPickerProps {
  services: UnitService[];
  selected: ServicesSelectionMap;
  onChange: (next: ServicesSelectionMap) => void;
}

/**
 * Add-ons in the booking widget: a checkbox per service and a quantity stepper
 * on per_item services (1…max_quantity, never above 20).
 *
 * Holds no state of its own: the selection lives in BookingCard so the desktop
 * card and the booking modal (the mobile path) show the same choices.
 */
export function ServicesPicker({ services, selected, onChange }: ServicesPickerProps) {
  const t      = useTranslations('unit.services');
  const baseId = useId();

  if (services.length === 0) return null;

  function toggle(s: UnitService) {
    const next = { ...selected };
    if (next[s.id]) delete next[s.id];
    else next[s.id] = 1;
    onChange(next);
  }

  function setQty(s: UnitService, qty: number) {
    onChange({ ...selected, [s.id]: Math.min(maxQuantityFor(s), Math.max(1, qty)) });
  }

  return (
    <fieldset className="flex flex-col">
      <legend className="font-mono text-[10px] uppercase tracking-[0.1em] text-mute mb-2">
        {t('pickerTitle')}
      </legend>

      {services.map((s) => {
        const id      = `${baseId}-${s.id}`;
        const checked = Boolean(selected[s.id]);
        const qty     = selected[s.id] ?? 1;
        const max     = maxQuantityFor(s);
        const stepper = checked && max > 1;

        return (
          <div key={s.id} className="flex items-center gap-3 border-t border-rule first-of-type:border-t-0">
            <label htmlFor={id} className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 py-2">
              <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s)}
                  className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[6px] border border-rule bg-white transition-colors duration-[240ms] checked:border-ink checked:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                />
                <Check className="pointer-events-none relative h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink leading-snug">{s.name}</span>
                <span className="block text-xs text-mute tabular-nums">
                  {t(`price.${s.pricing_unit}`, { price: formatServiceUsd(s.price_usd) })}
                </span>
              </span>
            </label>

            {stepper && (
              <div className="flex items-center" role="group" aria-label={t('quantityFor', { name: s.name })}>
                <button
                  type="button"
                  onClick={() => setQty(s, qty - 1)}
                  disabled={qty <= 1}
                  aria-label={t('decrease')}
                  className="group flex h-11 w-9 items-center justify-center disabled:cursor-not-allowed"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rule text-ink-soft transition-colors duration-[240ms] group-hover:bg-paper-warm group-disabled:opacity-30">
                    <Minus className="h-3 w-3" />
                  </span>
                </button>
                <span className="w-5 text-center text-sm font-semibold text-ink tabular-nums" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(s, qty + 1)}
                  disabled={qty >= max}
                  aria-label={t('increase')}
                  className="group flex h-11 w-9 items-center justify-center disabled:cursor-not-allowed"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rule text-ink-soft transition-colors duration-[240ms] group-hover:bg-paper-warm group-disabled:opacity-30">
                    <Plus className="h-3 w-3" />
                  </span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

interface ExtrasLineProps {
  /** quote_unit_services().total_usd, or null while there is nothing to show. */
  totalUsd: number | null;
  pending:  boolean;
}

/**
 * The live "Extras" figure for the ticked services. The selection travels to
 * checkout in the URL, where the database prices it into the booking total.
 */
export function ExtrasLine({ totalUsd, pending }: ExtrasLineProps) {
  const t = useTranslations('unit.services');
  if (totalUsd === null || totalUsd <= 0) return null;
  return (
    <p className={`flex items-baseline justify-between gap-3 text-sm transition-opacity duration-[240ms] ${pending ? 'opacity-50' : ''}`}>
      <span className="text-ink-soft">{t('extrasLine')}</span>
      <span className="font-semibold text-ink tabular-nums">{formatServiceUsd(totalUsd)}</span>
    </p>
  );
}
