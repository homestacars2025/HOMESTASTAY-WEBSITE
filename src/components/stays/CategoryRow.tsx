import { Link } from '@/i18n/navigation';
import { CategoryIcon, ExternalArrow } from '@/components/home/CategoryIcon';
import type { Category } from '@/lib/stays/categories';

/**
 * The category chips — All · Apartment · Cabin · Villa · Hotels — and, after a
 * thin divider, Cars (Homesta Cars, a new tab). Presentational only, shared by
 * the homepage and /stays so the two can never drift:
 *
 *   homepage → each chip is a LINK to /stays?type=… (a navigation is the point);
 *   /stays   → each chip is a BUTTON that filters in place (onSelect), no request.
 *
 * Horizontally scrollable on a phone, centred when it fits; RTL comes from the
 * document direction. The active chip is brand red. Hidden chips (zero units
 * in the current search) are simply not passed in.
 */
export type ChipKey = 'all' | Category;

export interface ChipItem {
  key: ChipKey;
  label: string;
  /** Homepage mode: where the chip goes. */
  href?: string;
}

const ICON: Record<ChipKey, string> = {
  all: 'all',
  apartment: 'apartment',
  cabin: 'cabin',
  villa: 'villa',
  hotels: 'hotel',
};

const CARS_URL = 'https://homestacars.com';

const chipClass = (active: boolean) =>
  `flex flex-col items-center gap-1.5 min-w-14 px-1.5 py-2.5 transition-colors duration-[240ms] ${
    active ? 'text-stay' : 'text-mute hover:text-ink'
  }`;

function Label({ text, active }: { text: string; active: boolean }) {
  return (
    <span className={`font-mono text-[10px] uppercase tracking-[0.09em] leading-none whitespace-nowrap ${active ? 'font-medium' : 'font-normal'}`}>
      {text}
    </span>
  );
}

export function CategoryRow({
  items,
  active,
  onSelect,
  ariaLabel,
  carsLabel,
  newTabLabel,
}: {
  items: ChipItem[];
  active: ChipKey;
  /** /stays mode: filter in place. Omit on the homepage (links). */
  onSelect?: (key: ChipKey) => void;
  ariaLabel: string;
  carsLabel: string;
  newTabLabel: string;
}) {
  return (
    <div className="overflow-x-auto scrollbar-none px-4 pb-2">
      <nav aria-label={ariaLabel} className="flex flex-row flex-nowrap items-center gap-1 sm:gap-3 w-max mx-auto">
        {items.map((item) => {
          const isActive = item.key === active;
          const body = (
            <>
              <CategoryIcon name={ICON[item.key]} size={28} />
              <Label text={item.label} active={isActive} />
            </>
          );
          return onSelect ? (
            <button
              key={item.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(item.key)}
              className={chipClass(isActive)}
            >
              {body}
            </button>
          ) : (
            <Link
              key={item.key}
              href={item.href ?? '/stays'}
              aria-current={isActive ? 'true' : undefined}
              className={chipClass(isActive)}
            >
              {body}
            </Link>
          );
        })}

        <span className="mx-1 h-10 w-px shrink-0 bg-rule sm:mx-2" aria-hidden="true" />
        <a href={CARS_URL} target="_blank" rel="noopener" className={chipClass(false)}>
          <CategoryIcon name="car" size={28} />
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.09em] leading-none whitespace-nowrap">
            {carsLabel}
            <ExternalArrow />
            <span className="sr-only">{newTabLabel}</span>
          </span>
        </a>
      </nav>
    </div>
  );
}
